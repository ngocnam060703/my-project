const express = require("express");
const registrationController = require("../controllers/registrationController");
const { auth, requireRole } = require("../middleware/auth");

const router = express.Router();

router.get("/my", auth, registrationController.getMyRegistrations);
router.post("/", auth, registrationController.create);

router.use(auth, requireRole("admin", "manager"));
router.get("/", registrationController.getAll);
router.put("/:id/approve", registrationController.approve);
router.put("/:id/reject", registrationController.reject);

module.exports = router;
