const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);

// Serve static files
app.use(express.static(path.join(__dirname)));

// Socket.IO setup
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Store active users and server rooms
const activeUsers = new Map();
const serverRooms = new Map();
const adminUsers = new Set();
const customServers = new Map(); // Store custom created servers
const userProfiles = new Map(); // Store user profiles

// Admin ID
const ADMIN_ID = "495485ifd[fd-r-405i405]r4=";

// Default servers
const defaultServers = ['general', 'games', 'random', 'tech', 'music'];
let validServers = [...defaultServers];

function addUserToServer(userId, serverName) {
  if (!serverRooms.has(serverName)) {
    serverRooms.set(serverName, new Set());
  }
  serverRooms.get(serverName).add(userId);
}

function removeUserFromServer(userId, serverName) {
  if (serverRooms.has(serverName)) {
    serverRooms.get(serverName).delete(userId);
  }
}

function removeUserFromAllServers(userId) {
  serverRooms.forEach((users, serverName) => {
    users.delete(userId);
  });
}

function getOnlineUsers(serverName) {
  if (!serverRooms.has(serverName)) {
    return [];
  }
  
  const userIds = Array.from(serverRooms.get(serverName));
  return userIds.map(userId => {
    const user = Array.from(activeUsers.values()).find(u => u.id === userId);
    const profile = getUserProfile(userId);
    return user ? { 
      id: user.id, 
      name: user.name, 
      avatar: user.avatar, 
      isAdmin: user.isAdmin,
      profile: profile 
    } : null;
  }).filter(user => user !== null);
}

function createServer(serverName, creatorId) {
  if (validServers.includes(serverName) || customServers.has(serverName)) {
    return false; // Server already exists
  }
  
  const creator = Array.from(activeUsers.values()).find(u => u.id === creatorId);
  if (!creator) return false;
  
  customServers.set(serverName, {
    name: serverName,
    creator: creator.name,
    createdAt: new Date(),
    icon: '🏠'
  });
  
  validServers.push(serverName);
  return true;
}

function getAllServers() {
  const servers = [];
  
  // Add default servers
  defaultServers.forEach(name => {
    servers.push({
      name,
      icon: getServerIcon(name),
      isDefault: true,
      onlineCount: getOnlineUsers(name).length
    });
  });
  
  // Add custom servers
  customServers.forEach((server, name) => {
    servers.push({
      name,
      icon: server.icon,
      isDefault: false,
      creator: server.creator,
      onlineCount: getOnlineUsers(name).length
    });
  });
  
  return servers;
}

function getServerIcon(serverName) {
  const icons = {
    'general': '💬',
    'games': '🎮',
    'random': '🎲',
    'tech': '💻',
    'music': '🎵'
  };
  return icons[serverName] || '🏠';
}

function createUserProfile(userId, userData) {
  const profile = {
    userId: userId,
    displayName: userData.name,
    username: userData.name,
    bio: '',
    status: 'online',
    customStatus: '',
    joinedAt: new Date(),
    avatar: userData.avatar,
    badges: userData.isAdmin ? ['👑 Admin'] : [],
    theme: 'auto',
    pronouns: '',
    location: '',
    website: '',
    birthday: '',
    favoriteColor: '#3b82f6',
    isAdmin: userData.isAdmin
  };
  userProfiles.set(userId, profile);
  return profile;
}

function updateUserProfile(userId, updates) {
  const profile = userProfiles.get(userId);
  if (profile) {
    Object.assign(profile, updates);
    userProfiles.set(userId, profile);
    return profile;
  }
  return null;
}

function getUserProfile(userId) {
  return userProfiles.get(userId) || null;
}

