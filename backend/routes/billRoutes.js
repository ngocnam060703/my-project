const express = require("express");
const billController = require("../controllers/billController");
const { auth, requireRole } = require("../middleware/auth");

const router = express.Router();

router.get("/my", auth, billController.getMyBills);

router.use(auth, requireRole("admin", "manager"));
router.get("/", billController.getAll);
router.post("/", billController.create);
router.put("/:id/paid", billController.markPaid);

module.exports = router;
