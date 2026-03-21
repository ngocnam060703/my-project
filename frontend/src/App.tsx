import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Spin } from "antd";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { SocketProvider } from "./contexts/SocketContext";
import ProtectedRoute from "./components/ProtectedRoute";
import ClientLayout from "./layouts/ClientLayout";
import AdminLayout from "./layouts/AdminLayout";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import HomePage from "./pages/client/HomePage";
import RoomsPage from "./pages/client/RoomsPage";
import RoomDetailPage from "./pages/client/RoomDetailPage";
import MyRegistrationsPage from "./pages/client/MyRegistrationsPage";
import MyContractsPage from "./pages/client/MyContractsPage";
import MyBillsPage from "./pages/client/MyBillsPage";
import CalendarPage from "./pages/client/CalendarPage";
import ProfilePage from "./pages/client/ProfilePage";
import DamageReportPage from "./pages/client/DamageReportPage";
import ContractRenewalPage from "./pages/client/ContractRenewalPage";
import DashboardPage from "./pages/admin/DashboardPage";
import UsersPage from "./pages/admin/UsersPage";
import AreasPage from "./pages/admin/AreasPage";
import RoomsPageAdmin from "./pages/admin/RoomsPage";
import RegistrationsPage from "./pages/admin/RegistrationsPage";
import ContractsPage from "./pages/admin/ContractsPage";
import BillsPage from "./pages/admin/BillsPage";
import RegistrationPeriodsPage from "./pages/admin/RegistrationPeriodsPage";
import NotFoundPage from "./pages/NotFoundPage";

const RoleRedirect: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <Spin size="large" style={{ display: "block", margin: "100px auto" }} />;
  if (user?.role === "admin" || user?.role === "manager") return <Navigate to="/admin" replace />;
  return <>{children}</>;
};

function App() {
  return (
    <ThemeProvider>
      <ErrorBoundary>
    <BrowserRouter>
        <AuthProvider>
        <SocketProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/manager" element={<Navigate to="/admin" replace />} />
            <Route path="/admin" element={<ProtectedRoute roles={["admin", "manager"]}><AdminLayout /></ProtectedRoute>}>
              <Route index element={<DashboardPage />} />
              <Route path="users" element={<UsersPage />} />
              <Route path="areas" element={<AreasPage />} />
              <Route path="rooms" element={<RoomsPageAdmin />} />
              <Route path="registrations" element={<RegistrationsPage />} />
              <Route path="contracts" element={<ContractsPage />} />
              <Route path="bills" element={<BillsPage />} />
              <Route path="registration-periods" element={<RegistrationPeriodsPage />} />
            </Route>
            <Route path="/" element={<RoleRedirect><ClientLayout /></RoleRedirect>}>
              <Route index element={<HomePage />} />
              <Route path="rooms" element={<RoomsPage />} />
              <Route path="rooms/:id" element={<RoomDetailPage />} />
              <Route path="my-registrations" element={<ProtectedRoute><MyRegistrationsPage /></ProtectedRoute>} />
              <Route path="my-contracts" element={<ProtectedRoute><MyContractsPage /></ProtectedRoute>} />
              <Route path="my-bills" element={<ProtectedRoute><MyBillsPage /></ProtectedRoute>} />
              <Route path="calendar" element={<ProtectedRoute><CalendarPage /></ProtectedRoute>} />
              <Route path="profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
              <Route path="damage-report" element={<ProtectedRoute><DamageReportPage /></ProtectedRoute>} />
              <Route path="contract-renewal/:id" element={<ProtectedRoute><ContractRenewalPage /></ProtectedRoute>} />
            </Route>
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </SocketProvider>
        </AuthProvider>
      </BrowserRouter>
      </ErrorBoundary>
    </ThemeProvider>
  );
}

export default App;
