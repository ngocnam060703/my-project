const express = require("express");
const roomController = require("../controllers/roomController");
const bedController = require("../controllers/bedController");
const { auth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.get("/", roomController.getAll);
router.get("/:id", roomController.getById);

router.use(auth, requireRole("admin", "manager"));
router.get("/:id/residents", roomController.getResidents);
router.put("/:id/room-leader", roomController.setRoomLeader);
router.get("/:id/beds", bedController.getRoomBeds);
router.post("/:id/beds/assign", bedController.assignBed);
router.post("/", roomController.create);
router.put("/:id", roomController.update);
router.delete("/:id", roomController.delete);

module.exports = router;
