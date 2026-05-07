const express = require("express");
const { auth, requireRole } = require("../middleware/auth");
const bedController = require("../controllers/bedController");

const router = express.Router();
router.use(auth, requireRole("admin", "manager"));

router.patch("/:bedId/status", bedController.updateBedStatus);
router.post("/:bedId/checkout", bedController.checkoutBed);
router.get("/:bedId/history", bedController.getBedHistory);

module.exports = router;

