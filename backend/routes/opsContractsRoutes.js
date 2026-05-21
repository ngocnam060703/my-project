const express = require("express");
const { auth, requireRole } = require("../middleware/auth");
const opsContractsController = require("../controllers/opsContractsController");

const router = express.Router();

router.use(auth, requireRole("admin", "manager"));

router.get("/contracts/dashboard", opsContractsController.getDashboard);

module.exports = router;

