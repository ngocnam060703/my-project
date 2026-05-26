const { Server } = require("socket.io");

let io = null;

function isBenignSocketError(err) {
  const code = err?.code;
  return code === "ECONNRESET" || code === "EPIPE" || code === "ECONNABORTED";
}

const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: { origin: true, credentials: true },
    pingTimeout: 60_000,
    pingInterval: 25_000,
  });

  io.engine.on("connection_error", (err) => {
    if (isBenignSocketError(err)) return;
    console.warn("Socket.IO connection_error:", err?.message || err);
  });

  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);

    socket.on("error", (err) => {
      if (isBenignSocketError(err)) return;
      console.warn("Socket.IO client error:", socket.id, err?.message || err);
    });

    const transportSocket = socket.conn?.transport?.socket;
    if (transportSocket && typeof transportSocket.on === "function") {
      transportSocket.on("error", (err) => {
        if (isBenignSocketError(err)) return;
        console.warn("Socket transport error:", socket.id, err?.message || err);
      });
    }

    socket.on("disconnect", (reason) => {
      console.log("Client disconnected:", socket.id, reason);
    });
  });

  return io;
};

const getIO = () => {
  if (!io) throw new Error("Socket not initialized");
  return io;
};

module.exports = { initSocket, getIO };
