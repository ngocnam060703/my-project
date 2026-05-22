const express = require("express");
const ratingController = require("../controllers/ratingController");
const { auth } = require("../middleware/auth");

const router = express.Router();
router.get("/room/:roomId", ratingController.getByRoom);
router.post("/room/:roomId", auth, ratingController.createReview);
router.post("/", auth, ratingController.createReview);

module.exports = router;
