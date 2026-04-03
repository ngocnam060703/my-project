const express = require("express");
const billController = require("../controllers/billController");
const { auth, requireRole } = require("../middleware/auth");

const router = express.Router();

router.get("/my", auth, billController.getMyBills);
router.put("/:id/paid", auth, billController.markPaid);
router.put("/:id/pay-online", auth, billController.payOnline);

router.use(auth, requireRole("admin", "manager"));
router.get("/", billController.getAll);
router.post("/", billController.create);
router.post("/generate", billController.generateByMonth);

module.exports = router;
