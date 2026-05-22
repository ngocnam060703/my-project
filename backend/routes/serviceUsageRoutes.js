const express = require("express");
const { auth, requireRole } = require("../middleware/auth");
const serviceUsageController = require("../controllers/serviceUsageController");

const router = express.Router();
router.use(auth, requireRole("admin", "manager"));

router.get("/period-status", serviceUsageController.periodStatus);
router.get("/", serviceUsageController.list);
router.post("/", serviceUsageController.create);

module.exports = router;
