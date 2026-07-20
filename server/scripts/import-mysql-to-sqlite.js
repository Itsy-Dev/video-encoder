const path = require("path");
const fs = require("fs");
const fsp = fs.promises;

const ENV_PATH = path.join(__dirname, "..", "..", ".env");
const dotenvResult = require("dotenv").config({ path: ENV_PATH });

const mysql = require("mysql");
const { runMigrations } = require("../modules/database/migrate");
const { getDefaultAppDataRoot } = require("../modules/filesystem/handoff-paths");

const DEFAULT_DATABASE_FILENAME = "encoder.sqlite";
const TABLES = ["encoding_item", "encoding_item_metadata", "encoding_outcome", "app_setting"];

async function main() {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
        printHelp();
        return;
    }

    assertNodeSqliteAvailable();

    const execute = Boolean(options.execute);
    const replace = Boolean(options.replace);
    const sqlitePath = path.resolve(options.sqlitePath || path.join(getDefaultAppDataRoot(), DEFAULT_DATABASE_FILENAME));

    const mysqlConfig = getMysqlConfig();
    printConnectionConfig(mysqlConfig);
    const mysqlDb = createMysqlDatabase(mysqlConfig);

    try {
        const mysqlSchema = await inspectMysqlSchema(mysqlDb);
        const rows = await readMysqlRows(mysqlDb);
        const plan = buildImportPlan(rows, mysqlSchema);

        printReport(plan, sqlitePath, { execute, replace });

        if (!execute) {
            console.log("[MYSQL->SQLITE] Dry run only. Re-run with --execute to import history.");
            return;
        }

        if (replace) {
            await removeSqliteDatabase(sqlitePath);
        }

        await assertSqliteCanImport(sqlitePath);

        const sqliteDb = createSqliteDatabase({ databasePath: sqlitePath });
        try {
            await runMigrations(sqliteDb);
            await assertSqliteEmpty(sqliteDb);
            await importRows(sqliteDb, plan);
            await verifyCounts(sqliteDb, plan);
        }
        finally {
            await sqliteDb.close();
        }

        console.log("[MYSQL->SQLITE] Import completed successfully.");
    }
    finally {
        await mysqlDb.close();
    }
}

function getMysqlConfig() {
    return {
        host: envValue("ENCODER_MYSQL_HOST", "ENCODER_DB_HOST", "MYSQL_HOST", "DB_HOST") || "127.0.0.1",
        port: Number(envValue("ENCODER_MYSQL_PORT", "ENCODER_DB_PORT", "MYSQL_PORT", "DB_PORT") || 3306),
        user: envValue("ENCODER_MYSQL_USER", "ENCODER_DB_USER", "MYSQL_USER", "DB_USER") || "root",
        password: envValue("ENCODER_MYSQL_PASSWORD", "ENCODER_DB_PASSWORD", "MYSQL_PASSWORD", "DB_PASSWORD") || "",
        database: envValue("ENCODER_MYSQL_DATABASE", "ENCODER_DB_NAME", "MYSQL_DATABASE", "DB_DATABASE", "DB_NAME") || "encoder",
        charset: envValue("ENCODER_MYSQL_CHARSET", "ENCODER_DB_CHARSET", "MYSQL_CHARSET", "DB_CHARSET") || "utf8mb4_unicode_ci"
    };
}

function createMysqlDatabase(mysqlConfig) {
    const pool = mysql.createPool({
        ...mysqlConfig,
        connectionLimit: 2
    });

    return {
        query(sql, values = []) {
            return new Promise((resolve, reject) => {
                pool.query(sql, values, function onQuery(error, results) {
                    if (error) return reject(error);
                    resolve(Array.isArray(results) ? results : []);
                });
            });
        },
        close() {
            return new Promise((resolve, reject) => {
                pool.end(error => error ? reject(error) : resolve());
            });
        }
    };
}

async function inspectMysqlSchema(mysqlDb) {
    const schema = {};
    for (const table of TABLES) {
        schema[table] = new Set((await mysqlDb.query(`SHOW COLUMNS FROM \`${table}\``)).map(row => row.Field));
    }
    return schema;
}

async function readMysqlRows(mysqlDb) {
    const rows = {};
    for (const table of TABLES) {
        rows[table] = await mysqlDb.query(`SELECT * FROM \`${table}\``);
    }
    return rows;
}

function buildImportPlan(rows, schema) {
    return {
        encodingItems: rows.encoding_item.map(row => mapEncodingItem(row, schema.encoding_item)),
        metadata: rows.encoding_item_metadata.map(mapMetadata),
        outcomes: rows.encoding_outcome.map(row => mapOutcome(row, schema.encoding_outcome)),
        settings: rows.app_setting.map(mapSetting)
    };
}

