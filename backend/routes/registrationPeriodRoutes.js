const express = require("express");
const registrationPeriodController = require("../controllers/registrationPeriodController");
const { auth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.get("/active", auth, registrationPeriodController.getActive);

router.use(auth, requireRole("admin", "manager"));
router.get("/", registrationPeriodController.getAll);
router.post("/", registrationPeriodController.create);
router.put("/:id", registrationPeriodController.update);
router.delete("/:id", registrationPeriodController.delete);

module.exports = router;
