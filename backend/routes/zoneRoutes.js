const express = require("express");
const zoneController = require("../controllers/zoneController");
const { auth, requireRole } = require("../middleware/auth");
const validateRequest = require("../middleware/validateRequest");
const { createZoneRules, updateZoneRules, zoneIdParam } = require("../validators/zoneValidators");

const router = express.Router();
router.use(auth, requireRole("admin", "manager"));

router.get("/", zoneController.list);
router.post("/", createZoneRules, validateRequest, zoneController.create);
router.get("/:id", zoneIdParam, validateRequest, zoneController.getById);
router.patch("/:id", updateZoneRules, validateRequest, zoneController.update);
router.delete("/:id", requireRole("admin"), zoneIdParam, validateRequest, zoneController.remove);

module.exports = router;
