const express = require("express");
const contractController = require("../controllers/contractController");
const { auth, requireRole } = require("../middleware/auth");

const router = express.Router();

router.use(auth);
router.get("/my", contractController.getMyContracts);
router.put("/:id/sign", requireRole("user"), contractController.studentSign);
/** CRUD: tạo (UI admin có thể ẩn; vẫn có API). */
router.post("/", requireRole("admin", "manager"), contractController.create);
router.get(["/", ""], requireRole("admin", "manager"), contractController.getAll);
router.get("/:id", contractController.getById);
router.put("/:id/extend", requireRole("admin", "manager"), contractController.extend);
router.put("/:id/terminate", requireRole("admin", "manager"), contractController.terminate);
router.put("/:id/confirm-payment", requireRole("admin", "manager"), contractController.confirmPayment);
/** PUT /:id phải sau mọi route /:id/... */
router.put("/:id", requireRole("admin", "manager"), contractController.update);

module.exports = router;
