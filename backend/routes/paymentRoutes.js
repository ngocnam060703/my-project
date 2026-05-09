const express = require("express");
const paymentController = require("../controllers/paymentController");
const { auth } = require("../middleware/auth");

const router = express.Router();

router.post("/create-vnpay", auth, paymentController.createVnpay);
router.get("/vnpay-return", paymentController.vnpayReturn);
router.get("/vnpay-ipn", paymentController.vnpayIpn);

module.exports = router;
