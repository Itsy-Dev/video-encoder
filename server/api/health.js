module.exports = function healthApi(app) {
    app.get("/api/health", function (_req, res) {
        res.json({
            ok: true,
            service: "encoder",
            now: new Date().toISOString()
        });
    });
};
