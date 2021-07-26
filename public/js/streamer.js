const localVideo = document.getElementById('local_video');
const stateSpan = document.getElementById('state_span');
let localStream = null;
let clientId = null;
let device = null;
let producerTransport = null;
let videoProducer = null;
let audioProducer = null;


// =========== socket.io ========== 
let socket = null;
// return Promise
function connectSocket() {
    if (socket) {
        socket.close();
        socket = null;
        clientId = null;
    }

    return new Promise((resolve, reject) => {
        socket = io.connect('/');

        socket.on('connect', function (evt) {
            console.log('socket.io connected()');
        });
        socket.on('error', function (err) {
            console.error('socket.io ERROR:', err);
            reject(err);
        });
        socket.on('disconnect', function (evt) {
            console.log('socket.io disconnect:', evt);
        });
        socket.on('message', function (message) {
            console.log('socket.io message:', message);
            if (message.type === 'welcome') {
                if (socket.id !== message.id) {
                    console.warn('WARN: something wrong with clientID', socket.io, message.id);
                }

                clientId = message.id;
                console.log('connected to server. clientId=' + clientId);
                resolve();
            }
            else {
                console.error('UNKNOWN message from server:', message);
            }
        });
        socket.on('newProducer', async function (message) {
            console.warn('IGNORE socket.io newProducer:', message);
        });
    });
}
// =========== media handling ========== 
function stopLocalStream(stream) {
    let tracks = stream.getTracks();
    if (!tracks) {
        console.warn('NO tracks');
        return;
    }

    tracks.forEach(track => track.stop());
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
// =========== Get audio and video local ========== 
async function startMedia() {
    if (localStream) {
        console.warn('WARN: local media ALREADY started');
        return;
    }
    const useVideo = true;
    const useAudio = true;

    return await navigator.mediaDevices.getUserMedia({ audio: useAudio, video: useVideo })
    // .then((stream) => {
    //     localStream = stream;
    //     playVideo(localVideo, localStream);
    // })
    // .catch(err => {
    //     console.error('media ERROR:', err);
    // });

}
function stopMedia() {
    if (localStream) {
        pauseVideo(localVideo);
        stopLocalStream(localStream);
        localStream = null;
    }
}
// =========== Public stream ========== 
async function publish() {
    localStream = await startMedia();
    playVideo(localVideo, localStream);
    if (!isSocketConnected()) {
        connectSocket().catch(err => {
            console.error(err);
            return;
        });
        // --- get capabilities --
        const data = await sendRequest('getRouterRtpCapabilities', {});
        console.log('getRouterRtpCapabilities:', data);
        await loadDevice(data);
    }
    // --- get transport info ---
    console.log('--- createProducerTransport --');
    const params = await sendRequest('createProducerTransport', {});
    console.log('transport params:', params);
    producerTransport = device.createSendTransport(params);
    console.log('createSendTransport:', producerTransport);

    // --- join & start publish --
    producerTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
        console.log('--trasnport connect');
        sendRequest('connectProducerTransport', { dtlsParameters: dtlsParameters })
            .then(callback)
            .catch(errback);
    });
    producerTransport.on('produce', async ({ kind, rtpParameters }, callback, errback) => {
        console.log('--trasnport produce');
        try {
            const { id } = await sendRequest('produce', {
                transportId: producerTransport.id,
                kind,
                rtpParameters,
            });
            callback({ id });
        } catch (err) {
            errback(err);
        }
    });
    producerTransport.on('connectionstatechange', (state) => {
        switch (state) {
            case 'connecting':
                console.log('publishing...');
                break;

            case 'connected':
                console.log('published');
                break;

            case 'failed':
                console.log('failed');
                producerTransport.close();
                break;

            default:
                break;
        }
    });

    const useVideo = true;
    const useAudio = true;
    if (useVideo) {
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
            const trackParams = { track: videoTrack };
            videoProducer = await producerTransport.produce(trackParams);
        }
    }
    if (useAudio) {
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
            const trackParams = { track: audioTrack };
            audioProducer = await producerTransport.produce(trackParams);
        }
    }


}
function disconnect() {
    if (localStream) {
        pauseVideo(localVideo);
        stopLocalStream(localStream);
        localStream = null;
    }
    if (videoProducer) {
        videoProducer.close(); // localStream will stop
        videoProducer = null;
    }
    if (audioProducer) {
        audioProducer.close(); // localStream will stop
        audioProducer = null;
    }
    if (producerTransport) {
        producerTransport.close(); // localStream will stop
        producerTransport = null;
    }

    disconnectSocket();
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
publish()