// Socket.IO connection handling
io.on("connection", (socket) => {
  console.log(`New connection: ${socket.id}`);

  let userData = null;
  let currentServers = new Set();

  // Set username
  socket.on("set_username", (data, callback) => {
    const name = typeof data === 'string' ? data : data.name;
    const avatar = typeof data === 'object' ? data.avatar : null;

    if (!name || name.length < 2) {
      return callback({ 
        success: false, 
        message: "Username must be at least 2 characters long" 
      });
    }

    if (activeUsers.has(name)) {
      return callback({ 
        success: false, 
        message: "Username already taken!" 
      });
    }

    // Check if user entered admin ID
    const isAdmin = name === ADMIN_ID;
    let finalName = name;
    
    if (isAdmin) {
      finalName = "Admin";
      adminUsers.add(socket.id);
      console.log(`Admin user authenticated with ID: ${socket.id}`);
    }

    userData = { 
      id: socket.id,
      name: finalName, 
      avatar,
      isAdmin: isAdmin
    };

    activeUsers.set(finalName, userData);
    
    // Create user profile
    const profile = createUserProfile(socket.id, userData);
    
    console.log(`User ${finalName} registered${isAdmin ? ' (ADMIN)' : ''}`);

    callback({ success: true, isAdmin: isAdmin, profile: profile });
  });

  // Get all servers
  socket.on("get_servers", (callback) => {
    callback(getAllServers());
  });

  // Create server
  socket.on("create_server", (data, callback) => {
    if (!userData) {
      return callback({ success: false, message: "Not authenticated" });
    }

    const serverName = data.name.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    
    if (!serverName || serverName.length < 2 || serverName.length > 20) {
      return callback({ success: false, message: "Server name must be 2-20 characters, letters/numbers only" });
    }

    if (createServer(serverName, userData.id)) {
      io.emit("server_created", {
        name: serverName,
        icon: '🏠',
        creator: userData.name,
        isDefault: false,
        onlineCount: 0
      });
      callback({ success: true, serverName });
    } else {
      callback({ success: false, message: "Server name already exists" });
    }
  });

  // Get online users for server
  socket.on("get_online_users", (serverName, callback) => {
    const onlineUsers = getOnlineUsers(serverName);
    callback(onlineUsers);
  });

  // Join server
  socket.on("join_server", (serverName) => {
    if (!userData || !validServers.includes(serverName)) {
      return;
    }

    socket.join(serverName);
    currentServers.add(serverName);
    addUserToServer(userData.id, serverName);

    console.log(`${userData.name} joined #${serverName}`);

    io.to(serverName).emit("chat_message", {
      server: serverName,
      user: "System",
      message: `${userData.name} joined #${serverName}`
    });

    // Broadcast updated online users to all users in the server
    const onlineUsers = getOnlineUsers(serverName);
    io.to(serverName).emit("online_users_updated", { server: serverName, users: onlineUsers });
    
    // Update server list for all users
    io.emit("servers_updated", getAllServers());
  });

  // Leave server
  socket.on("leave_server", (serverName) => {
    if (!userData || !validServers.includes(serverName)) {
      return;
    }

    socket.leave(serverName);
    currentServers.delete(serverName);
    removeUserFromServer(userData.id, serverName);

    io.to(serverName).emit("chat_message", {
      server: serverName,
      user: "System",
      message: `${userData.name} left #${serverName}`
    });

    // Broadcast updated online users to remaining users in the server
    const onlineUsers = getOnlineUsers(serverName);
    io.to(serverName).emit("online_users_updated", { server: serverName, users: onlineUsers });
    
    // Update server list for all users
    io.emit("servers_updated", getAllServers());
  });

  // Update avatar
  socket.on("update_avatar", (data) => {
    if (!userData || !data.avatar) {
      return;
    }

    userData.avatar = data.avatar;
    activeUsers.set(userData.name, userData);
    
    // Update profile avatar
    updateUserProfile(userData.id, { avatar: data.avatar });
    
    console.log(`${userData.name} updated their avatar`);
  });

  // Get user profile
  socket.on("get_profile", (targetUserId, callback) => {
    if (!userData) {
      return callback({ success: false, message: "Not authenticated" });
    }
    
    const profile = getUserProfile(targetUserId || userData.id);
    if (profile) {
      callback({ success: true, profile: profile });
    } else {
      callback({ success: false, message: "Profile not found" });
    }
  });

  // Update user profile
  socket.on("update_profile", (profileData, callback) => {
    if (!userData) {
      return callback({ success: false, message: "Not authenticated" });
    }

    // Validate profile data
    const allowedUpdates = [
      'displayName', 'bio', 'customStatus', 'pronouns', 
      'location', 'website', 'birthday', 'favoriteColor', 'theme'
    ];
    
    const updates = {};
    for (const key of allowedUpdates) {
      if (profileData.hasOwnProperty(key)) {
        if (key === 'displayName' && (!profileData[key] || profileData[key].length < 1 || profileData[key].length > 32)) {
          return callback({ success: false, message: "Display name must be 1-32 characters" });
        }
        if (key === 'bio' && profileData[key] && profileData[key].length > 200) {
          return callback({ success: false, message: "Bio must be less than 200 characters" });
        }
        if (key === 'customStatus' && profileData[key] && profileData[key].length > 100) {
          return callback({ success: false, message: "Custom status must be less than 100 characters" });
        }
        updates[key] = profileData[key];
      }
    }

    const updatedProfile = updateUserProfile(userData.id, updates);
    if (updatedProfile) {
      // Update display name in active users if changed
      if (updates.displayName && updates.displayName !== userData.name) {
        activeUsers.delete(userData.name);
        userData.name = updates.displayName;
        activeUsers.set(userData.name, userData);
      }
      
      callback({ success: true, profile: updatedProfile });
      
      // Broadcast profile update to current servers
      currentServers.forEach(serverName => {
        const onlineUsers = getOnlineUsers(serverName);
        io.to(serverName).emit("online_users_updated", { server: serverName, users: onlineUsers });
      });
    } else {
      callback({ success: false, message: "Failed to update profile" });
    }
  });

  // Send message
  socket.on("send_message", ({ server, message, avatar }) => {
    if (!userData || !validServers.includes(server) || !currentServers.has(server)) {
      return;
    }

    const trimmedMessage = message.trim().substring(0, 2000);
    
    // Check for admin commands
    if (userData.isAdmin && trimmedMessage.startsWith('/')) {
      handleAdminCommand(trimmedMessage, server);
      return;
    }

    const messageData = {
      server,
      user: userData.name,
      message: trimmedMessage,
      avatar: avatar || userData.avatar,
      isAdmin: userData.isAdmin
    };

    console.log(`Message from ${userData.name}${userData.isAdmin ? ' (ADMIN)' : ''} in #${server}`);
    io.to(server).emit("chat_message", messageData);
  });

  // Admin command handler
  function handleAdminCommand(command, server) {
    const args = command.split(' ');
    const cmd = args[0].toLowerCase();

    switch (cmd) {
      case '/kick':
        if (args[1]) {
          const targetUser = args[1];
          kickUser(targetUser, server);
        }
        break;
      case '/ban':
        if (args[1]) {
          const targetUser = args[1];
          banUser(targetUser, server);
        }
        break;
      case '/announce':
        const announcement = args.slice(1).join(' ');
        if (announcement) {
          io.to(server).emit("chat_message", {
            server,
            user: "🚨 ADMIN ANNOUNCEMENT",
            message: announcement,
            isAnnouncement: true
          });
        }
        break;
      case '/clear':
        io.to(server).emit("clear_chat");
        break;
      default:
        socket.emit("chat_message", {
          server,
          user: "System",
          message: "Unknown admin command. Available: /kick [user], /ban [user], /announce [message], /clear"
        });
    }
  }

  function kickUser(username, server) {
    const userToKick = Array.from(activeUsers.values()).find(user => user.name === username);
    if (userToKick) {
      const kickSocket = io.sockets.sockets.get(userToKick.id);
      if (kickSocket) {
        kickSocket.emit("kicked", { reason: "Kicked by admin" });
        kickSocket.disconnect();
        io.to(server).emit("chat_message", {
          server,
          user: "System",
          message: `${username} was kicked by an admin`
        });
      }
    }
  }

  function banUser(username, server) {
    const userToBan = Array.from(activeUsers.values()).find(user => user.name === username);
    if (userToBan) {
      const banSocket = io.sockets.sockets.get(userToBan.id);
      if (banSocket) {
        banSocket.emit("banned", { reason: "Banned by admin" });
        banSocket.disconnect();
        io.to(server).emit("chat_message", {
          server,
          user: "System",
          message: `${username} was banned by an admin`
        });
      }
    }
  }

  // WebRTC signaling for voice chat
  socket.on("voice_offer", (data) => {
    socket.to(data.target).emit("voice_offer", {
      offer: data.offer,
      from: socket.id,
      fromUser: userData ? userData.name : "Unknown"
    });
  });

  socket.on("voice_answer", (data) => {
    socket.to(data.target).emit("voice_answer", {
      answer: data.answer,
      from: socket.id
    });
  });

  socket.on("voice_ice_candidate", (data) => {
    socket.to(data.target).emit("voice_ice_candidate", {
      candidate: data.candidate,
      from: socket.id
    });
  });

  socket.on("voice_call_user", (data) => {
    socket.to(data.target).emit("incoming_voice_call", {
      from: socket.id,
      fromUser: userData ? userData.name : "Unknown",
      server: data.server
    });
  });

  socket.on("voice_call_response", (data) => {
    socket.to(data.target).emit("voice_call_response", {
      accepted: data.accepted,
      from: socket.id
    });
  });

  socket.on("voice_call_end", (data) => {
    socket.to(data.target).emit("voice_call_ended", {
      from: socket.id
    });
  });

  // Handle disconnection
  socket.on("disconnect", () => {
    if (userData) {
      activeUsers.delete(userData.name);
      
      // Remove from admin users if applicable
      if (userData.isAdmin) {
        adminUsers.delete(socket.id);
      }

      currentServers.forEach(serverName => {
        removeUserFromServer(userData.id, serverName);
        
        io.to(serverName).emit("chat_message", {
          server: serverName,
          user: "System",
          message: `${userData.name} disconnected`
        });

        // Broadcast updated online users
        const onlineUsers = getOnlineUsers(serverName);
        io.to(serverName).emit("online_users_updated", { server: serverName, users: onlineUsers });
      });

      // Update server list for all users
      io.emit("servers_updated", getAllServers());

      console.log(`User ${userData.name}${userData.isAdmin ? ' (ADMIN)' : ''} disconnected`);
    }
  });
});

const PORT = process.env.PORT || 5000;
const HOST = "0.0.0.0";

server.listen(PORT, HOST, () => {
  console.log(`🚀 Server running on http://${HOST}:${PORT}`);
});
