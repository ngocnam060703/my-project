const express = require("express");
const { auth, requireRole } = require("../middleware/auth");
const maintenanceReportController = require("../controllers/maintenanceReportController");
const { validateAdminPatch, validateAdminListQuery } = require("../validators/maintenanceReportValidators");
const validateRequest = require("../middleware/validateRequest");

const router = express.Router();
const admin = requireRole("admin", "manager");

/** Danh sách toàn hệ thống (hoặc theo khu nếu manager) */
router.get("/", auth, admin, validateAdminListQuery, validateRequest, maintenanceReportController.adminList);

/** Cập nhật trạng thái xử lý / ghi chú BQL */
router.patch("/:id", auth, admin, validateAdminPatch, validateRequest, maintenanceReportController.adminPatch);

module.exports = router;
