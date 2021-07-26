module.exports.startWorker = async function (mediasoupOptions) {
    const mediaCodecs = mediasoupOptions.router.mediaCodecs;
    worker = await mediasoup.createWorker();
    router = await worker.createRouter({ mediaCodecs });
    //producerTransport = await router.createWebRtcTransport(mediasoupOptions.webRtcTransport);
    console.log('-- mediasoup worker start. --')
    return { worker, router }
}

module.exports.createTransport = async function (router, mediasoupOptions) {
    const transport = await router.createWebRtcTransport(mediasoupOptions.webRtcTransport);
    console.log('-- create transport id=' + transport.id);
    return {
        transport: transport,
        params: {
            id: transport.id,
            iceParameters: transport.iceParameters,
            iceCandidates: transport.iceCandidates,
            dtlsParameters: transport.dtlsParameters
        }
    };
}

module.exports.addConsumerTrasport = function (id, transport, transports) {
    transports[id] = transport;
    console.log('consumerTransports count=' + Object.keys(transports).length);
    return transports;
}

module.exports.removeVideoConsumer = function (id, videoConsumers) {
    delete videoConsumers[id];
    console.log('videoConsumers count=' + Object.keys(videoConsumers).length);
    return videoConsumers;
}

module.exports.removeAudioConsumer = function (id, audioConsumers) {
    delete audioConsumers[id];
    console.log('audioConsumers count=' + Object.keys(audioConsumers).length);
    return audioConsumers;
}

module.exports.removeConsumerTransport = function (id, transports) {
    delete transports[id];
    console.log('consumerTransports count=' + Object.keys(transports).length);
    return transports;
}