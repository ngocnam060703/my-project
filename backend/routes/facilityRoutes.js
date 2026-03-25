const express = require("express");
const facilityController = require("../controllers/facilityController");
const { auth, requireRole } = require("../middleware/auth");

const router = express.Router();

router.use(auth);

// Student
router.get("/my-room", requireRole("user"), facilityController.getMyRoomFacilities);

// Admin/manager
router.get("/stats", requireRole("admin", "manager"), facilityController.getFacilityStats);
router.get("/locations", requireRole("admin", "manager"), facilityController.getFacilityLocations);
router.put("/locations/:id", requireRole("admin", "manager"), facilityController.updateFacilityLocation);
router.delete("/locations/:id", requireRole("admin", "manager"), facilityController.deleteFacilityLocation);
router.get("/", requireRole("admin", "manager"), facilityController.getAllFacilities);
router.post("/", requireRole("admin", "manager"), facilityController.createFacility);
router.put("/:id", requireRole("admin", "manager"), facilityController.updateFacility);
router.delete("/:id", requireRole("admin", "manager"), facilityController.deleteFacility);
router.post("/locations", requireRole("admin", "manager"), facilityController.assignFacilityLocation);

module.exports = router;