function mapEncodingItem(row, columns) {
    return {
        id: row.id,
        status: row.status || "pending",
        original_filename: row.original_filename || "",
        input_abs_path: firstValue(row.input_abs_path, row.inbox_input_abs_path),
        inbox_relative_dir: firstValue(row.inbox_relative_dir, inferRelativeDir(row.inbox_relative_path), ""),
        profile_id: nullIfEmpty(row.profile_id),
        output_filename: nullIfEmpty(row.output_filename),
        output_abs_path: firstValue(
            hasColumn(columns, "output_abs_path") ? row.output_abs_path : null,
            row.outbox_output_abs_path,
            row.encoded_output_abs_path,
            null
        ),
        last_error: nullIfEmpty(row.last_error),
        attempt_count: numberOrZero(row.attempt_count),
        requested_at: toIsoOrNull(row.requested_at),
        queued_at: toIsoOrNull(row.queued_at),
        queue_position: numberOrNull(row.queue_position),
        encoding_started_at: toIsoOrNull(row.encoding_started_at),
        paused_at: toIsoOrNull(row.paused_at),
        completed_at: toIsoOrNull(row.completed_at),
        approved_at: toIsoOrNull(row.approved_at),
        rejected_at: toIsoOrNull(row.rejected_at),
        created_at: toIsoOrNull(row.created_at) || new Date().toISOString(),
        updated_at: toIsoOrNull(row.updated_at) || new Date().toISOString()
    };
}

function mapMetadata(row) {
    return {
        encoding_item_id: row.encoding_item_id,
        kind: row.kind,
        abs_path: row.abs_path || "",
        file_size_bytes: numberOrNull(row.file_size_bytes),
        duration_ms: numberOrNull(row.duration_ms),
        container: nullIfEmpty(row.container),
        video_codec: nullIfEmpty(row.video_codec),
        audio_codec: nullIfEmpty(row.audio_codec),
        width: numberOrNull(row.width),
        height: numberOrNull(row.height),
        frame_rate: numberOrNull(row.frame_rate),
        bit_rate: numberOrNull(row.bit_rate),
        probe_json: row.probe_json == null ? null : String(row.probe_json),
        probed_at: toIsoOrNull(row.probed_at),
        created_at: toIsoOrNull(row.created_at) || new Date().toISOString(),
        updated_at: toIsoOrNull(row.updated_at) || new Date().toISOString()
    };
}

function mapOutcome(row, columns) {
    return {
        encoding_item_id: row.encoding_item_id,
        attempt_number: numberOrZero(row.attempt_number),
        profile_id: row.profile_id || "",
        requested_at: toIsoOrNull(row.requested_at),
        queued_at: toIsoOrNull(row.queued_at),
        encoding_started_at: toIsoOrNull(row.encoding_started_at),
        encoding_finished_at: toIsoOrNull(row.encoding_finished_at),
        active_encoding_ms: numberOrNull(row.active_encoding_ms),
        paused_ms: numberOrZero(row.paused_ms),
        wall_clock_ms: numberOrNull(row.wall_clock_ms),
        source_duration_ms: numberOrNull(row.source_duration_ms),
        source_file_size_bytes: numberOrNull(row.source_file_size_bytes),
        source_width: numberOrNull(row.source_width),
        source_height: numberOrNull(row.source_height),
        source_frame_rate: numberOrNull(row.source_frame_rate),
        source_bit_rate: numberOrNull(row.source_bit_rate),
        source_video_codec: nullIfEmpty(row.source_video_codec),
        source_audio_codec: nullIfEmpty(row.source_audio_codec),
        source_container: nullIfEmpty(row.source_container),
        source_probe_json: row.source_probe_json == null ? null : String(row.source_probe_json),
        output_file_size_bytes: numberOrNull(row.output_file_size_bytes),
        output_duration_ms: numberOrNull(row.output_duration_ms),
        output_width: numberOrNull(row.output_width),
        output_height: numberOrNull(row.output_height),
        output_frame_rate: numberOrNull(row.output_frame_rate),
        output_bit_rate: numberOrNull(row.output_bit_rate),
        output_video_codec: nullIfEmpty(row.output_video_codec),
        output_audio_codec: nullIfEmpty(row.output_audio_codec),
        output_container: nullIfEmpty(row.output_container),
        output_probe_json: row.output_probe_json == null ? null : String(row.output_probe_json),
        size_delta_bytes: numberOrNull(row.size_delta_bytes),
        size_delta_percent: numberOrNull(row.size_delta_percent),
        bitrate_delta_bps: numberOrNull(row.bitrate_delta_bps),
        bitrate_delta_percent: numberOrNull(row.bitrate_delta_percent),
        output_abs_path: firstValue(
            hasColumn(columns, "output_abs_path") ? row.output_abs_path : null,
            row.encoded_output_abs_path,
            null
        ),
        created_at: toIsoOrNull(row.created_at) || new Date().toISOString()
    };
}

