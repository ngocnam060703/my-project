const express = require("express");
const notificationController = require("../controllers/notificationController");
const { auth } = require("../middleware/auth");

const router = express.Router();
router.get("/", auth, notificationController.getMy);
router.put("/:id/read", auth, notificationController.markRead);
router.put("/read-all", auth, notificationController.markAllRead);

module.exports = router;
