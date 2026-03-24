const express = require("express");
const roomCostController = require("../controllers/roomCostController");
const { auth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(auth, requireRole("admin", "manager"));

router.get("/", roomCostController.getRoomCosts);
router.post("/", roomCostController.upsertRoomCost);

module.exports = router;
