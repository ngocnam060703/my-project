require("dotenv").config();
const http = require("http");
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const connectDB = require("./config/database");
const { createApiLimiter } = require("./config/rateLimits");
const { initSocket } = require("./socket");

const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const studentRoutes = require("./routes/studentRoutes");
const areaRoutes = require("./routes/areaRoutes");
const zoneRoutes = require("./routes/zoneRoutes");
const roomRoutes = require("./routes/roomRoutes");
const registrationRoutes = require("./routes/registrationRoutes");
const applicationRoutes = require("./routes/applicationRoutes");
const applicationController = require("./controllers/applicationController");
const { auth, requireRole } = require("./middleware/auth");
const contractRoutes = require("./routes/contractRoutes");
const contractController = require("./controllers/contractController");
const billRoutes = require("./routes/billRoutes");
const billController = require("./controllers/billController");
const dashboardRoutes = require("./routes/dashboardRoutes");
const ratingRoutes = require("./routes/ratingRoutes");
const studentDashboardRoutes = require("./routes/studentDashboardRoutes");
const registrationPeriodRoutes = require("./routes/registrationPeriodRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const damageReportRoutes = require("./routes/damageReportRoutes");
const facilityRoutes = require("./routes/facilityRoutes");
const facilityReportRoutes = require("./routes/facilityReportRoutes");
const serviceRoutes = require("./routes/serviceRoutes");
const roomServiceRoutes = require("./routes/roomServiceRoutes");
const serviceUsageRoutes = require("./routes/serviceUsageRoutes");
const roomCostRoutes = require("./routes/roomCostRoutes");
const majorRoutes = require("./routes/majorRoutes");
const violationRoutes = require("./routes/violationRoutes");
const violationController = require("./controllers/violationController");
const disciplinaryRoutes = require("./routes/disciplinaryRoutes");
const maintenanceReportController = require("./controllers/maintenanceReportController");
const maintenanceReportRoutes = require("./routes/maintenanceReportRoutes");
const maintenanceReportAdminRoutes = require("./routes/maintenanceReportAdminRoutes");
const scheduleController = require("./controllers/scheduleController");
const opsContractsRoutes = require("./routes/opsContractsRoutes");
const bedRoutes = require("./routes/bedRoutes");
// Register Bed models early to avoid MissingSchemaError in some runtimes
require("./models/Bed");
require("./models/BedHistory");

const app = express();
/** CRA/webpack proxy gửi X-Forwarded-For → express-rate-limit v8 sẽ lỗi nếu không trust proxy */
app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));
/** Khai báo rõ DELETE (tránh môi trường/proxy chỉ cho GET/POST). */
/** origin: true — cho phép mọi origin dev (3000, 3001, …) gọi API khi không dùng proxy */
app.use(cors({ origin: true, methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] }));
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (req, res) => {
  const ok = mongoose.connection.readyState === 1;
  res.status(ok ? 200 : 503).json({
    ok,
    mongo: ok ? "connected" : "disconnected",
    readyState: mongoose.connection.readyState,
  });
});

/** Không áp limiter toàn cục cho đăng nhập/đăng ký — chỉ dùng limiter trong authRoutes (tránh 500 chồng middleware). */
const apiLimiter = createApiLimiter();
app.use((req, res, next) => {
  const pathOnly = String(req.originalUrl || req.url || "").split("?")[0];
  if (pathOnly.endsWith("/auth/login") || pathOnly.endsWith("/auth/register")) {
    return next();
  }
  return apiLimiter(req, res, next);
});

app.get("/", (req, res) => res.json({ message: "KTX Management API" }));

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/areas", areaRoutes);
app.use("/api/zones", zoneRoutes);
app.use("/api/rooms", roomRoutes);
app.use("/api/registrations", registrationRoutes);
/** Alias REST theo spec: danh sách đơn của sinh viên đang đăng nhập */
app.get("/api/my-applications", auth, requireRole("user"), applicationController.listMine);
app.use("/api/applications", applicationRoutes);
/** Alias REST: tổng quan hợp đồng + lịch sử gia hạn cho sinh viên */
app.get("/api/my-contract", auth, requireRole("user"), contractController.getMyContractOverview);
app.use("/api/contracts", contractRoutes);
/** Alias REST: danh sách hóa đơn sinh viên đang đăng nhập */
app.get("/api/my-bills", auth, requireRole("user"), billController.getMyBills);
app.use("/api/bills", billRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/student-dashboard", studentDashboardRoutes);
app.use("/api/registration-periods", registrationPeriodRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/damage-reports", damageReportRoutes);
app.use("/api/facilities", facilityRoutes);
app.use("/api/facility-reports", facilityReportRoutes);
app.use("/api/services", serviceRoutes);
app.use("/api/room-services", roomServiceRoutes);
app.use("/api/service-usage", serviceUsageRoutes);
app.use("/api/room-costs", roomCostRoutes);
/** Alias REST: danh sách vi phạm của sinh viên */
app.get("/api/my-violations", auth, requireRole("user"), violationController.getMyViolations);
app.use("/api/violations", violationRoutes);
/** Khai báo hư hỏng / sự cố phòng — REST theo spec (đăng ký lặp trên students — xem studentRoutes) */
app.get("/api/my-reports", auth, requireRole("user"), maintenanceReportController.listMine);
app.get("/api/student/maintenance-reports", auth, requireRole("user"), maintenanceReportController.listMine);
app.use("/api/reports", maintenanceReportRoutes);
app.use("/api/admin/maintenance-reports", maintenanceReportAdminRoutes);
app.use("/api/ops", opsContractsRoutes);
app.use("/api/beds", bedRoutes);
app.use("/api/majors", majorRoutes);
/** Lịch tổng hợp cho sinh viên (hóa đơn, hợp đồng, bảo trì, kỳ đăng ký) */
app.get("/api/my-schedule", auth, requireRole("user"), scheduleController.getMySchedule);
app.get("/api/events/:id", auth, requireRole("user"), scheduleController.getEventById);
app.use("/api/disciplinary", disciplinaryRoutes);
app.use("/api/ratings", ratingRoutes);

// Lỗi parse JSON body (body-parser) — trước đây bị middleware dưới trả 500 gây nhầm.
app.use((err, req, res, next) => {
  const code = err.statusCode || err.status;
  if (code === 400 && (err.type === "entity.parse.failed" || err instanceof SyntaxError)) {
    return res.status(400).json({
      message: "Dữ liệu gửi lên không phải JSON hợp lệ. Hãy tải lại trang và thử lại.",
    });
  }
  next(err);
});

app.use((err, req, res, next) => {
  const status = Number(err.statusCode || err.status) || 500;
  console.error("API error:", err);
  if (res.headersSent) return next(err);
  if (status >= 400 && status < 500) {
    return res.status(status).json({ message: err.message || "Lỗi yêu cầu" });
  }
  res.status(500).json({ message: err.message || "Lỗi máy chủ" });
});

const PORT = process.env.PORT || 5000;
const httpServer = http.createServer(app);
initSocket(httpServer);

async function start() {
  try {
    await connectDB();
  } catch (e) {
    console.error("Không khởi động được (MongoDB):", e?.message || e);
    process.exit(1);
  }
  httpServer.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
}

start();
