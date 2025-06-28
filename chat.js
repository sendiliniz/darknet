const { useState, useEffect, useRef } = React;

const socket = io('http://localhost:3000', { autoConnect: false });

const getAvatar = (username) => {
  const emojis = ['😺', '🦊', '🐶', '🐻', '🐼', '🦁', '🐸', '🦄'];
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  return emojis[Math.abs(hash) % emojis.length];
};

const App = () => {
  const [username, setUsername] = useState('');
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [servers, setServers] = useState([]);
  const [currentServer, setCurrentServer] = useState(null);
  const [newServerName, setNewServerName] = useState('');
  const fileInputRef = useRef(null);

  useEffect(() => {
    console.log('App mounted, setting up socket listeners');
    socket.on('connect', () => {
      console.log('Socket connected:', socket.id);
    });

    socket.on('connect_error', (err) => {
      console.error('Connection error:', err.message);
      setError('Failed to connect to server. Ensure it’s running at http://localhost:3000');
      setIsJoining(false);
    });

    socket.on('usernameTaken', () => {
      console.log('Username taken');
      setError('Username is already taken in this server');
      setIsJoining(false);
      socket.disconnect();
    });

    socket.on('joined', ({ servers }) => {
      console.log('Joined successfully, servers:', servers);
      setIsConnected(true);
      setIsJoining(false);
      setError('');
      setServers(servers);
      if (!currentServer && servers.length > 0) {
        setCurrentServer(servers[0].id);
        console.log('Selected default server:', servers[0].id);
      } else if (!currentServer) {
        console.log('No servers available, staying in join state');
      }
    });

    socket.on('serverList', (servers) => {
      console.log('Received server list:', servers);
      setServers(servers);
    });

    socket.on('message', (msg) => {
      if (msg.serverId === currentServer) {
        console.log('Received message:', msg);
        setMessages((prev) => [...prev, msg]);
      }
    });

    socket.on('error', (err) => {
      console.error('Server error:', err);
      setError(err);
      setIsJoining(false);
    });

    return () => {
      console.log('Cleaning up socket listeners');
      socket.off('connect');
      socket.off('connect_error');
      socket.off('usernameTaken');
      socket.off('joined');
      socket.off('serverList');
      socket.off('message');
      socket.off('error');
    };
  }, [currentServer]);

  const handleJoin = (e) => {
    e.preventDefault();
    if (username.trim() && !isJoining) {
      console.log('Attempting to join with username:', username);
      setIsJoining(true);
      setError('');
      socket.connect();
      socket.emit('join', { username: username.trim().toLowerCase(), serverId: currentServer || 'default' }, (response) => {
        if (response.error) {
          setError(response.error);
          setIsJoining(false);
          console.log('Join failed:', response.error);
        }
      });
    } else {
      console.log('Join attempt failed: Invalid username or already joining');
    }
  };

  const handleCreateServer = (e) => {
    e.preventDefault();
    if (newServerName.trim() && !isJoining) {
      console.log('Creating server:', newServerName);
      setIsJoining(true);
      socket.emit('createServer', { serverName: newServerName.trim(), username: username.trim().toLowerCase() });
      setNewServerName('');
    }
  };

  const handleSwitchServer = (serverId) => {
    if (serverId !== currentServer) {
      console.log('Switching to server:', serverId);
      setMessages([]);
      setCurrentServer(serverId);
      socket.emit('join', { username: username.trim().toLowerCase(), serverId });
    }
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (message.trim() && currentServer) {
      console.log('Sending message:', message);
      socket.emit('message', { username, text: message, type: 'text', serverId: currentServer });
      setMessage('');
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file || !currentServer) return;

    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      setError('File size exceeds 5MB limit');
      return;
    }

    const validImageTypes = ['image/png', 'image/jpeg', 'image/gif', 'video/mp4', 'video/webm'];
    if (!validImageTypes.includes(file.type)) {
      setError('Invalid file type. Use PNG, JPEG, GIF, MP4, or WEBM');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      console.log('Uploading media:', file.type);
      socket.emit('message', {
        username,
        type: file.type.startsWith('image/') ? 'image' : 'video',
        data: reader.result,
        serverId: currentServer,
      });
      fileInputRef.current.value = '';
    };
    reader.onerror = () => setError('Failed to read file');
    reader.readAsDataURL(file);
  };

  if (!isConnected) {
    return (
      <div className="flex items-center justify-center min-h-screen px-4">
        <form onSubmit={handleJoin} className="p-8 bg-gray-800/80 rounded-xl shadow-2xl backdrop-blur-sm w-full max-w-md transform transition-all duration-300">
          <h1 className="text-3xl font-bold mb-6 text-center bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-blue-500">
            Join DarkNet
          </h1>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Choose a username"
            className="w-full p-3 mb-4 bg-gray-900/50 rounded-lg border border-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all duration-200"
            disabled={isJoining}
          />
          {error && <p className="text-red-400 mb-4 text-center">{error}</p>}
          <button
            type="submit"
            className={`w-full p-3 rounded-lg font-semibold transition-all duration-200 ${
              isJoining
                ? 'bg-gray-600 cursor-not-allowed'
                : 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700'
            }`}
            disabled={isJoining}
          >
            {isJoining ? 'Joining...' : 'Enter Chat'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex h-screen max-w-7xl mx-auto">
      <div className="w-64 bg-gray-800/80 p-4 flex flex-col">
        <h2 className="text-xl font-bold mb-4 text-purple-300">Servers</h2>
        <div className="flex-1 overflow-y-auto">
          {servers.map((server) => (
            <button
              key={server.id}
              onClick={() => handleSwitchServer(server.id)}
              className={`w-full text-left p-2 mb-2 rounded-lg ${
                currentServer === server.id
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-700/50 hover:bg-gray-700 text-gray-200'
              } transition-all duration-200`}
            >
              {server.name}
            </button>
          ))}
        </div>
        <form onSubmit={handleCreateServer} className="mt-4">
          <input
            type="text"
            value={newServerName}
            onChange={(e) => setNewServerName(e.target.value)}
            placeholder="New server name"
            className="w-full p-2 mb-2 bg-gray-900/50 rounded-lg border border-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
            disabled={isJoining}
          />
          <button
            type="submit"
            className={`w-full p-2 rounded-lg font-semibold ${
              isJoining
                ? 'bg-gray-600 cursor-not-allowed'
                : 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700'
            }`}
            disabled={isJoining}
          >
            Create Server
          </button>
        </form>
      </div>
      <div className="flex-1 flex flex-col">
        <h1 className="text-2xl font-bold p-4 bg-gray-800/80 backdrop-blur-sm sticky top-0 z-10 bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-blue-500">
          DarkNet Chat - {servers.find((s) => s.id === currentServer)?.name || 'Select a server'}
        </h1>
        <div className="flex-1 p-4 overflow-y-auto bg-gray-900/50">
          {messages.map((msg, index) => (
            <div
              key={index}
              className="mb-3 p-3 bg-gray-800/50 rounded-lg flex items-start space-x-3 hover:bg-gray-800/70 transition-all duration-200"
            >
              <span className="text-2xl">{getAvatar(msg.username)}</span>
              <div className="flex-1">
                <span className="font-semibold text-purple-300">{msg.username}</span>
                {msg.type === 'text' && <p className="text-gray-200">{msg.text}</p>}
                {msg.type === 'image' && (
                  <img
                    src={msg.data}
                    alt="Uploaded image"
                    className="mt-2 max-w-xs rounded-lg shadow-md"
                  />
                )}
                {msg.type === 'video' && (
                  <video
                    src={msg.data}
                    controls
                    className="mt-2 max-w-xs rounded-lg shadow-md"
                  />
                )}
              </div>
            </div>
          ))}
        </div>
        <form onSubmit={handleSendMessage} className="p-4 bg-gray-800/80 sticky bottom-0">
          <div className="flex space-x-2">
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 p-3 bg-gray-900/50 rounded-lg border border-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all duration-200"
              disabled={!currentServer}
            />
            <label className="p-3 bg-gray-900/50 rounded-lg border border-gray-700 hover:bg-gray-700 transition-all duration-200 cursor-pointer">
              <span className="text-gray-400">📎</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/gif,video/mp4,video/webm"
                onChange={handleFileUpload}
                className="hidden"
                ref={fileInputRef}
                disabled={!currentServer}
              />
            </label>
            <button
              type="submit"
              className={`p-3 rounded-lg font-semibold transition-all duration-200 ${
                !currentServer
                  ? 'bg-gray-600 cursor-not-allowed'
                  : 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700'
              }`}
              disabled={!currentServer}
            >
              Send
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

ReactDOM.render(<App />, document.getElementById('root'));
