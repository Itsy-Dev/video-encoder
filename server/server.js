const path = require("path");
const express = require("express");
const colors = require("colors");

require("dotenv").config({
    path: path.join(__dirname, "..", ".env")
});

colors.setTheme({
    good: "green",
    data: "brightCyan",
    warn: "yellow",
    error: "red"
});

const app = express();

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "..", "public")));

require("./app-delegate")(app);

const port = Number(process.env.ENCODER_PORT || 4300);
const server = app.listen(port, function () {
    const address = `http://localhost:${server.address().port}`;
    console.log(">>".good, "Encoder Server started at:", address.data);
});
