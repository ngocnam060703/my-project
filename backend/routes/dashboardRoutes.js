const express = require("express");
const dashboardController = require("../controllers/dashboardController");
const { auth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(auth, requireRole("admin", "manager"));
router.get("/stats", dashboardController.getStats);

module.exports = router;
