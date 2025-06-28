const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
  },
});

const activeUsers = new Set();

io.on('connection', (socket) => {
  socket.on('join', (username) => {
    const normalizedUsername = username.trim().toLowerCase();
    if (activeUsers.has(normalizedUsername)) {
      socket.emit('usernameTaken');
      socket.disconnect(true);
      return;
    }

    activeUsers.add(normalizedUsername);
    socket.username = username;
    socket.emit('joined');

    socket.on('message', (msg) => {
      if (msg.type === 'text') {
        io.emit('message', { username: socket.username, text: msg.text, type: 'text' });
      } else if (msg.type === 'image' || msg.type === 'video') {
        const validMimeTypes = ['image/png', 'image/jpeg', 'image/gif', 'video/mp4', 'video/webm'];
        if (!validMimeTypes.includes(msg.type)) {
          socket.emit('error', 'Invalid media type');
          return;
        }
        const maxSize = 5 * 1024 * 1024; // 5MB in base64
        if (msg.data.length > maxSize * 1.33) { // Approx base64 overhead
          socket.emit('error', 'Media size exceeds 5MB limit');
          return;
        }
        io.emit('message', { username: socket.username, type: msg.type, data: msg.data });
      }
    });

    socket.on('disconnect', () => {
      activeUsers.delete(normalizedUsername);
    });
  });
});

server.listen(3000, () => {
  console.log('Server running on port 3000');
});
