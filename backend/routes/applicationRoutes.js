const express = require("express");
const applicationController = require("../controllers/applicationController");
const { auth, requireRole } = require("../middleware/auth");
const validateRequest = require("../middleware/validateRequest");
const applicationValidators = require("../validators/applicationValidators");

const router = express.Router();

/** Sinh viên: danh sách đơn của tôi */
router.get("/my", auth, applicationController.listMine);

/** Sinh viên: gửi đơn */
router.post(
  "/",
  auth,
  requireRole("user"),
  applicationValidators.createApplication,
  validateRequest,
  applicationController.create
);

/** Admin / Manager: thống kê (đặt trước /:id để không bị nuốt bởi param) */
router.get(
  "/stats/by-day",
  auth,
  requireRole("admin", "manager"),
  applicationValidators.statsByDay,
  validateRequest,
  applicationController.statsByDay
);

/** Admin / Manager */
router.get(
  "/",
  auth,
  requireRole("admin", "manager"),
  applicationValidators.listApplications,
  validateRequest,
  applicationController.list
);

router.get(
  "/:id/suggested-room",
  auth,
  requireRole("admin", "manager"),
  applicationController.getSuggestedRoom
);

/** Admin / Manager: danh sách phòng phù hợp để admin tự chọn */
router.get(
  "/:id/candidate-rooms",
  auth,
  requireRole("admin", "manager"),
  applicationController.getCandidateRooms
);

router.get("/:id", auth, requireRole("admin", "manager", "user"), applicationController.getById);

/** Sinh viên: hủy đơn pending (REST DELETE theo spec) */
router.delete("/:id", auth, requireRole("user"), applicationController.cancelMine);

router.patch("/:id/approve", auth, requireRole("admin", "manager"), applicationController.approve);

router.patch(
  "/:id/reject",
  auth,
  requireRole("admin", "manager"),
  applicationValidators.rejectApplication,
  validateRequest,
  applicationController.reject
);

module.exports = router;
