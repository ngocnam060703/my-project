const express = require("express");
const { auth, requireRole } = require("../middleware/auth");
const roomServiceController = require("../controllers/roomServiceController");

const router = express.Router();
router.use(auth, requireRole("admin", "manager"));

router.get("/", roomServiceController.list);
router.post("/", roomServiceController.create);
router.delete("/:id", roomServiceController.remove);

module.exports = router;
