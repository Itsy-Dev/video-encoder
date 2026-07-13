module.exports = function appDelegate(app) {
    require("./api/health")(app);
    require("./api/encoding")(app);
};
