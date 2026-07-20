const path = require("path");
const fs = require("fs");
const fsp = fs.promises;

require("dotenv").config({
    path: path.join(__dirname, "..", "..", ".env")
});

const { createDatabase } = require("../modules/database/mysql");
const { getEncoderPaths } = require("../modules/filesystem/handoff-paths");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const LEGACY_INTERNAL_ROOT = path.join(REPO_ROOT, ".internal");
const OUTPUT_STATUSES = new Set(["review", "exported", "approved", "rejected"]);

async function main() {
    const execute = process.argv.includes("--execute");
    const database = createDatabase();

    try {
        const settings = await readStorageSettings(database);
        const paths = getEncoderPaths({
            inbox: settings.inboxRoot,
            outbox: settings.outboxRoot
        });

        const schema = await inspectSchema(database);
        assertRequiredSchema(schema);

        const { results: rows } = await database.query("SELECT * FROM encoding_item ORDER BY id ASC");
        const plan = await buildMigrationPlan(Array.isArray(rows) ? rows : [], paths, schema);

        printReport(plan, paths, execute);

        if (!execute) {
            console.log("[LEGACY STORAGE] Dry run only. Re-run with --execute to move files and update database.");
            return;
        }

        assertSafePlan(plan);
        await applyMigrationPlan(database, plan, schema);
        console.log("[LEGACY STORAGE] Migration completed successfully.");
    }
    finally {
        await database.close();
    }
}

async function readStorageSettings(database) {
    const { results } = await database.query(`
        SELECT setting_key, value_json
        FROM app_setting
        WHERE setting_key IN ('storage.inboxRoot', 'storage.outboxRoot')
    `);
    const settings = {
        inboxRoot: null,
        outboxRoot: null
    };

    for (const row of Array.isArray(results) ? results : []) {
        const value = parseSettingValue(row.value_json);
        if (row.setting_key === "storage.inboxRoot") {
            settings.inboxRoot = value;
        }
        if (row.setting_key === "storage.outboxRoot") {
            settings.outboxRoot = value;
        }
    }

    return settings;
}

function parseSettingValue(value) {
    if (value == null || value === "") return null;

    try {
        return JSON.parse(value);
    }
    catch (_error) {
        return value;
    }
}

async function inspectSchema(database) {
    return {
        encodingItem: await listColumns(database, "encoding_item"),
        encodingOutcome: await listColumns(database, "encoding_outcome"),
        encodingItemMetadata: await listColumns(database, "encoding_item_metadata")
    };
}

async function listColumns(database, tableName) {
    const { results } = await database.query(`SHOW COLUMNS FROM \`${tableName}\``);
    return new Set((Array.isArray(results) ? results : []).map(row => row.Field));
}

function assertRequiredSchema(schema) {
    const itemColumns = schema.encodingItem;
    const required = ["id", "original_filename", "input_abs_path", "inbox_relative_dir", "status"];
    const missing = required.filter(column => !itemColumns.has(column));

    if (missing.length) {
        throw new Error(`encoding_item is missing required columns: ${missing.join(", ")}`);
    }

    if (!itemColumns.has("output_abs_path") && !itemColumns.has("outbox_output_abs_path")) {
        throw new Error("encoding_item must have output_abs_path or legacy outbox_output_abs_path.");
    }
}

async function buildMigrationPlan(rows, paths, schema) {
    const moves = [];
    const updates = [];
    const warnings = [];
    const destinations = new Map();

    await fsp.mkdir(paths.inbox, { recursive: true });
    await fsp.mkdir(paths.outbox, { recursive: true });

    for (const row of rows) {
        const nextInputAbsPath = buildInboxPath(row, paths);
        const sourceCandidate = await firstExistingPath([
            row.input_abs_path,
            row.inbox_input_abs_path,
            nextInputAbsPath
        ]);
        const sourceMove = sourceCandidate && !samePath(sourceCandidate, nextInputAbsPath)
            ? await buildMove(sourceCandidate, nextInputAbsPath, `source:${row.id}`)
            : null;

        if (sourceMove) {
            reserveDestination(destinations, sourceMove, warnings);
            moves.push(sourceMove);
        }
        else if (!sourceCandidate && !(await pathExists(nextInputAbsPath))) {
            warnings.push(`Source missing for ${row.id}; DB will point to expected Inbox path: ${nextInputAbsPath}`);
        }

        const outputPlan = await buildOutputPlan(row, paths);
        if (outputPlan.move) {
            reserveDestination(destinations, outputPlan.move, warnings);
            moves.push(outputPlan.move);
        }
        else if (outputPlan.expectedAbsPath && !(await pathExists(outputPlan.expectedAbsPath))) {
            warnings.push(`Output missing for ${row.id}; DB will point to expected output path: ${outputPlan.expectedAbsPath}`);
        }

        updates.push({
            id: row.id,
            inputAbsPath: nextInputAbsPath,
            outputAbsPath: outputPlan.expectedAbsPath
        });
    }

    return {
        rows,
        moves,
        updates,
        warnings,
        schema,
        legacyInternalExists: await pathExists(LEGACY_INTERNAL_ROOT)
    };
}

