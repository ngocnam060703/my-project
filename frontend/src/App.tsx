import React from "react";
import { BrowserRouter, Routes, Route, Navigate, useParams, useLocation, useSearchParams } from "react-router-dom";
import { App as AntdApp, Spin } from "antd";
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
import MyContractsPage from "./pages/client/MyContractsPage";
import MyBillsPage from "./pages/client/MyBillsPage";
import MyViolationsPage from "./pages/client/MyViolationsPage";
import CalendarPage from "./pages/client/CalendarPage";
import ProfilePage from "./pages/client/ProfilePage";
import DamageReportPage from "./pages/client/DamageReportPage";
import ContractRenewalPage from "./pages/client/ContractRenewalPage";
import DormRegistrationPage from "./pages/client/DormRegistrationPage";
import StudentApplicationsPage from "./pages/client/StudentApplicationsPage";
import RegulationsPage from "./pages/client/RegulationsPage";
import DashboardPage from "./pages/admin/DashboardPage";
import UsersPage from "./pages/admin/UsersPage";
import StudentsPage from "./pages/admin/StudentsPage";
import AreasRoomsPage from "./pages/admin/AreasRoomsPage";
import ApplicationsPage from "./pages/admin/ApplicationsPage";
import ContractsPage from "./pages/admin/ContractsPage";
import BillsPage from "./pages/admin/BillsPage";
import ViolationsPage from "./pages/admin/ViolationsPage";
import MaintenanceReportsAdminPage from "./pages/admin/MaintenanceReportsAdminPage";
import ServiceManagementBootstrapPage from "./pages/admin/ServiceManagementBootstrapPage";
import ServicesPageClient from "./pages/client/ServicesPage";
import MajorsPage from "./pages/admin/MajorsPage";
import NotFoundPage from "./pages/NotFoundPage";

/** `/` → admin/manager đã đăng nhập vào /admin; mặc định vào /login */
const RootRedirect: React.FC = () => {
  const { user, loading } = useAuth();
  if (loading) return <Spin size="large" style={{ display: "block", margin: "100px auto" }} />;
  if (user?.role === "admin" || user?.role === "manager") return <Navigate to="/admin" replace />;
  return <Navigate to="/login" replace />;
};

/** URL cũ chuyển phòng / đăng ký cũ → tab «Chuyển phòng» trong «Đơn của tôi» */
const LegacyStudentTransferApplicationsRedirect: React.FC = () => {
  const [searchParams] = useSearchParams();
  const roomId = searchParams.get("roomId");
  const next = new URLSearchParams({ tab: "transfer" });
  if (roomId) next.set("roomId", roomId);
  return <Navigate to={`/student/my-applications?${next.toString()}`} replace />;
};

/** Không cho admin/manager dùng layout sinh viên */
const StudentAreaGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <Spin size="large" style={{ display: "block", margin: "100px auto" }} />;
  if (user?.role === "admin" || user?.role === "manager") return <Navigate to="/admin" replace />;
  return <>{children}</>;
};

const LegacyRoomDetailRedirect: React.FC = () => {
  const { id } = useParams();
  return <Navigate to={`/student/rooms/${id ?? ""}`} replace />;
};

const LegacyContractRenewalRedirect: React.FC = () => {
  const { id } = useParams();
  return <Navigate to={`/student/contract-renewal/${id ?? ""}`} replace />;
};

const LegacyDormRegistrationRedirect: React.FC = () => {
  const { search } = useLocation();
  return <Navigate to={`/student/dorm-registration${search}`} replace />;
};

