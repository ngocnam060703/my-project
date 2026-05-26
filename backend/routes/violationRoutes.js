const express = require("express");
const violationController = require("../controllers/violationController");
const { auth, requireRole } = require("../middleware/auth");
const { requireStudentAccount } = require("../controllers/violationController");
const { updateViolationRules } = require("../validators/violationValidators");

const router = express.Router();
const admin = requireRole("admin", "manager");

/** Quy tắc — mọi user đã đăng nhập */
router.get("/rules", auth, violationController.getRules);

/** Sinh viên — đặt trước GET /:id */
router.get("/my/stats", auth, requireStudentAccount, violationController.getMyDisciplineStats);
router.get("/my", auth, requireStudentAccount, violationController.getMyViolations);

/** Admin — các path tĩnh trước /:id */
router.get("/students-summary", auth, admin, violationController.getStudentSummary);
router.get("/room-residents", auth, admin, violationController.getRoomResidents);
router.get("/", auth, admin, violationController.getAllViolations);
router.post("/", auth, admin, violationController.createViolation);

/** Chi tiết: admin/manager toàn quyền; sinh viên chỉ bản ghi của mình */
router.get("/:id", auth, violationController.getViolationById);
router.put("/:id", auth, admin, updateViolationRules, violationController.updateViolation);
router.delete("/:id", auth, admin, violationController.deleteViolation);

module.exports = router;
