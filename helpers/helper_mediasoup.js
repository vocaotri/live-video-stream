module.exports.startWorker = async function (mediasoupOptions) {
    const mediaCodecs = mediasoupOptions.router.mediaCodecs;
    worker = await mediasoup.createWorker();
    // router = await worker.createRouter({ mediaCodecs });
    //producerTransport = await router.createWebRtcTransport(mediasoupOptions.webRtcTransport);
    console.log('-- mediasoup worker start. --')
    return { worker }
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

module.exports.addProducerTrasport = function (room, id, transport) {
    room.addProducerTrasport(id, transport);
    room.addOwnStream(id);
    console.log('=== addProducerTrasport use room=%s ===', room.name);
}


module.exports.removeProducer = function (room, id, kind) {
    room.removeProducer(id, kind);
}

module.exports.addProducer = function (room, id, producer, kind) {
    room.addProducer(id, producer, kind);
    console.log('=== addProducer use room=%s ===', room.name);
}

module.exports.removeConsumerSetDeep = function (roomname, localId) {
    const room = Room.getRoom(roomname);
    room.removeConsumerSetDeep(localId);
}

module.exports.removeProducerTransport = function (room, id) {
    room.removeProducerTransport(id);
}

module.exports.getProducer = function (room, id, kind) {
    return room.getProducer(id, kind);
}

module.exports.getConsumerTrasnport = function (room, id) {
    return room.getConsumerTrasnport(id);
}

module.exports.getProducerTrasnport = function (room, id) {
    return room.getProducerTrasnport(id);
}

module.exports.addConsumerTrasport = function (room, id, transport) {
    room.addConsumerTrasport(id, transport);
    console.log('=== addConsumerTrasport use room=%s ===', room.name);
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

module.exports.removeConsumerTransport = function (room, id) {
    room.removeConsumerTransport(id);
}

module.exports.createConsumer = async function (transport, producer, rtpCapabilities, router) {
    let consumer = null;
    if (!router.canConsume(
        {
            producerId: producer.id,
            rtpCapabilities,
        })
    ) {
        console.error('can not consume');
        return;
    }

    //consumer = await producerTransport.consume({ // NG: try use same trasport as producer (for loopback)
    consumer = await transport.consume({ // OK
        producerId: producer.id,
        rtpCapabilities,
        paused: producer.kind === 'video',
    }).catch(err => {
        console.error('consume failed', err);
        return;
    });

    //if (consumer.type === 'simulcast') {
    //  await consumer.setPreferredLayers({ spatialLayer: 2, temporalLayer: 2 });
    //}

    return {
        consumer: consumer,
        params: {
            producerId: producer.id,
            id: consumer.id,
            kind: consumer.kind,
            rtpParameters: consumer.rtpParameters,
            type: consumer.type,
            producerPaused: consumer.producerPaused
        }
    };
}

module.exports.addConsumerVA = function (room, id, consumer, kind) {
    room.addConsumerSet(id, consumer, kind)
}

module.exports.removeVideoConsumer = function (id, videoConsumers) {
    delete videoConsumers[id];
    console.log('videoConsumers count=' + Object.keys(videoConsumers).length);
    return videoConsumers;
}

module.exports.addAudioConsumer = function (id, consumer, audioConsumers) {
    audioConsumers[id] = consumer;
    console.log('audioConsumers count=' + Object.keys(audioConsumers).length);
    return audioConsumers
}

module.exports.removeAudioConsumer = function (id, audioConsumers) {
    delete audioConsumers[id];
    console.log('audioConsumers count=' + Object.keys(audioConsumers).length);
    return audioConsumers
}

module.exports.getVideoConsumer = function (room, id, kind) {
    return room.getConsumerSet(id, kind)
}