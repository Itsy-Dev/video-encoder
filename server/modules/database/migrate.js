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

        try {
            await database.withTransaction(async executor => {
                await executor.query(sql);
                await executor.query(
                    `INSERT INTO \`${MIGRATIONS_TABLE}\` (\`filename\`) VALUES (?)`,
                    [file]
                );
            });
        }
        catch (error) {
            throw error;
        }
    }
}

async function ensureMigrationsTable(database) {
    await database.query(`
        CREATE TABLE IF NOT EXISTS \`${MIGRATIONS_TABLE}\` (
            \`id\` INTEGER PRIMARY KEY AUTOINCREMENT,
            \`filename\` TEXT NOT NULL UNIQUE,
            \`applied_at\` TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
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
