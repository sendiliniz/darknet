const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from the root directory
app.use(express.static("."));

const activeUsers = new Map(); // Changed to Map to store user data

io.on("connection", (socket) => {
  let userData = null;

  socket.on("set_username", (data, callback) => {
    const name = typeof data === 'string' ? data : data.name;
    const avatar = typeof data === 'object' ? data.avatar : null;
    
    if (activeUsers.has(name)) {
      callback({ success: false, message: "Username already taken!" });
    } else {
      userData = { name, avatar };
      activeUsers.set(name, userData);
      callback({ success: true });
    }
  });

  socket.on("join_server", (serverName) => {
    socket.join(serverName);
    io.to(serverName).emit("chat_message", {
      server: serverName,
      user: "System",
      message: `${userData?.name || 'User'} joined #${serverName}`,
    });
  });

  socket.on("leave_server", (serverName) => {
    socket.leave(serverName);
    io.to(serverName).emit("chat_message", {
      server: serverName,
      user: "System",
      message: `${userData?.name || 'User'} left #${serverName}`,
    });
  });

  socket.on("send_message", ({ server, message, avatar }) => {
    io.to(server).emit("chat_message", {
      server,
      user: userData?.name || 'Unknown',
      message,
      avatar: avatar || userData?.avatar,
    });
  });

  socket.on("disconnect", () => {
    if (userData?.name) {
      activeUsers.delete(userData.name);
    }
  });
});

server.listen(5000, "0.0.0.0", () => {
  console.log("Server running on port 5000");
});
