const jwt = require('jsonwebtoken');

/**
 * Attaches Socket.IO handlers. Clients must connect with an auth token:
 *   io("http://localhost:5000", { auth: { token: accessToken } })
 */
function initSocket(io) {
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication token required'));
    try {
      socket.user = jwt.verify(token, process.env.JWT_SECRET);
      next();
    } catch {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.user.email} (${socket.id})`);

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.user.email} (${socket.id})`);
    });
  });
}

module.exports = { initSocket };
