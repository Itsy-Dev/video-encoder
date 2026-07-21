const net = require("net");

async function reservePort(port) {
    const requestedPort = Number(port);
    if (!Number.isInteger(requestedPort) || requestedPort <= 0) {
        return {
            port,
            release: async function noop() {}
        };
    }

    const server = net.createServer();

    await new Promise((resolve, reject) => {
        server.once("error", error => {
            if (error && error.code === "EADDRINUSE") {
                reject(createPortInUseError(requestedPort, error));
                return;
            }

            reject(error);
        });

        server.listen(requestedPort, "::", resolve);
    });

    let released = false;
    return {
        port: requestedPort,
        release() {
            if (released) {
                return Promise.resolve();
            }
            released = true;
            return new Promise(resolve => {
                server.close(() => resolve());
            });
        }
    };
}

function createPortInUseError(port, cause) {
    const error = new Error(`Port ${port} is already in use. Refusing to start so the running encoder is not interrupted.`);
    error.code = "ENCODER_PORT_IN_USE";
    error.port = port;
    error.cause = cause;
    return error;
}

module.exports = {
    reservePort
};
