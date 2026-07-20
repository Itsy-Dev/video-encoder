const path = require("path");

require("dotenv").config({
    path: path.join(__dirname, "..", "..", ".env")
});

const { createDatabase } = require("../modules/database/sqlite");
const { runMigrations } = require("../modules/database/migrate");

async function main() {
    const database = createDatabase();

    try {
        await runMigrations(database);
        console.log("[MIGRATION] Encoder migrations applied successfully.");
    }
    finally {
        await database.close();
    }
}

main().catch(error => {
    console.error("[MIGRATION] Encoder migrations failed:", error);
    process.exit(1);
});
