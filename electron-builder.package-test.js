const basePackage = require("./package.json");

module.exports = {
    ...basePackage.build,
    appId: "dev.itsy.videoencoder.package-test",
    productName: "Video Encoder Package Test",
    artifactName: "${productName}-${version}-${arch}.${ext}",
    directories: {
        ...basePackage.build.directories,
        output: "dist-package-test"
    },
    extraMetadata: {
        name: "video-encoder-package-test",
        productName: "Video Encoder Package Test"
    },
    dmg: {
        ...basePackage.build.dmg,
        title: "Video Encoder Package Test ${version}"
    }
};
