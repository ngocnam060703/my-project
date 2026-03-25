const express = require("express");
const violationController = require("../controllers/violationController");
const { auth, requireRole } = require("../middleware/auth");

const router = express.Router();

router.get("/rules", auth, violationController.getRules);

router.get("/my", auth, requireRole("user"), violationController.getMyViolations);
router.get("/my/stats", auth, requireRole("user"), violationController.getMyDisciplineStats);

router.use(auth, requireRole("admin", "manager"));
router.get("/", violationController.getAllViolations);
router.get("/students-summary", violationController.getStudentSummary);
router.post("/", violationController.createViolation);

module.exports = router;
