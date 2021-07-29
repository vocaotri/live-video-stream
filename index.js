const fs = require('fs');
const dotenv = require('dotenv');
const dotenvParseVariables = require('dotenv-parse-variables');
let env = dotenv.config({})
if (env.error) throw env.error;
env = dotenvParseVariables(env.parsed);
// --- set ssl server ---
let sslOptions = {};
if (env.HTTPS) {
    sslOptions.key = fs.readFileSync(env.HTTPS_KEY_FILE).toString();
    sslOptions.cert = fs.readFileSync(env.HTTPS_CERT_FILE).toString();
}
// --- prepare server ---
const http = require("http");
const https = require("https");
const express = require('express');

const app = express();
app.use(express.static('public'));

let webServer = null;
if (env.HTTPS) {
    // -- https ---
    webServer = https.createServer(sslOptions, app).listen(env.PORT, function () {
        console.log('Web server start. https://' + env.HOST_NAME + ':' + webServer.address().port + '/');
    });
}
else {
    // --- http ---
    webServer = http.Server(app).listen(env.PORT, function () {
        console.log('Web server start. http://' + env.HOST_NAME + ':' + webServer.address().port + '/');
    });
}
// ========= room ===========
global.Room = require('./services/room').Room
// ========= mediasoup ===========
global.mediasoup = require("mediasoup");
const helpers_mediasoup = require("./helpers/helper_mediasoup");

