const remoteContainer = document.getElementById('remote_container');
const stateSpan = document.getElementById('state_span');
let localStream = null;
let clientId = null;
let device = null;
let consumerTransport = null;
let videoConsumer = null;
let audioConsumer = null;
let videoID = null;
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
            console.log('socket.io newProducer:', message);
            const kind = message.kind;
            if (consumerTransport) {
                // start consume
                if (message.kind === 'video') {
                    videoConsumer = await consumeAndResume(consumerTransport, kind);
                }
                else if (message.kind === 'audio') {
                    audioConsumer = await consumeAndResume(consumerTransport, kind);
                }
            }
        });

        socket.on('producerClosed', function (message) {
            console.log('socket.io producerClosed:', message);
            const localId = message.localId;
            const remoteId = message.remoteId;
            const kind = message.kind;
            console.log('--try removeConsumer remoteId=' + remoteId + ', localId=' + localId + ', kind=' + kind);
            if (kind === 'video') {
                if (videoConsumer) {
                    videoConsumer.close();
                    videoConsumer = null;
                }
            }
            else if (kind === 'audio') {
                if (audioConsumer) {
                    audioConsumer.close();
                    audioConsumer = null;
                }
            }

            if (remoteId) {
                removeRemoteVideo(remoteId);
            }
            else {
                removeAllRemoteVideo();
            }
        })
    });
}

// auto control video
function addRemoteTrack(id, track) {
    let video = findRemoteVideo(id);
    if (!video) {
        video = addRemoteVideo(id);
    }

    if (video.srcObject) {
        video.srcObject.addTrack(track);
        return;
    }

    const newStream = new MediaStream();
    newStream.addTrack(track);
    playVideo(video, newStream)
        .then(() => {
            video.muted = false
            // let body = document.getElementsByTagName('body')[0];
            // body.addEventListener("click", function () {
            //     video.muted = false
            // })
        })
        .catch(err => { console.error('media ERROR:', err) });
}
function addRemoteVideo(id) {
    let existElement = findRemoteVideo(id);
    if (existElement) {
        console.warn('remoteVideo element ALREADY exist for id=' + id);
        return existElement;
    }

    let element = document.createElement('video');
    remoteContainer.appendChild(element);
    element.id = 'remote_' + id;
    videoID = element.id
    element.width = 240;
    element.height = 180;
    element.muted = true;
    element.autoplay = true;
    element.playsinline = true;
    // element.volume = 1.0;
    // element.controls = true;
    element.style = 'border: solid black 1px;';

    return element;
}
function findRemoteVideo(id) {
    let element = document.getElementById('remote_' + id);
    return element;
}
function removeRemoteVideo(id) {
    console.log(' ---- removeRemoteVideo() id=' + id);
    let element = document.getElementById('remote_' + id);
    if (element) {
        element.pause();
        element.srcObject = null;
        remoteContainer.removeChild(element);
    }
    else {
        console.log('child element NOT FOUND');
    }
}
function removeAllRemoteVideo() {
    while (remoteContainer.firstChild) {
        remoteContainer.firstChild.pause();
        remoteContainer.firstChild.srcObject = null;
        remoteContainer.removeChild(remoteContainer.firstChild);
    }
}

