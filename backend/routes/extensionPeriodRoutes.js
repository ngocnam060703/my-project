const express = require("express");
const extensionPeriodController = require("../controllers/extensionPeriodController");
const { auth, requireRole } = require("../middleware/auth");

const router = express.Router();

router.get("/active", auth, extensionPeriodController.getActive);

router.use(auth, requireRole("admin", "manager"));
router.get("/", extensionPeriodController.getAll);
router.post("/", extensionPeriodController.create);
router.put("/:id", extensionPeriodController.update);
router.delete("/:id", extensionPeriodController.delete);

module.exports = router;