function mapSetting(row) {
    return {
        setting_key: row.setting_key,
        value_json: row.value_json == null ? "null" : String(row.value_json),
        created_at: toIsoOrNull(row.created_at) || new Date().toISOString(),
        updated_at: toIsoOrNull(row.updated_at) || new Date().toISOString()
    };
}

async function assertSqliteCanImport(sqlitePath) {
    if (!fs.existsSync(sqlitePath)) return;

    const sqliteDb = createSqliteDatabase({ databasePath: sqlitePath });
    try {
        await runMigrations(sqliteDb);
        await assertSqliteEmpty(sqliteDb);
    }
    finally {
        await sqliteDb.close();
    }
}

async function assertSqliteEmpty(sqliteDb) {
    const counts = await readSqliteCounts(sqliteDb);
    const nonEmpty = Object.entries(counts).filter(([, count]) => count > 0);
    if (nonEmpty.length) {
        throw new Error(`SQLite database already contains data: ${nonEmpty.map(([table, count]) => `${table}=${count}`).join(", ")}. Re-run with --replace to recreate it.`);
    }
}

async function importRows(sqliteDb, plan) {
    await sqliteDb.withTransaction(async db => {
        await insertMany(db, "encoding_item", [
            "id", "status", "original_filename", "input_abs_path", "inbox_relative_dir", "profile_id",
            "output_filename", "output_abs_path", "last_error", "attempt_count", "requested_at", "queued_at",
            "queue_position", "encoding_started_at", "paused_at", "completed_at", "approved_at", "rejected_at",
            "created_at", "updated_at"
        ], plan.encodingItems);

        await insertMany(db, "encoding_item_metadata", [
            "encoding_item_id", "kind", "abs_path", "file_size_bytes", "duration_ms", "container",
            "video_codec", "audio_codec", "width", "height", "frame_rate", "bit_rate", "probe_json",
            "probed_at", "created_at", "updated_at"
        ], plan.metadata);

        await insertMany(db, "encoding_outcome", [
            "encoding_item_id", "attempt_number", "profile_id", "requested_at", "queued_at",
            "encoding_started_at", "encoding_finished_at", "active_encoding_ms", "paused_ms",
            "wall_clock_ms", "source_duration_ms", "source_file_size_bytes", "source_width",
            "source_height", "source_frame_rate", "source_bit_rate", "source_video_codec",
            "source_audio_codec", "source_container", "source_probe_json", "output_file_size_bytes",
            "output_duration_ms", "output_width", "output_height", "output_frame_rate",
            "output_bit_rate", "output_video_codec", "output_audio_codec", "output_container",
            "output_probe_json", "size_delta_bytes", "size_delta_percent", "bitrate_delta_bps",
            "bitrate_delta_percent", "output_abs_path", "created_at"
        ], plan.outcomes);

        await insertMany(db, "app_setting", [
            "setting_key", "value_json", "created_at", "updated_at"
        ], plan.settings);
    });
}

async function insertMany(db, tableName, columns, rows) {
    if (!rows.length) return;

    const placeholders = columns.map(() => "?").join(", ");
    const sql = `
        INSERT INTO \`${tableName}\` (${columns.map(column => `\`${column}\``).join(", ")})
        VALUES (${placeholders})
    `;

    for (const row of rows) {
        await db.query(sql, columns.map(column => row[column]));
    }
}

async function verifyCounts(sqliteDb, plan) {
    const counts = await readSqliteCounts(sqliteDb);
    const expected = {
        encoding_item: plan.encodingItems.length,
        encoding_item_metadata: plan.metadata.length,
        encoding_outcome: plan.outcomes.length,
        app_setting: plan.settings.length
    };
    const mismatches = Object.keys(expected).filter(table => counts[table] !== expected[table]);

    if (mismatches.length) {
        throw new Error(`Import count verification failed: ${mismatches.map(table => `${table} expected=${expected[table]} actual=${counts[table]}`).join(", ")}`);
    }
}

async function readSqliteCounts(sqliteDb) {
    const counts = {};
    for (const table of TABLES) {
        const { results } = await sqliteDb.query(`SELECT COUNT(*) AS count FROM \`${table}\``);
        counts[table] = Number(results[0] && results[0].count || 0);
    }
    return counts;
}

