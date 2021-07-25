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
connectSocket().catch(err => {
    console.error(err);
    return;
});