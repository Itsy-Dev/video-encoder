const basePackage = require("./package.json");

module.exports = {
    ...basePackage.build,
    appId: "dev.itsy.videoencoder.dev",
    productName: "Video Encoder Dev",
    artifactName: "${productName}-${version}-${arch}.${ext}",
    directories: {
        ...basePackage.build.directories,
        output: "dist-dev"
    },
    extraMetadata: {
        name: "video-encoder-dev",
        productName: "Video Encoder Dev"
    },
    dmg: {
        ...basePackage.build.dmg,
        title: "Video Encoder Dev ${version}"
    }
};
