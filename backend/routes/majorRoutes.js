const express = require("express");
const { auth, requireRole } = require("../middleware/auth");
const majorController = require("../controllers/majorController");

const router = express.Router();

// Anyone logged-in can read majors for dropdown
router.use(auth);
router.get("/", majorController.list);

// Only admin/manager can mutate
router.post("/", requireRole("admin", "manager"), majorController.create);
router.patch("/:id", requireRole("admin", "manager"), majorController.update);
router.delete("/:id", requireRole("admin"), majorController.remove);

module.exports = router;

