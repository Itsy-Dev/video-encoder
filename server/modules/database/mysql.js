const mysql = require("mysql");

function createDatabase() {
    const pool = mysql.createPool({
        host: process.env.ENCODER_DB_HOST || "127.0.0.1",
        port: Number(process.env.ENCODER_DB_PORT || 3306),
        user: process.env.ENCODER_DB_USER || "root",
        password: process.env.ENCODER_DB_PASSWORD || "",
        database: process.env.ENCODER_DB_NAME || "encoder",
        charset: process.env.ENCODER_DB_CHARSET || "utf8mb4_unicode_ci",
        waitForConnections: true,
        connectionLimit: Number(process.env.ENCODER_DB_CONNECTION_LIMIT || 10),
        queueLimit: 0,
        multipleStatements: true
    });

    return {
        pool,
        query(sql, values = []) {
            return new Promise((resolve, reject) => {
                pool.query(sql, values, function onQuery(error, results, fields) {
                    if (error) return reject(error);
                    resolve({ results, fields });
                });
            });
        },
        withTransaction(callback) {
            return new Promise((resolve, reject) => {
                pool.getConnection(function onConnection(error, connection) {
                    if (error) return reject(error);

                    const executor = {
                        query(sql, values = []) {
                            return new Promise((resolveQuery, rejectQuery) => {
                                connection.query(sql, values, function onQuery(queryError, results, fields) {
                                    if (queryError) return rejectQuery(queryError);
                                    resolveQuery({ results, fields });
                                });
                            });
                        }
                    };

                    connection.beginTransaction(async function onBegin(beginError) {
                        if (beginError) {
                            connection.release();
                            return reject(beginError);
                        }

                        try {
                            const result = await callback(executor);
                            connection.commit(function onCommit(commitError) {
                                connection.release();
                                if (commitError) return reject(commitError);
                                resolve(result);
                            });
                        }
                        catch (callbackError) {
                            connection.rollback(function onRollback() {
                                connection.release();
                                reject(callbackError);
                            });
                        }
                    });
                });
            });
        },
        close() {
            return new Promise((resolve, reject) => {
                pool.end(function onClose(error) {
                    if (error) return reject(error);
                    resolve();
                });
            });
        }
    };
}

module.exports = {
    createDatabase
};
