const { io } = require('socket.io-client');

console.log('Testing socket.io connection to Render...');
const socket = io('http://localhost:3000', {
    transports: ['websocket', 'polling']
});

socket.on('connect', () => {
    console.log('SUCCESS: Connected to Render! Socket ID:', socket.id);
    process.exit(0);
});

socket.on('connect_error', (err) => {
    console.error('ERROR: Failed to connect:', err.message);
    process.exit(1);
});

// Timeout after 10 seconds
setTimeout(() => {
    console.error('ERROR: Connection timed out.');
    process.exit(1);
}, 10000);
