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

const priorityTypeRule = body("priorityType")
  .optional()
  .isIn(["normal", "martyr_child", "invalid_child", "minority", "disabled"])
  .withMessage("Diện ưu tiên không hợp lệ");

const priorityProofRule = body("priorityProofUrl")
  .optional({ values: "falsy" })
  .custom((v) => {
    if (v == null || String(v).trim() === "") return true;
    const value = String(v).trim();
    if (value.startsWith("blob:")) return true; // cho phép mock URL ở local frontend
    try {
      const u = new URL(value);
      if (u.protocol !== "http:" && u.protocol !== "https:") {
        throw new Error("Link minh chứng phải là URL http(s)");
      }
      return true;
    } catch {
      throw new Error("Link minh chứng không hợp lệ");
    }
  });

const priorityProofRequiredWhenPolicy = body("priorityProofUrl").custom((value, { req }) => {
  const t = String(req.body?.priorityType || "normal");
  if (t !== "normal" && (!value || String(value).trim() === "")) {
    throw new Error("Phải có minh chứng khi chọn diện ưu tiên");
  }
  return true;
});

exports.studentIdParam = [param("id").isMongoId().withMessage("ID sinh viên không hợp lệ")];

exports.createStudentRules = [
  body("fullName").trim().notEmpty().withMessage("Họ tên không được để trống"),
  body("email").trim().isEmail().withMessage("Email không hợp lệ").normalizeEmail(),
  body("password").isString().isLength({ min: 6 }).withMessage("Mật khẩu tối thiểu 6 ký tự"),
  body("studentId").trim().notEmpty().withMessage("Mã sinh viên không được để trống"),
  body("facultyGroup").trim().notEmpty().withMessage("Khoa/nhóm ngành không được để trống"),
  body("major").trim().notEmpty().withMessage("Ngành không được để trống"),
  body("faculty").trim().notEmpty().withMessage("Khóa không được để trống"),
  body("dateOfBirth").optional({ values: "falsy" }).isISO8601().withMessage("Ngày sinh không hợp lệ"),
  body("enrollmentDate").optional({ values: "falsy" }).isISO8601().withMessage("Ngày nhập học không hợp lệ"),
  studentPhoneRule,
  studentCitizenRule,
  body("ethnicity").optional().trim().isLength({ max: 100 }).withMessage("Dân tộc không hợp lệ"),
  priorityTypeRule,
  priorityProofRule,
  priorityProofRequiredWhenPolicy,
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
  body("ethnicity").optional().trim().isLength({ max: 100 }).withMessage("Dân tộc không hợp lệ"),
  priorityTypeRule,
  priorityProofRule,
  priorityProofRequiredWhenPolicy,
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
  body("dateOfBirth").optional({ values: "falsy" }).isISO8601().withMessage("Ngày sinh không hợp lệ"),
  body("enrollmentDate").optional({ values: "falsy" }).isISO8601().withMessage("Ngày nhập học không hợp lệ"),
  studentCitizenRule,
  body("ethnicity").optional().trim().isLength({ max: 100 }).withMessage("Dân tộc không hợp lệ"),
  priorityTypeRule,
  priorityProofRule,
  priorityProofRequiredWhenPolicy,
  optionalAvatarUrl(),
];
