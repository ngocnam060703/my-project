const express = require("express");
const contractController = require("../controllers/contractController");
const { auth, requireRole } = require("../middleware/auth");
const validateRequest = require("../middleware/validateRequest");
const contractValidators = require("../validators/contractValidators");

const router = express.Router();

router.use(auth);

router.get("/my", contractController.getMyContracts);

/** Admin / Manager — đặt trước /:id để không bị nuốt */
router.get(
  "/extend-requests",
  requireRole("admin", "manager"),
  contractValidators.listExtendRequestsQuery,
  validateRequest,
  contractController.listExtendRequests
);
router.patch(
  "/extend-requests/:requestId/approve",
  requireRole("admin", "manager"),
  contractController.approveExtendRequest
);
router.patch(
  "/extend-requests/:requestId/reject",
  requireRole("admin", "manager"),
  contractValidators.rejectExtendRequest,
  validateRequest,
  contractController.rejectExtendRequest
);

router.put("/:id/sign", requireRole("user"), contractController.studentSign);

/** Sinh viên — gửi yêu cầu gia hạn (pending) */
router.post(
  "/:id/request-extend",
  requireRole("user"),
  contractValidators.requestExtend,
  validateRequest,
  contractController.requestExtend
);

router.post("/", requireRole("admin", "manager"), contractController.create);
router.get(["/", ""], requireRole("admin", "manager"), contractController.getAll);
router.get("/:id/360", requireRole("admin", "manager"), contractController.get360);
router.get("/:id", contractController.getById);
router.put("/:id/extend", requireRole("admin", "manager"), contractController.extend);
router.put("/:id/terminate", requireRole("admin", "manager"), contractController.terminate);
router.put("/:id/confirm-payment", requireRole("admin", "manager"), contractController.confirmPayment);
router.put("/:id", requireRole("admin", "manager"), contractController.update);

module.exports = router;
