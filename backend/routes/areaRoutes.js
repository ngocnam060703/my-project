const express = require("express");
const areaController = require("../controllers/areaController");
const { auth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.get("/", areaController.getAll);
router.get("/:id", areaController.getById);

router.use(auth, requireRole("admin", "manager"));
router.post("/", areaController.create);
router.put("/:id", areaController.update);
router.delete("/:id", requireRole("admin"), areaController.delete);

module.exports = router;
