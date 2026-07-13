module.exports = function appDelegate(app, database) {
    require("./api/health")(app, database);
    require("./api/encoding")(app, database);
};
