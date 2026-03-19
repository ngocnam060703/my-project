const express = require("express");
const userController = require("../controllers/userController");
const { auth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(auth, requireRole("admin", "manager"));

router.get("/", userController.getAll);
router.get("/:id", userController.getById);
router.post("/", userController.create);
router.put("/:id", userController.update);
router.delete("/:id", requireRole("admin"), userController.delete);

module.exports = router;
