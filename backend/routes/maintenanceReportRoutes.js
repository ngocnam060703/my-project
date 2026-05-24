const express = require("express");
const { auth, requireRole } = require("../middleware/auth");
const maintenanceReportController = require("../controllers/maintenanceReportController");
const { validateCreateMaintenance, validateMongoIdParam } = require("../validators/maintenanceReportValidators");
const validateRequest = require("../middleware/validateRequest");

const router = express.Router();

/** Sinh viên tạo khai báo (phòng auto từ hợp đồng) */
router.post("/", auth, requireRole("user"), validateCreateMaintenance, validateRequest, maintenanceReportController.create);

/** Danh sách của tôi (alias REST — đặt TRƯỚC /:id để không bị coi "my" là id) */
router.get("/my", auth, requireRole("user"), maintenanceReportController.listMine);

/** CSVC phòng — đặt trước /:id */
router.get("/room-facilities", auth, requireRole("user"), maintenanceReportController.roomFacilities);

/** Chi tiết: sinh viên (của mình) hoặc BQL */
router.get("/:id", auth, validateMongoIdParam, validateRequest, maintenanceReportController.getById);

/** Hủy yêu cầu — chỉ pending + đúng chủ */
router.delete("/:id", auth, requireRole("user"), validateMongoIdParam, validateRequest, maintenanceReportController.cancel);

module.exports = router;
