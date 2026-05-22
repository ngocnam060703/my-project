const { body, param } = require("express-validator");

function optionalAvatarUrl() {
  return body("avatar")
    .optional({ values: "falsy" })
    .trim()
    .custom((v) => {
      if (v === "" || v == null) return true;
      try {
        const u = new URL(v);
        if (u.protocol !== "http:" && u.protocol !== "https:") {
          throw new Error("Avatar phải là URL http(s)");
        }
        return true;
      } catch {
        throw new Error("Avatar phải là URL hợp lệ");
      }
    });
}

exports.createUserRules = [
  body("fullName").trim().notEmpty().withMessage("Tên không được để trống"),
  body("email").trim().isEmail().withMessage("Email không hợp lệ").normalizeEmail(),
  body("password")
    .isString()
    .isLength({ min: 6 })
    .withMessage("Mật khẩu tối thiểu 6 ký tự"),
  optionalAvatarUrl(),
  body("role").optional().isIn(["user", "student", "manager", "admin"]).withMessage("Vai trò không hợp lệ"),
];

exports.updateUserRules = [
  param("id").isMongoId().withMessage("ID không hợp lệ"),
  body("email").custom((v) => {
    if (v !== undefined) {
      throw new Error("Không được đổi email qua API này");
    }
    return true;
  }),
  body("fullName").optional().trim().notEmpty().withMessage("Tên không được để trống"),
  optionalAvatarUrl(),
  body("role").optional().isIn(["user", "student", "manager", "admin"]).withMessage("Vai trò không hợp lệ"),
  body("password")
    .optional()
    .isString()
    .isLength({ min: 6 })
    .withMessage("Mật khẩu tối thiểu 6 ký tự"),
];

exports.resetPasswordRules = [
  body("newPassword")
    .isString()
    .isLength({ min: 6 })
    .withMessage("Mật khẩu mới tối thiểu 6 ký tự"),
];

exports.mongoIdParam = [param("id").isMongoId().withMessage("ID không hợp lệ")];
