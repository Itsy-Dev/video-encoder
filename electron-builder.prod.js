const basePackage = require("./package.json");
const { getProductionCurrentOutputDir } = require("./build-output-paths");

module.exports = {
    ...basePackage.build,
    directories: {
        ...basePackage.build.directories,
        output: getProductionCurrentOutputDir()
    }
};
