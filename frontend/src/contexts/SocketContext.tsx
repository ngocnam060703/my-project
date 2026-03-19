import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { io, Socket } from "socket.io-client";
import { message } from "antd";
import { useAuth } from "./AuthContext";

const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || "http://localhost:5000";

interface SocketContextType {
  socket: Socket | null;
}

const SocketContext = createContext<SocketContextType>({ socket: null });

export const SocketProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (!user?.id) return;
    const s = io(SOCKET_URL);
    setSocket(s);
    s.on("registration:approved", (data: { userId?: string; message?: string }) => {
      if (data.userId === user.id) message.success(data.message || "Đơn đăng ký đã được duyệt");
    });
    s.on("registration:rejected", (data: { userId?: string; message?: string }) => {
      if (data.userId === user.id) message.warning(data.message || "Đơn đăng ký bị từ chối");
    });
    s.on("bill:new", (data: { userId?: string; message?: string }) => {
      if (data.userId === user.id) message.info(data.message || "Bạn có hóa đơn mới");
    });
    return () => {
      s.disconnect();
      setSocket(null);
    };
  }, [user?.id]);

  return <SocketContext.Provider value={{ socket }}>{children}</SocketContext.Provider>;
};

export const useSocket = () => useContext(SocketContext);
