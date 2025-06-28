// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server);

const activeUsers = new Set();

app.use(express.static('public'));

io.on('connection', (socket) => {
  let username = null;

  socket.on('set_username', (name, callback) => {
    if (activeUsers.has(name)) {
      callback({ success: false, message: 'Username already taken!' });
    } else {
      username = name;
      activeUsers.add(name);
      callback({ success: true });
    }
  });

  socket.on('join_server', (serverName) => {
    socket.join(serverName);
    io.to(serverName).emit('chat_message', {
      server: serverName,
      user: 'System',
      message: `${username} joined #${serverName}`
    });
  });

  socket.on('leave_server', (serverName) => {
    socket.leave(serverName);
    io.to(serverName).emit('chat_message', {
      server: serverName,
      user: 'System',
      message: `${username} left #${serverName}`
    });
  });

  socket.on('send_message', ({ server, message }) => {
    if (username && server) {
      io.to(server).emit('chat_message', {
        server,
        user: username,
        message
      });
    }
  });

  socket.on('disconnect', () => {
    activeUsers.delete(username);
  });
});

server.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
