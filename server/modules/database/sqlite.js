const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const { getDefaultAppDataRoot } = require("../filesystem/handoff-paths");

const DEFAULT_DATABASE_FILENAME = "encoder.sqlite";

function createDatabase(options = {}) {
    const databasePath = path.resolve(options.databasePath || path.join(getDefaultAppDataRoot(), DEFAULT_DATABASE_FILENAME));
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });

    const connection = new DatabaseSync(databasePath);
    configureConnection(connection);

    return createExecutor(connection, { ownsConnection: true, databasePath });
}

function createExecutor(connection, { ownsConnection = false, databasePath = null } = {}) {
    return {
        connection,
        databasePath,
        query(sql, values = []) {
            return Promise.resolve(executeQuery(connection, sql, values));
        },
        async withTransaction(callback) {
            connection.exec("BEGIN IMMEDIATE");

            try {
                const result = await callback(createExecutor(connection, { ownsConnection: false, databasePath }));
                connection.exec("COMMIT");
                return result;
            }
            catch (error) {
                connection.exec("ROLLBACK");
                throw error;
            }
        },
        close() {
            if (ownsConnection) {
                connection.close();
            }

            return Promise.resolve();
        }
    };
}

function configureConnection(connection) {
    connection.exec(`
        PRAGMA foreign_keys = ON;
        PRAGMA journal_mode = WAL;
        PRAGMA busy_timeout = 5000;
    `);
}

function executeQuery(connection, sql, values = []) {
    const statement = String(sql || "").trim();
    const params = Array.isArray(values) ? values : [];

    if (!statement) {
        return {
            results: [],
            fields: []
        };
    }

    if (!stripSqlComments(statement).trim()) {
        return {
            results: [],
            fields: []
        };
    }

    if (!params.length && hasMultipleStatements(statement)) {
        connection.exec(statement);
        return {
            results: [],
            fields: []
        };
    }

    const prepared = connection.prepare(statement);

    if (isReadStatement(statement)) {
        return {
            results: prepared.all(...params),
            fields: []
        };
    }

    const result = prepared.run(...params);
    return {
        results: {
            affectedRows: Number(result.changes || 0),
            changes: Number(result.changes || 0),
            insertId: result.lastInsertRowid == null ? null : Number(result.lastInsertRowid),
            lastInsertRowid: result.lastInsertRowid
        },
        fields: []
    };
}

function hasMultipleStatements(statement) {
    return statement
        .split(";")
        .map(part => part.trim())
        .filter(Boolean)
        .length > 1;
}

function isReadStatement(statement) {
    return /^(SELECT|PRAGMA|WITH)\b/i.test(stripSqlComments(statement).trim());
}

function stripSqlComments(statement) {
    return String(statement || "")
        .split("\n")
        .filter(line => !line.trim().startsWith("--"))
        .join("\n");
}

module.exports = {
    createDatabase,
    DEFAULT_DATABASE_FILENAME
};
