const express = require("express");
const { auth, requireRole } = require("../middleware/auth");
const disciplinaryController = require("../controllers/disciplinaryController");
const { resolveDisciplinaryRules, violationIdParam } = require("../validators/violationValidators");

const router = express.Router();

router.post("/", auth, requireRole("admin", "manager"), resolveDisciplinaryRules, disciplinaryController.resolveDisciplinary);
router.get("/:violationId", auth, violationIdParam, disciplinaryController.getDisciplinary);

module.exports = router;
