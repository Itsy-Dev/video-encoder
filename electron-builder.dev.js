const basePackage = require("./package.json");
const { getDevOutputDir } = require("./build-output-paths");

module.exports = {
    ...basePackage.build,
    appId: "dev.itsy.videoencoder.dev",
    productName: "Video Encoder Dev",
    artifactName: "${productName}-${arch}.${ext}",
    directories: {
        ...basePackage.build.directories,
        output: getDevOutputDir()
    },
    extraMetadata: {
        name: "video-encoder-dev",
        productName: "Video Encoder Dev"
    },
    dmg: {
        ...basePackage.build.dmg,
        title: "Video Encoder Dev"
    }
};