function buildInboxPath(row, paths) {
    return path.join(
        paths.inbox,
        normalizeRelativeDir(row.inbox_relative_dir || inferRelativeDir(row.inbox_relative_path)),
        String(row.original_filename || path.basename(row.input_abs_path || "source")).trim()
    );
}

async function buildOutputPlan(row, paths) {
    const status = String(row.status || "").toLowerCase();
    const outputCandidate = await firstExistingPath([
        row.output_abs_path,
        row.outbox_output_abs_path,
        row.encoded_output_abs_path
    ]);
    const outputFilename = String(row.output_filename || path.basename(outputCandidate || "") || "").trim();

    if (!outputCandidate && !OUTPUT_STATUSES.has(status)) {
        return {
            expectedAbsPath: null,
            move: null
        };
    }

    if (!outputFilename) {
        return {
            expectedAbsPath: outputCandidate || null,
            move: null
        };
    }

    if (status === "rejected") {
        const rejectedDir = path.join(paths.outbox, "rejected", normalizeRelativeDir(row.inbox_relative_dir));
        const expectedAbsPath = outputCandidate && isInsideRoot(outputCandidate, rejectedDir)
            ? outputCandidate
            : await buildUniqueRejectedOutputPath(rejectedDir, outputCandidate || outputFilename);
        return {
            expectedAbsPath,
            move: outputCandidate && !samePath(outputCandidate, expectedAbsPath)
                ? await buildMove(outputCandidate, expectedAbsPath, `output:${row.id}`)
                : null
        };
    }

    const expectedAbsPath = path.join(paths.outbox, normalizeRelativeDir(row.inbox_relative_dir), outputFilename);
    return {
        expectedAbsPath,
        move: outputCandidate && !samePath(outputCandidate, expectedAbsPath)
            ? await buildMove(outputCandidate, expectedAbsPath, `output:${row.id}`)
            : null
    };
}

async function buildMove(sourceAbsPath, destinationAbsPath, label) {
    const destinationExists = await pathExists(destinationAbsPath);
    return {
        label,
        sourceAbsPath: path.resolve(sourceAbsPath),
        destinationAbsPath: path.resolve(destinationAbsPath),
        destinationExists
    };
}

function reserveDestination(destinations, move, warnings) {
    const key = normalizeComparePath(move.destinationAbsPath);
    const existing = destinations.get(key);

    if (existing) {
        warnings.push(`Destination conflict: ${move.label} and ${existing.label} both target ${move.destinationAbsPath}`);
        return;
    }

    destinations.set(key, move);
}

function assertSafePlan(plan) {
    const blockers = [];

    for (const move of plan.moves) {
        if (move.destinationExists) {
            blockers.push(`Refusing to overwrite existing file for ${move.label}: ${move.destinationAbsPath}`);
        }
    }

    for (const warning of plan.warnings) {
        if (warning.startsWith("Destination conflict:")) {
            blockers.push(warning);
        }
    }

    if (blockers.length) {
        throw new Error(`Unsafe migration plan:\n${blockers.join("\n")}`);
    }
}

async function applyMigrationPlan(database, plan, schema) {
    const completedMoves = [];

    try {
        for (const move of plan.moves) {
            await fsp.mkdir(path.dirname(move.destinationAbsPath), { recursive: true });
            await moveFile(move.sourceAbsPath, move.destinationAbsPath);
            completedMoves.push(move);
        }

        await database.withTransaction(async executor => {
            for (const update of plan.updates) {
                await updateEncodingItem(executor, schema.encodingItem, update);
                await updateMetadata(executor, update);
                await updateOutcomes(executor, schema.encodingOutcome, update);
            }
        });
    }
    catch (error) {
        await rollbackMoves(completedMoves);
        throw error;
    }
}

async function updateEncodingItem(database, columns, update) {
    const assignments = [];
    const values = [];

    addAssignment(assignments, values, columns, "input_abs_path", update.inputAbsPath);
    addAssignment(assignments, values, columns, "inbox_input_abs_path", update.inputAbsPath);
    addAssignment(assignments, values, columns, "output_abs_path", update.outputAbsPath);
    addAssignment(assignments, values, columns, "outbox_output_abs_path", update.outputAbsPath);
    addAssignment(assignments, values, columns, "encoded_output_abs_path", update.outputAbsPath);

    if (!assignments.length) return;

    values.push(update.id);
    await database.query(`
        UPDATE encoding_item
        SET ${assignments.join(", ")}
        WHERE id = ?
        LIMIT 1
    `, values);
}

async function updateMetadata(database, update) {
    await database.query(`
        UPDATE encoding_item_metadata
        SET abs_path = ?
        WHERE encoding_item_id = ? AND kind = 'source'
    `, [update.inputAbsPath, update.id]);

    if (update.outputAbsPath) {
        await database.query(`
            UPDATE encoding_item_metadata
            SET abs_path = ?
            WHERE encoding_item_id = ? AND kind = 'encoded'
        `, [update.outputAbsPath, update.id]);
    }
}

