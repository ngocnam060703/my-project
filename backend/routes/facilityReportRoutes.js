const express = require("express");
const facilityController = require("../controllers/facilityController");
const { auth, requireRole } = require("../middleware/auth");

const router = express.Router();

router.use(auth);

// Student
router.get("/my", requireRole("user"), facilityController.getFacilityReportsMy);
router.get("/room/:roomId/facilities", requireRole("user"), facilityController.getReportableFacilitiesByRoom);
router.post("/", requireRole("user"), facilityController.createFacilityReport);

// Admin/manager
router.get("/", requireRole("admin", "manager"), facilityController.getFacilityReports);
router.put("/:id/approve", requireRole("admin", "manager"), facilityController.approveFacilityReport);
router.put("/:id/reject", requireRole("admin", "manager"), facilityController.rejectFacilityReport);
router.put("/:id/done", requireRole("admin", "manager"), facilityController.doneFacilityReport);

module.exports = router;
