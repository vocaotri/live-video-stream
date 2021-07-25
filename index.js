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
// --- socket.io server ---
global.io = require('socket.io')(webServer);
const helpers = require('./helpers/helpers')
console.log('socket.io server start. port=' + webServer.address().port);
io.on('connection', function (socket) {
    console.log('client connected. socket id=' + helpers.getId(socket) + '  , total clients=' + helpers.getClientCount());

    socket.on('disconnect', function () {
        // close user connection
        console.log('client disconnected. socket id=' + helpers.getId(socket) + '  , total clients=' + helpers.getClientCount());
        // cleanUpPeer(socket);
    });
});