const express = require("express");
const { body } = require("express-validator");
const authController = require("../controllers/authController");
const { auth } = require("../middleware/auth");
const { createAuthLimiter } = require("../config/rateLimits");

const router = express.Router();
const authLimiter = createAuthLimiter();

router.post(
  "/register",
  authLimiter,
  [
    body("email").isEmail().withMessage("Email không hợp lệ"),
    body("password").isLength({ min: 6 }).withMessage("Mật khẩu tối thiểu 6 ký tự"),
    body("fullName").notEmpty().withMessage("Họ tên không được để trống"),
  ],
  authController.register
);
router.post("/login", authLimiter, authController.login);
router.get("/profile", auth, authController.getProfile);
router.put("/profile", auth, authController.updateProfile);

module.exports = router;
