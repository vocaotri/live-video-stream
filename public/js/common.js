function isSocketConnected() {
    if (socket) {
        return true;
    }
    else {
        return false;
    }
}

function sendRequest(type, data) {
    return new Promise((resolve, reject) => {
        socket.emit(type, data, (err, response) => {
            if (!err) {
                // Success response, so pass the mediasoup response to the local Room.
                resolve(response);
            } else {
                reject(err);
            }
        });
    });
}

function disconnectSocket() {
    if (socket) {
        socket.close();
        socket = null;
        clientId = null;
        console.log('socket.io closed..');
    }
}