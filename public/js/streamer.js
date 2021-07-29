const localVideo = document.getElementById('local_video');
const stateSpan = document.getElementById('state_span');
let localStream = null;
let clientId = null;
let device = null;
let producerTransport = null;
let videoProducer = null;
let audioProducer = null;
let roomName = getRoomName();
if (roomName === null || typeof (roomName) === "undefined" || roomName === "") {
    throw new Error("Please enter room name exmalple: ?room=mrtri on url");
}


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

        socket.on('connect', async function (evt) {
            console.log('socket.io connected()');
            await sendRequest('prepare_room', { roomId: roomName });
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

// =========== Get audio and video local ========== 
async function startMedia() {
    if (localStream) {
        console.warn('WARN: local media ALREADY started');
        return;
    }
    const useVideo = true;
    const useAudio = true;

    return await navigator.mediaDevices.getUserMedia({ audio: useAudio, video: useVideo })
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
        const data = await sendRequest('getRouterRtpCapabilities', { roomName: roomName });
        console.log('getRouterRtpCapabilities:', data);
        await loadDevice(data);
    }
    // --- get transport info ---
    console.log('--- createProducerTransport --');
    const params = await sendRequest('createProducerTransport', { roomName: roomName });
    console.log('transport params:', params);
    producerTransport = device.createSendTransport(params);
    console.log('createSendTransport:', producerTransport);

    // --- join & start publish --
    producerTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
        console.log('--trasnport connect');
        sendRequest('connectProducerTransport', { dtlsParameters: dtlsParameters, roomName: roomName })
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
                roomName: roomName
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
// auto publish video stream
publish()