const express = require("express");
const serviceController = require("../controllers/serviceController");
const { auth, requireRole } = require("../middleware/auth");

const router = express.Router();

router.use(auth);

// Shared
router.get("/", serviceController.getServices);

// Student
router.get("/period-lock-status", requireRole("user"), serviceController.getPeriodLockStatus);
router.get("/my-registrations", requireRole("user"), serviceController.getMyServiceRegistrations);
router.post("/my-registrations", requireRole("user"), serviceController.upsertMyServiceRegistration);
router.get("/my-laundry-usage/summary", requireRole("user"), serviceController.getMyLaundryUsageSummary);
router.post("/my-laundry-usage/use", requireRole("user"), serviceController.recordMyLaundryUse);

// Admin/manager
router.post("/", requireRole("admin", "manager"), serviceController.createService);
router.patch("/:id", requireRole("admin", "manager"), serviceController.patchService);
router.put("/:id", requireRole("admin", "manager"), serviceController.updateService);
router.delete("/:id", requireRole("admin", "manager"), serviceController.deleteService);
router.put("/:id/toggle", requireRole("admin", "manager"), serviceController.toggleService);

module.exports = router;
