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