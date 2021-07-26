module.exports.getId = function (socket) {
    return socket.id;
};

module.exports.getClientCount = function () {
    // WARN: undocumented method to get clients number
    return io.eio.clientsCount;
}
// --- send response to client ---
module.exports.sendResponse = function (response, callback) {
    //console.log('sendResponse() callback:', callback);
    callback(null, response);
}
// --- send error to client ---
module.exports.sendReject = function (error, callback) {
    callback(error.toString(), null);
}