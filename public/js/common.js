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

// return Promise
function playVideo(element, stream) {
    if (element.srcObject) {
        console.warn('element ALREADY playing, so ignore');
        return;
    }
    element.srcObject = stream;
    element.volume = 0;
    return element.play();
}

function pauseVideo(element) {
    element.pause();
    element.srcObject = null;
}

async function loadDevice(routerRtpCapabilities) {
    try {
        device = new MediasoupClient.Device();
    } catch (error) {
        if (error.name === 'UnsupportedError') {
            console.error('browser not supported');
        }
    }
    await device.load({ routerRtpCapabilities });
}