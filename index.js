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
    let producerTransport = null;
    let videoProducer = null;
    let audioProducer = null;
    let producerSocketId = null;
    //let consumerTransport = null;
    //let subscribeConsumer = null;
    let { worker, router } = await helpers_mediasoup.startWorker(mediasoupOptions)
    // --- multi-consumers --
    let transports = {};
    let videoConsumers = {};
    let audioConsumers = {};

    // --- socket.io server ---
    global.io = require('socket.io')(webServer);
    const helpers = require('./helpers/helpers');
    console.log('socket.io server start. port=' + webServer.address().port);
    io.on('connection', function (socket) {
        console.log('client connected. socket id=' + helpers.getId(socket) + '  , total clients=' + helpers.getClientCount());

        socket.on('disconnect', function () {
            // close user connection
            console.log('client disconnected. socket id=' + helpers.getId(socket) + '  , total clients=' + helpers.getClientCount());
            // cleanUpPeer(socket);
        });

        socket.on('error', function (err) {
            console.error('socket ERROR:', err);
        });
        socket.on('connect_error', (err) => {
            console.error('client connection error', err);
        });
        socket.on('getRouterRtpCapabilities', (data, callback) => {
            if (router) {
                console.log('getRouterRtpCapabilities: ', router.rtpCapabilities);
                helpers.sendResponse(router.rtpCapabilities, callback);
            }
            else {
                helpers.sendReject({ text: 'ERROR- router NOT READY' }, callback);
            }
        });
        // --- producer streamer ----
        socket.on('createProducerTransport', async (data, callback) => {
            console.log('-- createProducerTransport ---');
            producerSocketId = helpers.getId(socket);
            const { transport, params } = await helpers_mediasoup.createTransport(router, mediasoupOptions);
            producerTransport = transport;
            producerTransport.observer.on('close', () => {
                if (videoProducer) {
                    videoProducer.close();
                    videoProducer = null;
                }
                if (audioProducer) {
                    audioProducer.close();
                    audioProducer = null;
                }
                producerTransport = null;
            });
            //console.log('-- createProducerTransport params:', params);
            helpers.sendResponse(params, callback);
        });
        socket.on('connectProducerTransport', async (data, callback) => {
            await producerTransport.connect({ dtlsParameters: data.dtlsParameters });
            helpers.sendResponse({}, callback);
        });
        socket.on('produce', async (data, callback) => {
            const { kind, rtpParameters } = data;
            console.log('-- produce --- kind=', kind);
            if (kind === 'video') {
                videoProducer = await producerTransport.produce({ kind, rtpParameters });
                videoProducer.observer.on('close', () => {
                    console.log('videoProducer closed ---');
                })
                helpers.sendResponse({ id: videoProducer.id }, callback);
            }
            else if (kind === 'audio') {
                audioProducer = await producerTransport.produce({ kind, rtpParameters });
                audioProducer.observer.on('close', () => {
                    console.log('audioProducer closed ---');
                })
                helpers.sendResponse({ id: audioProducer.id }, callback);
            }
            else {
                console.error('produce ERROR. BAD kind:', kind);
                //sendResponse({}, callback);
                return;
            }

            // inform clients about new producer
            console.log('--broadcast newProducer -- kind=', kind);
            socket.broadcast.emit('newProducer', { kind: kind });
        });
        // --- consumer viewer ----
        socket.on('createConsumerTransport', async (data, callback) => {
            console.log('-- createConsumerTransport ---');
            const { transport, params } = await helpers_mediasoup.createTransport(router, mediasoupOptions);
            transports = helpers_mediasoup.addConsumerTrasport(helpers.getId(socket), transport, transports);
            transport.observer.on('close', () => {
                const id = helpers.getId(socket);
                console.log('--- consumerTransport closed. --')
                let consumer = videoConsumers[helpers.getId(socket)];
                if (consumer) {
                    consumer.close();
                    videoConsumers = helpers_mediasoup.removeVideoConsumer(id, videoConsumers);
                }
                consumer = audioConsumers[helpers.getId(socket)];
                if (consumer) {
                    consumer.close();
                    audioConsumers = helpers_mediasoup.removeAudioConsumer(id, audioConsumers);
                }
                helpers_mediasoup.removeConsumerTransport(id, transports);
            });
            //console.log('-- createTransport params:', params);
            helpers.sendResponse(params, callback);
        });
    });
}
init()