async function init() {
    const mediasoupOptions = {
        // Worker settings
        worker: {
            rtcMinPort: 10000,
            rtcMaxPort: 10100,
            logLevel: 'warn',
            logTags: [
                'info',
                'ice',
                'dtls',
                'rtp',
                'srtp',
                'rtcp',
                // 'rtx',
                // 'bwe',
                // 'score',
                // 'simulcast',
                // 'svc'
            ],
        },
        // Router settings
        router: {
            mediaCodecs:
                [
                    {
                        kind: 'audio',
                        mimeType: 'audio/opus',
                        clockRate: 48000,
                        channels: 2
                    },
                    {
                        kind: 'video',
                        mimeType: 'video/VP8',
                        clockRate: 90000,
                        parameters:
                        {
                            'x-google-start-bitrate': 1000
                        }
                    },
                ]
        },
        // WebRtcTransport settings
        webRtcTransport: {
            listenIps: [
                { ip: '127.0.0.1', announcedIp: null }
            ],
            enableUdp: true,
            enableTcp: true,
            preferUdp: true,
            maxIncomingBitrate: 1500000,
            initialAvailableOutgoingBitrate: 1000000,
        }
    };

    // let worker = null;
    // let router = null;
    // let producerTransport = null;
    // let videoProducer = null;
    // let audioProducer = null;
    // let producerSocketId = null;
    //let consumerTransport = null;
    //let subscribeConsumer = null;
    let { worker } = await helpers_mediasoup.startWorker(mediasoupOptions)
    // --- multi-consumers --
    // let transports = {};
    // let videoConsumers = {};
    // let audioConsumers = {};

    // --- socket.io server ---
    global.io = require('socket.io')(webServer);
    const helpers = require('./helpers/helpers');
    console.log('socket.io server start. port=' + webServer.address().port);
    io.on('connection', function (socket) {
        const id = helpers.getId(socket);
        console.log('client connected. socket id=' + id + '  , total clients=' + helpers.getClientCount());

        socket.on('disconnect', function () {
            const roomName = getRoomname();
            // close user connection
            console.log('client disconnected. socket id=' + id + '  , total clients=' + helpers.getClientCount());
            cleanUpPeer(roomName, socket);
            // --- socket.io room ---
            socket.leave(roomName);
        });
        // --- setup room ---
        socket.on('prepare_room', async (data) => {
            const roomId = data.roomId;
            const existRoom = Room.getRoom(roomId);
            if (existRoom) {
                console.log('--- use exist room. roomId=' + roomId);
            } else {
                console.log('--- create new room. roomId=' + roomId);
                await setupRoom(roomId);
            }
            // --- socket.io room ---
            socket.join(roomId);
            setRoomname(roomId);
        })

        socket.on('error', function (err) {
            console.error('socket ERROR:', err);
        });
        socket.on('connect_error', (err) => {
            console.error('client connection error', err);
        });
        socket.on('getRouterRtpCapabilities', (data, callback) => {
            getRouterRTP(data, callback, 0);
        });
        // --- producer streamer ----
        socket.on('createProducerTransport', async (data, callback) => {
            const room = Room.getRoom(data.roomName);
            console.log('-- createProducerTransport ---');
            producerSocketId = id;
            const { transport, params } = await helpers_mediasoup.createTransport(room.router, mediasoupOptions);
            helpers_mediasoup.addProducerTrasport(room, id, transport);
            producerTransport = transport;
            producerTransport.observer.on('close', () => {
                const videoProducer = helpers_mediasoup.getProducer(room, id, 'video');
                if (videoProducer) {
                    videoProducer.close();
                    helpers_mediasoup.removeProducer(room, id, 'video');
                }
                const audioProducer = helpers_mediasoup.getProducer(room, id, 'audio');
                if (audioProducer) {
                    audioProducer.close();
                    helpers_mediasoup.removeProducer(room, id, 'audio');
                }
                helpers_mediasoup.removeProducerTransport(room, id);
            });
            //console.log('-- createProducerTransport params:', params);
            helpers.sendResponse(params, callback);
        });
        socket.on('connectProducerTransport', async (data, callback) => {
            const room = Room.getRoom(data.roomName);
            let transport = room.getProducerTrasnport(id);
            await transport.connect({ dtlsParameters: data.dtlsParameters });
            helpers.sendResponse({}, callback);
        });
        socket.on('produce', async (data, callback) => {
            const room = Room.getRoom(data.roomName);
            const { kind, rtpParameters } = data;
            console.log('-- produce --- kind=', kind);
            const transport = room.getProducerTrasnport(id);
            if (!transport) {
                console.error('transport NOT EXIST for id=' + id);
                return;
            }
            const producer = await transport.produce({ kind, rtpParameters });
            helpers_mediasoup.addProducer(room, id, producer, kind);
            producer.observer.on('close', () => {
                console.log('producer closed --- kind=' + kind);
            })
            helpers.sendResponse({ id: producer.id }, callback);
            if (room) {
                console.log('--broadcast room=%s newProducer ---', room.name);
                socket.broadcast.to(room.name).emit('newProducer', { socketId: id, producerId: producer.id, kind: producer.kind });
            }
            else {
                console.log('--broadcast newProducer ---');
                socket.broadcast.emit('newProducer', { socketId: id, producerId: producer.id, kind: producer.kind });
            }
        });
        // --- consumer viewer ----
        socket.on('createConsumerTransport', async (data, callback) => {
            const room = Room.getRoom(data.roomName);
            setRoomname(data.roomName);
            console.log('-- createConsumerTransport ---');
            const { transport, params } = await helpers_mediasoup.createTransport(room.router, mediasoupOptions);
            helpers_mediasoup.addConsumerTrasport(room, id, transport);
            transport.observer.on('close', () => {
                console.log('--- consumerTransport closed. --')
                helpers_mediasoup.removeConsumerSetDeep(room, localId);
                helpers_mediasoup.removeConsumerTransport(room, id);
            });
            //console.log('-- createTransport params:', params);
            helpers.sendResponse(params, callback);
        });
        socket.on('connectConsumerTransport', async (data, callback) => {
            const room = Room.getRoom(data.roomName);
            console.log(room)
            console.log('-- connectConsumerTransport ---');
            let transport = helpers_mediasoup.getConsumerTrasnport(room, id);
            if (!transport) {
                console.error('transport NOT EXIST for id=' + id);
                // helpers.sendResponse({}, callback);
                return;
            }
            await transport.connect({ dtlsParameters: data.dtlsParameters });
            helpers.sendResponse({}, callback);
        });
        socket.on('consume', async (data, callback) => {
            const kind = data.kind;
            const room = Room.getRoom(data.roomName);
            const producerSocketId = room.getOwnStream();
            console.log('-- consume --kind=' + kind);
            const producer = helpers_mediasoup.getProducer(room, producerSocketId, kind);
            if (producer) {
                let transport = helpers_mediasoup.getConsumerTrasnport(room, id);
                if (!transport) {
                    console.error('transport NOT EXIST for id=' + id);
                    return;
                }
                const { consumer, params } = await helpers_mediasoup.createConsumer(transport, producer, data.rtpCapabilities, room.router); // producer must exist before consume
                //subscribeConsumer = consumer;
                helpers_mediasoup.addConsumerVA(room, id, consumer, kind);
                consumer.observer.on('close', () => {
                    console.log('consumer closed ---');
                })
                consumer.on('producerclose', () => {
                    console.log('consumer -- on.producerclose');
                    consumer.close();
                    helpers_mediasoup.removeConsumerSetDeep(room.name, id);

                    // -- notify to client ---
                    socket.emit('producerClosed', { localId: id, remoteId: producerSocketId, kind: kind });
                });
                console.log('-- consumer ready ---');
                helpers.sendResponse(params, callback);
            }
            else {
                console.log('-- consume, but producer NOT READY');
                const params = { producerId: null, id: null, kind: kind, rtpParameters: {} };
                helpers.sendResponse(params, callback);
            }
        });
        socket.on('resume', async (data, callback) => {
            const room = Room.getRoom(data.roomName);
            const kind = data.kind;
            console.log('-- resume -- kind=' + kind);
            if (kind === 'video') {
                let consumer = helpers_mediasoup.getVideoConsumer(room, id, kind);
                if (!consumer) {
                    console.error('consumer NOT EXIST for id=' + id);
                    helpers.sendResponse({}, callback);
                    return;
                }
                await consumer.resume();
                helpers.sendResponse({}, callback);
            }
            else {
                console.warn('NO resume for audio');
            }
        });
        function setRoomname(room) {
            socket.roomname = room;
        }

        function getRouterRTP(data, callback, numOfTries) {
            const room = Room.getRoom(data.roomName);
            numOfTries++;
            if (room) {
                const { router } = room;
                if (router) {
                    console.log('getRouterRtpCapabilities: ', router.rtpCapabilities);
                    helpers.sendResponse(router.rtpCapabilities, callback);
                }
                else {
                    helpers.sendReject({ text: 'ERROR- router NOT READY' }, callback);
                }
            } else if (numOfTries < 10) {
                setTimeout(() => {
                    console.log('try to get room');
                    getRouterRTP(data, callback, numOfTries);
                    numOfTries++;
                    console.log("Number of trying: " + numOfTries);
                }, 500);
            } else {
                helpers.sendReject({ text: 'ERROR- router NOT READY' }, callback);
            }
        }

        function getRoomname() {
            const room = socket.roomname;
            return room;
        }
    });
    function cleanUpPeer(roomname, socket) {
        const id = helpers.getId(socket);
        const room = Room.getRoom(roomname);
        if (room) {
            const transport = helpers_mediasoup.getConsumerTrasnport(room, id);
            if (transport) {
                transport.close();
                helpers_mediasoup.removeConsumerTransport(room, id);
            }

            const videoProducer = helpers_mediasoup.getProducer(room, id, 'video');
            if (videoProducer) {
                videoProducer.close();
                helpers_mediasoup.removeProducer(room, id, 'video');
            }
            const audioProducer = helpers_mediasoup.getProducer(room, id, 'audio');
            if (audioProducer) {
                audioProducer.close();
                helpers_mediasoup.removeProducer(room, id, 'audio');
            }
            const producerTransport = helpers_mediasoup.getProducerTrasnport(room, id);
            if (producerTransport) {
                producerTransport.close();
                helpers_mediasoup.removeProducerTransport(room, id);
            }
        }

    }
    async function setupRoom(name) {
        const room = new Room(name);
        const mediaCodecs = mediasoupOptions.router.mediaCodecs;
        const router = await worker.createRouter({ mediaCodecs });
        router.roomname = name;

        router.observer.on('close', () => {
            console.log('-- router closed. room=%s', name);
        });
        router.observer.on('newtransport', transport => {
            console.log('-- router newtransport. room=%s', name);
        });

        room.router = router;
        Room.addRoom(room, name);
        return room;
    }
}


init()