async function removeSqliteDatabase(sqlitePath) {
    for (const suffix of ["", "-wal", "-shm"]) {
        await fsp.rm(`${sqlitePath}${suffix}`, { force: true });
    }
}

function printConnectionConfig(mysqlConfig) {
    console.log(`[MYSQL->SQLITE] Env file: ${dotenvResult.error ? `${ENV_PATH} (not loaded)` : ENV_PATH}`);
    console.log(`[MYSQL->SQLITE] MySQL source: ${mysqlConfig.user}@${mysqlConfig.host}:${mysqlConfig.port}/${mysqlConfig.database}`);
}

function printReport(plan, sqlitePath, { execute, replace }) {
    console.log(`[MYSQL->SQLITE] Mode: ${execute ? "EXECUTE" : "DRY RUN"}`);
    console.log(`[MYSQL->SQLITE] SQLite target: ${sqlitePath}`);
    console.log(`[MYSQL->SQLITE] Replace existing SQLite: ${replace ? "yes" : "no"}`);
    console.log(`[MYSQL->SQLITE] encoding_item rows: ${plan.encodingItems.length}`);
    console.log(`[MYSQL->SQLITE] encoding_item_metadata rows: ${plan.metadata.length}`);
    console.log(`[MYSQL->SQLITE] encoding_outcome rows: ${plan.outcomes.length}`);
    console.log(`[MYSQL->SQLITE] app_setting rows: ${plan.settings.length}`);
}

function parseArgs(args) {
    const options = {};
    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];
        if (arg === "--help" || arg === "-h") options.help = true;
        else if (arg === "--execute") options.execute = true;
        else if (arg === "--replace") options.replace = true;
        else if (arg === "--sqlite-path") options.sqlitePath = args[++index];
    }
    return options;
}

function printHelp() {
    console.log(`Usage: npm run import:mysql-to-sqlite -- [options]

Options:
  --execute            Write imported rows into SQLite. Omit for dry run.
  --replace            Delete the target SQLite database before importing.
  --sqlite-path PATH   Override the default SQLite database path.
  --help               Show this help text.

MySQL connection environment loaded from ${ENV_PATH}:
  ENCODER_MYSQL_HOST       Also accepts ENCODER_DB_HOST, MYSQL_HOST, DB_HOST
  ENCODER_MYSQL_PORT       Also accepts ENCODER_DB_PORT, MYSQL_PORT, DB_PORT
  ENCODER_MYSQL_DATABASE   Also accepts ENCODER_DB_NAME, MYSQL_DATABASE, DB_DATABASE, DB_NAME
  ENCODER_MYSQL_USER       Also accepts ENCODER_DB_USER, MYSQL_USER, DB_USER
  ENCODER_MYSQL_PASSWORD   Also accepts ENCODER_DB_PASSWORD, MYSQL_PASSWORD, DB_PASSWORD
`);
}

function envValue(...names) {
    for (const name of names) {
        if (process.env[name] !== undefined && process.env[name] !== "") return process.env[name];
    }
    return null;
}

function hasColumn(columns, columnName) {
    return columns && columns.has(columnName);
}

function firstValue(...values) {
    for (const value of values) {
        if (value !== undefined && value !== null && value !== "") return value;
    }
    return null;
}

function nullIfEmpty(value) {
    return value == null || value === "" ? null : value;
}

function numberOrNull(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function numberOrZero(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}

function toIsoOrNull(value) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(String(value).replace(" ", "T"));
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function inferRelativeDir(inboxRelativePath) {
    const value = String(inboxRelativePath || "").trim().replace(/\\/g, "/");
    if (!value) return "";
    const dir = path.posix.dirname(value);
    return dir === "." ? "" : dir;
}

function createSqliteDatabase(options) {
    const { createDatabase } = require("../modules/database/sqlite");
    return createDatabase(options);
}

function assertNodeSqliteAvailable() {
    try {
        require("node:sqlite");
    }
    catch (error) {
        console.error("[MYSQL->SQLITE] This command requires Node 24.15.0 or newer with node:sqlite support.");
        console.error(`[MYSQL->SQLITE] Current node: ${process.version}`);
        console.error(`[MYSQL->SQLITE] Current path: ${process.execPath}`);
        console.error("[MYSQL->SQLITE] On macOS/Homebrew, run:");
        console.error("[MYSQL->SQLITE]   export PATH=\"/opt/homebrew/opt/node@24/bin:$PATH\"");
        process.exit(1);
    }
}

main().catch(error => {
    console.error("[MYSQL->SQLITE] Import failed:", error);
    process.exit(1);
});
