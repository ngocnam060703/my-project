const express = require("express");
const studentDashboardController = require("../controllers/studentDashboardController");
const { auth } = require("../middleware/auth");

const router = express.Router();
router.get("/", auth, studentDashboardController.getDashboard);

module.exports = router;
