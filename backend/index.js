require("dotenv").config();
const http = require("http");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const connectDB = require("./config/database");
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

connectDB();

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { message: "Quá nhiều yêu cầu, vui lòng thử lại sau." },
  })
);
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);

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
app.use("/api/ratings", ratingRoutes);

const PORT = process.env.PORT || 5000;
const httpServer = http.createServer(app);
initSocket(httpServer);
httpServer.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
