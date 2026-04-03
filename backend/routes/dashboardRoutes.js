const express = require("express");
const dashboardController = require("../controllers/dashboardController");
const contractExtensionSettingController = require("../controllers/contractExtensionSettingController");
const { auth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.get("/contract-extension-setting", auth, contractExtensionSettingController.getContractExtensionSetting);
router.get("/stats", auth, requireRole("admin", "manager"), dashboardController.getStats);
router.put(
  "/contract-extension-setting",
  auth,
  requireRole("admin", "manager"),
  contractExtensionSettingController.setContractExtensionSetting,
);

module.exports = router;
