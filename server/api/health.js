module.exports = function healthApi(app, database) {
    app.get("/api/health", function (_req, res) {
        res.json({
            ok: true,
            service: "encoder",
            database: database ? "configured" : "missing",
            now: new Date().toISOString()
        });
    });
};
