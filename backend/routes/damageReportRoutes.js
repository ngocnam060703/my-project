const express = require("express");
const damageReportController = require("../controllers/damageReportController");
const { auth } = require("../middleware/auth");

const router = express.Router();
router.get("/my", auth, damageReportController.getMy);
router.post("/", auth, damageReportController.create);

module.exports = router;
