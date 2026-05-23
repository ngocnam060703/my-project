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

router.put(
  "/:id/sign",
  requireRole("user"),
  contractValidators.studentSign,
  validateRequest,
  contractController.studentSign
);

router.get(
  "/:id/renewal-preview",
  requireRole("user"),
  contractValidators.renewalPreviewQuery,
  validateRequest,
  contractController.getRenewalPreview
);

router.post(
  "/:id/confirm-renewal",
  requireRole("user"),
  contractValidators.confirmRenewal,
  validateRequest,
  contractController.confirmRenewal
);

/** Legacy — gửi yêu cầu chờ admin (khuyến nghị confirm-renewal) */
router.post(
  "/:id/request-extend",
  requireRole("user"),
  contractValidators.requestExtend,
  validateRequest,
  contractController.requestExtend
);

router.post(
  "/",
  requireRole("admin", "manager"),
  contractValidators.createContract,
  validateRequest,
  contractController.create
);
router.get(["/", ""], requireRole("admin", "manager"), contractController.getAll);
router.get("/:id/360", requireRole("admin", "manager"), contractController.get360);
router.get("/:id", contractController.getById);
router.put(
  "/:id/extend",
  requireRole("admin", "manager"),
  contractValidators.extendContract,
  validateRequest,
  contractController.extend
);
router.put(
  "/:id/terminate",
  requireRole("admin", "manager"),
  contractValidators.terminateContract,
  validateRequest,
  contractController.terminate
);
router.put(
  "/:id/upload-signed-pdf",
  requireRole("admin", "manager"),
  contractValidators.uploadSignedPdf,
  validateRequest,
  contractController.uploadSignedPdf
);
router.put("/:id/confirm-payment", requireRole("admin", "manager"), contractController.confirmPayment);
router.put("/:id/ensure-bed", requireRole("admin", "manager"), contractController.ensureBed);
router.put("/:id", requireRole("admin", "manager"), contractController.update);
router.delete("/:id", requireRole("admin", "manager"), contractController.remove);

module.exports = router;
