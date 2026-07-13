const path = require("path");

require("dotenv").config({
    path: path.join(__dirname, "..", "..", ".env")
});

const { createDatabase } = require("../modules/database/mysql");
const { runMigrations } = require("../modules/database/migrate");

async function main() {
    const database = createDatabase();

    try {
        await runMigrations(database);
        console.log("Encoder migrations applied successfully.");
    }
    finally {
        await database.close();
    }
}

main().catch(error => {
    console.error("Encoder migrations failed:", error);
    process.exit(1);
});
