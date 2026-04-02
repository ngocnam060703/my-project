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
const areaRoutes = require("./routes/areaRoutes");
const roomRoutes = require("./routes/roomRoutes");
const registrationRoutes = require("./routes/registrationRoutes");
const contractRoutes = require("./routes/contractRoutes");
const billRoutes = require("./routes/billRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const ratingRoutes = require("./routes/ratingRoutes");
const studentDashboardRoutes = require("./routes/studentDashboardRoutes");
const registrationPeriodRoutes = require("./routes/registrationPeriodRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const damageReportRoutes = require("./routes/damageReportRoutes");
const facilityRoutes = require("./routes/facilityRoutes");
const facilityReportRoutes = require("./routes/facilityReportRoutes");
const serviceRoutes = require("./routes/serviceRoutes");
const roomCostRoutes = require("./routes/roomCostRoutes");
const violationRoutes = require("./routes/violationRoutes");
const disciplinaryRoutes = require("./routes/disciplinaryRoutes");

const app = express();
/** CRA/webpack proxy gửi X-Forwarded-For → express-rate-limit v8 sẽ lỗi nếu không trust proxy */
app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));
/** Khai báo rõ DELETE (tránh môi trường/proxy chỉ cho GET/POST). */
app.use(cors({ methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] }));
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
app.use("/api/areas", areaRoutes);
app.use("/api/rooms", roomRoutes);
app.use("/api/registrations", registrationRoutes);
app.use("/api/contracts", contractRoutes);
app.use("/api/bills", billRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/student-dashboard", studentDashboardRoutes);
app.use("/api/registration-periods", registrationPeriodRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/damage-reports", damageReportRoutes);
app.use("/api/facilities", facilityRoutes);
app.use("/api/facility-reports", facilityReportRoutes);
app.use("/api/services", serviceRoutes);
app.use("/api/room-costs", roomCostRoutes);
app.use("/api/violations", violationRoutes);
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