function App() {
  return (
    <ThemeProvider>
      <ErrorBoundary>
        <AntdApp>
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
                  <Route path="students" element={<StudentsPage />} />
                  <Route path="majors" element={<MajorsPage />} />
                  <Route path="housing" element={<AreasRoomsPage />} />
                  <Route path="areas" element={<Navigate to="/admin/housing?tab=areas" replace />} />
                  <Route path="rooms" element={<Navigate to="/admin/housing?tab=rooms" replace />} />
                  <Route path="registrations" element={<Navigate to="/admin/applications?tab=registrations" replace />} />
                  <Route path="applications" element={<ApplicationsPage />} />
                  <Route path="contracts" element={<ContractsPage />} />
                  <Route path="bills" element={<BillsPage />} />
                  <Route path="billing" element={<Navigate to="/admin/bills" replace />} />
                  <Route path="violations" element={<ViolationsPage />} />
                  <Route path="maintenance-reports" element={<MaintenanceReportsAdminPage />} />
                  <Route path="facilities" element={<Navigate to="/admin/rooms" replace />} />
                  <Route path="services" element={<ServiceManagementBootstrapPage />} />
                  <Route path="dorm-services" element={<Navigate to="/admin/services" replace />} />
                  <Route path="dorm_services" element={<Navigate to="/admin/services" replace />} />
                </Route>

                <Route
                  path="/student"
                  element={
                    <ProtectedRoute>
                      <StudentAreaGuard>
                        <ClientLayout />
                      </StudentAreaGuard>
                    </ProtectedRoute>
                  }
                >
                  <Route index element={<HomePage />} />
                  <Route path="rooms" element={<RoomsPage />} />
                  <Route path="rooms/:id" element={<RoomDetailPage />} />
                  <Route path="dorm-registration" element={<ProtectedRoute><DormRegistrationPage /></ProtectedRoute>} />
                  <Route path="my-applications" element={<ProtectedRoute><StudentApplicationsPage /></ProtectedRoute>} />
                  <Route path="dorm-applications" element={<Navigate to="/student/my-applications" replace />} />
                  <Route path="room-transfer" element={<LegacyStudentTransferApplicationsRedirect />} />
                  <Route path="my-registrations" element={<LegacyStudentTransferApplicationsRedirect />} />
                  <Route path="my-contracts" element={<ProtectedRoute><MyContractsPage /></ProtectedRoute>} />
                  <Route path="my-bills" element={<ProtectedRoute><MyBillsPage /></ProtectedRoute>} />
                  <Route path="billing" element={<Navigate to="/student/my-bills" replace />} />
                  <Route path="my-violations" element={<ProtectedRoute><MyViolationsPage /></ProtectedRoute>} />
                  <Route path="regulations" element={<ProtectedRoute><RegulationsPage /></ProtectedRoute>} />
                  <Route path="calendar" element={<ProtectedRoute><CalendarPage /></ProtectedRoute>} />
                  <Route path="profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
                  <Route path="services" element={<ProtectedRoute><ServicesPageClient /></ProtectedRoute>} />
                  <Route path="damage-report" element={<ProtectedRoute><DamageReportPage /></ProtectedRoute>} />
                  <Route path="contract-renewal/:id" element={<ProtectedRoute><ContractRenewalPage /></ProtectedRoute>} />
                </Route>

                <Route path="/" element={<RootRedirect />} />

                {/* Tương thích URL cũ (bookmark / thông báo cũ) */}
                <Route path="/rooms" element={<Navigate to="/student/rooms" replace />} />
                <Route path="/rooms/:id" element={<LegacyRoomDetailRedirect />} />
                <Route path="/dorm-registration" element={<LegacyDormRegistrationRedirect />} />
                <Route path="/my-registrations" element={<Navigate to="/student/my-applications?tab=transfer" replace />} />
                <Route path="/my-contracts" element={<Navigate to="/student/my-contracts" replace />} />
                <Route path="/my-bills" element={<Navigate to="/student/my-bills" replace />} />
                <Route path="/calendar" element={<Navigate to="/student/calendar" replace />} />
                <Route path="/profile" element={<Navigate to="/student/profile" replace />} />
                <Route path="/damage-report" element={<Navigate to="/student/damage-report" replace />} />
                <Route path="/services" element={<Navigate to="/student/services" replace />} />
                <Route path="/contract-renewal/:id" element={<LegacyContractRenewalRedirect />} />

                <Route path="*" element={<NotFoundPage />} />
                </Routes>
              </SocketProvider>
            </AuthProvider>
          </BrowserRouter>
        </AntdApp>
      </ErrorBoundary>
    </ThemeProvider>
  );
}

export default App;
