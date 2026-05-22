import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { io, Socket } from "socket.io-client";
import { App } from "antd";
import { useAuth } from "./AuthContext";

interface SocketContextType {
  socket: Socket | null;
}

const SocketContext = createContext<SocketContextType>({ socket: null });

export const SocketProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { message } = App.useApp();
  const [socket, setSocket] = useState<Socket | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    const userId = (user as { id?: string; _id?: string })?.id || (user as { id?: string; _id?: string })?._id;
    if (!userId) return;

    let socket: Socket | null = null;
    let disposed = false;

    const timer = window.setTimeout(() => {
      if (disposed) return;
      socket = io("/", {
        path: "/socket.io",
        transports: ["polling", "websocket"],
        withCredentials: true,
        reconnection: true,
        reconnectionAttempts: 5,
      });
      if (disposed) {
        socket.disconnect();
        return;
      }
      setSocket(socket);

      const onApproved = (data: { userId?: string; message?: string }) => {
        if (data.userId === userId) message.success(data.message || "Đơn đăng ký đã được duyệt");
      };
      const onRejected = (data: { userId?: string; message?: string }) => {
        if (data.userId === userId) message.warning(data.message || "Đơn đăng ký bị từ chối");
      };
      const onAppApproved = (data: { userId?: string; message?: string }) => {
        if (data.userId === userId) message.success(data.message || "Đơn KTX của bạn đã được duyệt");
      };
      const onAppRejected = (data: { userId?: string; message?: string }) => {
        if (data.userId === userId) message.warning(data.message || "Đơn KTX của bạn đã bị từ chối");
      };
      const onExtended = (data: { userId?: string; message?: string }) => {
        if (data.userId === userId) message.success(data.message || "Hợp đồng đã được gia hạn");
      };
      const onBillNew = (data: { userId?: string; message?: string }) => {
        if (data.userId === userId) message.info(data.message || "Bạn có hóa đơn mới");
      };
      const onBillPaid = (data: { userId?: string }) => {
        if (data.userId === userId) message.success("Hóa đơn đã được thanh toán");
      };

      socket.on("registration:approved", onApproved);
      socket.on("registration:rejected", onRejected);
      socket.on("application:approved", onAppApproved);
      socket.on("application:rejected", onAppRejected);
      socket.on("contract:extended", onExtended);
      socket.on("bill:new", onBillNew);
      socket.on("bill:paid", onBillPaid);
    }, 0);

    return () => {
      disposed = true;
      window.clearTimeout(timer);
      if (socket) {
        socket.removeAllListeners();
        socket.disconnect();
      }
      setSocket(null);
    };
  }, [user, message]);

  return <SocketContext.Provider value={{ socket }}>{children}</SocketContext.Provider>;
};

export const useSocket = () => useContext(SocketContext);