async function updateOutcomes(database, columns, update) {
    if (!update.outputAbsPath) return;

    const assignments = [];
    const values = [];

    addAssignment(assignments, values, columns, "output_abs_path", update.outputAbsPath);
    addAssignment(assignments, values, columns, "encoded_output_abs_path", update.outputAbsPath);

    if (!assignments.length) return;

    values.push(update.id);
    await database.query(`
        UPDATE encoding_outcome
        SET ${assignments.join(", ")}
        WHERE encoding_item_id = ?
    `, values);
}

function addAssignment(assignments, values, columns, columnName, value) {
    if (!columns.has(columnName)) return;
    assignments.push(`\`${columnName}\` = ?`);
    values.push(value);
}

async function rollbackMoves(completedMoves) {
    for (const move of completedMoves.slice().reverse()) {
        if (await pathExists(move.destinationAbsPath) && !(await pathExists(move.sourceAbsPath))) {
            await moveFile(move.destinationAbsPath, move.sourceAbsPath).catch(error => {
                console.error(`[LEGACY STORAGE] Failed to rollback ${move.destinationAbsPath}:`, error);
            });
        }
    }
}

async function moveFile(sourceAbsPath, destinationAbsPath) {
    try {
        await fsp.rename(sourceAbsPath, destinationAbsPath);
        return;
    }
    catch (error) {
        if (!error || error.code !== "EXDEV") {
            throw error;
        }
    }

    await fsp.copyFile(sourceAbsPath, destinationAbsPath);
    await fsp.unlink(sourceAbsPath);
}

async function firstExistingPath(candidates) {
    for (const candidate of candidates) {
        if (!candidate || !path.isAbsolute(String(candidate))) continue;
        const resolved = path.resolve(String(candidate));
        if (await pathExists(resolved)) {
            return resolved;
        }
    }

    return null;
}

async function buildUniqueRejectedOutputPath(rejectedDirAbs, outputAbsPath) {
    const ext = path.extname(outputAbsPath || "");
    const base = path.basename(outputAbsPath || "output", ext);

    for (let index = 1; index < Number.MAX_SAFE_INTEGER; index += 1) {
        const candidate = path.join(rejectedDirAbs, `${base}_rejected_${index}${ext}`);
        if (!await pathExists(candidate)) {
            return candidate;
        }
    }

    throw new Error(`Unable to find an available rejected output path in ${rejectedDirAbs}`);
}

async function pathExists(targetAbsPath) {
    try {
        await fsp.access(targetAbsPath, fs.constants.F_OK);
        return true;
    }
    catch (_error) {
        return false;
    }
}

function printReport(plan, paths, execute) {
    console.log(`[LEGACY STORAGE] Mode: ${execute ? "EXECUTE" : "DRY RUN"}`);
    console.log(`[LEGACY STORAGE] Inbox: ${paths.inbox}`);
    console.log(`[LEGACY STORAGE] Outbox: ${paths.outbox}`);
    console.log(`[LEGACY STORAGE] Rows inspected: ${plan.rows.length}`);
    console.log(`[LEGACY STORAGE] File moves planned: ${plan.moves.length}`);
    console.log(`[LEGACY STORAGE] DB rows planned: ${plan.updates.length}`);

    if (plan.legacyInternalExists) {
        console.log(`[LEGACY STORAGE] Legacy .internal detected: ${LEGACY_INTERNAL_ROOT}`);
    }

    for (const warning of plan.warnings) {
        console.warn(`[LEGACY STORAGE] Warning: ${warning}`);
    }

    for (const move of plan.moves) {
        console.log(`[LEGACY STORAGE] Move ${move.label}:`);
        console.log(`  from: ${move.sourceAbsPath}`);
        console.log(`  to:   ${move.destinationAbsPath}`);
    }
}

function inferRelativeDir(inboxRelativePath) {
    const value = String(inboxRelativePath || "").trim().replace(/\\/g, "/");
    if (!value) return "";
    const dir = path.posix.dirname(value);
    return dir === "." ? "" : dir;
}

function normalizeRelativeDir(value) {
    const next = String(value || "").trim().replace(/\\/g, "/");
    if (!next || next === ".") return "";

    const cleaned = next.replace(/^\/+|\/+$/g, "");
    const parts = cleaned.split("/").filter(Boolean);
    if (parts.some(part => part === "." || part === "..")) {
        return "";
    }

    return parts.join("/");
}

function isInsideRoot(fileAbsPath, rootAbsPath) {
    const relative = path.relative(path.resolve(rootAbsPath), path.resolve(fileAbsPath));
    return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function samePath(leftPath, rightPath) {
    return normalizeComparePath(leftPath) === normalizeComparePath(rightPath);
}

function normalizeComparePath(value) {
    return path.resolve(String(value || "")).toLowerCase();
}

main().catch(error => {
    console.error("[LEGACY STORAGE] Migration failed:", error);
    process.exit(1);
});
