module.exports.getId = function (socket) {
    return socket.id;
};

module.exports.getClientCount = function () {
    // WARN: undocumented method to get clients number
    return io.eio.clientsCount;
}