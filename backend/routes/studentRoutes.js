const express = require("express");
const { auth, requireRole } = require("../middleware/auth");
const validateRequest = require("../middleware/validateRequest");
const studentController = require("../controllers/studentController");
const maintenanceReportController = require("../controllers/maintenanceReportController");
const {
  studentIdParam,
  createStudentRules,
  adminUpdateStudentRules,
  studentSelfUpdateRules,
} = require("../validators/studentValidators");

const router = express.Router();

router.use(auth);

router.get("/me", requireRole("user"), studentController.getMe);
router.patch("/me", requireRole("user"), studentSelfUpdateRules, validateRequest, studentController.updateMe);

/** Dự phòng: danh sách khai báo hư hỏng (cùng handler) — tránh 404 khi proxy/deploy khác bản index.js */
router.get("/me/maintenance-reports", requireRole("user"), maintenanceReportController.listMine);

router.get("/", requireRole("admin", "manager"), studentController.list);
router.post("/", requireRole("admin", "manager"), createStudentRules, validateRequest, studentController.create);
router.get("/:id", studentIdParam, validateRequest, requireRole("admin", "manager", "user"), studentController.getById);
router.patch("/:id", requireRole("admin", "manager"), adminUpdateStudentRules, validateRequest, studentController.updateByAdmin);
router.delete("/:id", requireRole("admin"), studentIdParam, validateRequest, studentController.remove);

module.exports = router;
