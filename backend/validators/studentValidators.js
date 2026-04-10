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

const studentPhoneRule = body("phone")
  .optional()
  .custom((v) => {
    if (v == null || String(v).trim() === "") return true;
    return /^(0|\+84)\d{9,10}$/.test(String(v).trim());
  })
  .withMessage("Số điện thoại không hợp lệ");

const studentCitizenRule = body("citizenId")
  .optional()
  .custom((v) => {
    if (v == null || String(v).trim() === "") return true;
    return /^\d{9,12}$/.test(String(v).trim());
  })
  .withMessage("CCCD phải gồm 9-12 chữ số");

exports.studentIdParam = [param("id").isMongoId().withMessage("ID sinh viên không hợp lệ")];

exports.createStudentRules = [
  body("fullName").trim().notEmpty().withMessage("Họ tên không được để trống"),
  body("email").trim().isEmail().withMessage("Email không hợp lệ").normalizeEmail(),
  body("password").isString().isLength({ min: 6 }).withMessage("Mật khẩu tối thiểu 6 ký tự"),
  body("studentId").trim().notEmpty().withMessage("Mã sinh viên không được để trống"),
  body("major").trim().notEmpty().withMessage("Ngành không được để trống"),
  body("faculty").trim().notEmpty().withMessage("Khoa không được để trống"),
  body("dateOfBirth").optional({ values: "falsy" }).isISO8601().withMessage("Ngày sinh không hợp lệ"),
  body("enrollmentDate").optional({ values: "falsy" }).isISO8601().withMessage("Ngày nhập học không hợp lệ"),
  studentPhoneRule,
  studentCitizenRule,
  optionalAvatarUrl(),
];

exports.adminUpdateStudentRules = [
  ...exports.studentIdParam,
  body("email").optional().isEmail().withMessage("Email không hợp lệ").normalizeEmail(),
  body("fullName").optional().trim().notEmpty().withMessage("Họ tên không được để trống"),
  body("password").optional().isString().isLength({ min: 6 }).withMessage("Mật khẩu tối thiểu 6 ký tự"),
  body("dateOfBirth").optional({ values: "falsy" }).isISO8601().withMessage("Ngày sinh không hợp lệ"),
  body("enrollmentDate").optional({ values: "falsy" }).isISO8601().withMessage("Ngày nhập học không hợp lệ"),
  studentPhoneRule,
  studentCitizenRule,
  optionalAvatarUrl(),
];

exports.studentSelfUpdateRules = [
  body("phone")
    .optional()
    .custom((v) => {
      if (v == null || String(v).trim() === "") return true;
      return /^(0|\+84)\d{9,10}$/.test(String(v).trim());
    })
    .withMessage("Số điện thoại không hợp lệ"),
  optionalAvatarUrl(),
];