async function subscribe() {
    if (!isSocketConnected()) {
        connectSocket().catch(err => {
            console.error(err);
            return;
        });
        // --- get capabilities --
        try {
            const data = await sendRequest('getRouterRtpCapabilities', { roomName: roomName });
            console.log('getRouterRtpCapabilities:', data);
            await loadDevice(data);
        } catch (e) {
            setTimeout(() => {
                window.location.reload();
            }, 2000)
            let val = JSON.parse(e)
            throw new Error(val.text + "Streamer doesn't stream in room. The page will refresh after 2 seconds")
        }
    }
    // --- prepare transport ---
    console.log('--- createConsumerTransport --');
    const params = await sendRequest('createConsumerTransport', { roomName: roomName });
    console.log('transport params:', params);
    consumerTransport = device.createRecvTransport(params);
    console.log('createConsumerTransport:', consumerTransport);
    // --- join & start publish --
    consumerTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
        console.log('--consumer trasnport connect');
        sendRequest('connectConsumerTransport', { dtlsParameters: dtlsParameters, roomName: roomName })
            .then(callback)
            .catch(errback);
    });
    consumerTransport.on('connectionstatechange', (state) => {
        switch (state) {
            case 'connecting':
                console.log('subscribing...');
                break;

            case 'connected':
                console.log('subscribed');
                break;

            case 'failed':
                console.log('failed');
                producerTransport.close();
                break;

            default:
                break;
        }
    });
    videoConsumer = await consumeAndResume(consumerTransport, 'video');
    audioConsumer = await consumeAndResume(consumerTransport, 'audio');
}
function disconnect() {
    if (videoConsumer) {
        videoConsumer.close();
        videoConsumer = null;
    }
    if (audioConsumer) {
        audioConsumer.close();
        audioConsumer = null;
    }
    if (consumerTransport) {
        consumerTransport.close();
        consumerTransport = null;
    }

    removeAllRemoteVideo();

    disconnectSocket();
}
async function consumeAndResume(transport, kind) {
    const consumer = await consume(transport, kind);
    if (consumer) {
        console.log('-- track exist, consumer ready. kind=' + kind);
        if (kind === 'video') {
            console.log('-- resume kind=' + kind);
            sendRequest('resume', { kind: kind, roomName: roomName })
                .then(() => {
                    console.log('resume OK');
                    return consumer;
                })
                .catch(err => {
                    console.error('resume ERROR:', err);
                    return consumer;
                });
        }
        else {
            console.log('-- do not resume kind=' + kind);
        }
    }
    else {
        console.log('-- no consumer yet. kind=' + kind);
        return null;
    }
}
async function consume(transport, trackKind) {
    console.log('--start of consume --kind=' + trackKind);
    const { rtpCapabilities } = device;
    //const data = await socket.request('consume', { rtpCapabilities });
    const data = await sendRequest('consume', { rtpCapabilities: rtpCapabilities, kind: trackKind, roomName: roomName })
        .catch(err => {
            console.error('consume ERROR:', err);
        });
    const {
        producerId,
        id,
        kind,
        rtpParameters,
    } = data;

    if (producerId) {
        let codecOptions = {};
        const consumer = await transport.consume({
            id,
            producerId,
            kind,
            rtpParameters,
            codecOptions,
        });
        //const stream = new MediaStream();
        //stream.addTrack(consumer.track);

        addRemoteTrack(clientId, consumer.track);

        console.log('--end of consume');
        //return stream;

        return consumer;
    }
    else {
        console.warn('--- remote producer NOT READY');

        return null;
    }
}

publishAudio();
// auto subscribe
subscribe();

async function startMedia() {
    if (localStream) {
        console.warn('WARN: local media ALREADY started');
        return;
    }
    const useVideo = false;
    const useAudio = true;

    return await navigator.mediaDevices.getUserMedia({ audio: useAudio, video: useVideo })
}
async function publishAudio() {
    localStream = await startMedia();
    // if (!isSocketConnected()) {
    //     connectSocket().catch(err => {
    //         console.error(err);
    //         return;
    //     });
    // --- get capabilities --
    // const data = await sendRequest('getRouterRtpCapabilities', {});
    // console.log('getRouterRtpCapabilities:', data);
    // await loadDevice(data);
    // }
    // --- get transport info ---
    // console.log('--- createProducerTransport --');
    // const params = await sendRequest('createProducerTransport', {});
    // console.log('transport params:', params);
    // producerTransport = device.createSendTransport(params);
    // console.log('createSendTransport:', producerTransport);

    // --- join & start publish --
    // producerTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
    //     console.log('--trasnport connect');
    //     sendRequest('connectProducerTransport', { dtlsParameters: dtlsParameters })
    //         .then(callback)
    //         .catch(errback);
    // });
    // producerTransport.on('produce', async ({ kind, rtpParameters }, callback, errback) => {
    //     console.log('--trasnport produce');
    //     try {
    //         const { id } = await sendRequest('produce', {
    //             transportId: producerTransport.id,
    //             kind,
    //             rtpParameters,
    //         });
    //         callback({ id });
    //     } catch (err) {
    //         errback(err);
    //     }
    // });
    // producerTransport.on('connectionstatechange', (state) => {
    //     switch (state) {
    //         case 'connecting':
    //             console.log('publishing...');
    //             break;

    //         case 'connected':
    //             console.log('published');
    //             break;

    //         case 'failed':
    //             console.log('failed');
    //             producerTransport.close();
    //             break;

    //         default:
    //             break;
    //     }
    // });

    // const useVideo = false;
    // const useAudio = true;
    // if (useVideo) {
    //     const videoTrack = localStream.getVideoTracks()[0];
    //     if (videoTrack) {
    //         const trackParams = { track: videoTrack };
    //         videoProducer = await producerTransport.produce(trackParams);
    //     }
    // }
    // if (useAudio) {
    //     const audioTrack = localStream.getAudioTracks()[0];
    //     if (audioTrack) {
    //         const trackParams = { track: audioTrack };
    //         audioProducer = await producerTransport.produce(trackParams);
    //     }
    // }
}
