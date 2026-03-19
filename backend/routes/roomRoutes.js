const express = require("express");
const roomController = require("../controllers/roomController");
const { auth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.get("/", roomController.getAll);
router.get("/:id", roomController.getById);

router.use(auth, requireRole("admin", "manager"));
router.post("/", roomController.create);
router.put("/:id", roomController.update);
router.delete("/:id", roomController.delete);

module.exports = router;
