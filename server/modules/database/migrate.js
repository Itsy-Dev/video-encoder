const fs = require("fs");
const path = require("path");

const MIGRATIONS_TABLE = "encoder_schema_migration";

async function runMigrations(database) {
    await ensureMigrationsTable(database);

    const migrationsDir = path.join(__dirname, "migrations");
    const files = await fs.promises.readdir(migrationsDir).catch(() => []);
    const migrationFiles = files
        .filter(file => file.endsWith(".sql"))
        .sort((a, b) => a.localeCompare(b));

    for (const file of migrationFiles) {
        const alreadyApplied = await hasMigration(database, file);
        if (alreadyApplied) continue;

        const sql = await fs.promises.readFile(path.join(migrationsDir, file), "utf8");
        if (!sql.trim()) continue;

        await database.query("START TRANSACTION");
        try {
            await database.query(sql);
            await database.query(
                `INSERT INTO \`${MIGRATIONS_TABLE}\` (\`filename\`) VALUES (?)`,
                [file]
            );
            await database.query("COMMIT");
        }
        catch (error) {
            await database.query("ROLLBACK").catch(() => {});
            throw error;
        }
    }
}

async function ensureMigrationsTable(database) {
    await database.query(`
        CREATE TABLE IF NOT EXISTS \`${MIGRATIONS_TABLE}\` (
            \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            \`filename\` VARCHAR(255) NOT NULL,
            \`applied_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (\`id\`),
            UNIQUE KEY \`uq_${MIGRATIONS_TABLE}_filename\` (\`filename\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
}

async function hasMigration(database, filename) {
    const { results } = await database.query(
        `SELECT \`id\` FROM \`${MIGRATIONS_TABLE}\` WHERE \`filename\` = ? LIMIT 1`,
        [filename]
    );
    return Array.isArray(results) && results.length > 0;
}

module.exports = {
    runMigrations
};
