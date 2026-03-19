const express = require("express");
const contractController = require("../controllers/contractController");
const { auth, requireRole } = require("../middleware/auth");

const router = express.Router();

router.use(auth);
router.get("/my", contractController.getMyContracts);
router.get(["/", ""], requireRole("admin", "manager"), contractController.getAll);
router.get("/:id", contractController.getById);
router.put("/:id/extend", requireRole("admin", "manager"), contractController.extend);
router.put("/:id/terminate", requireRole("admin", "manager"), contractController.terminate);

module.exports = router;
