const { body, param, query } = require("express-validator");

const INCIDENT_TYPES = ["electricity", "water", "equipment", "other"];

/** POST /api/reports — sinh viên: type + description; phòng lấy từ hợp đồng active */
exports.validateCreateMaintenance = [
  body("type").isIn(INCIDENT_TYPES).withMessage("Loại sự cố không hợp lệ"),
  body("description")
    .trim()
    .notEmpty()
    .withMessage("Mô tả không được để trống")
    .isLength({ max: 8000 })
    .withMessage("Mô tả quá dài"),
  body("images")
    .optional()
    .isArray({ max: 10 })
    .withMessage("Tối đa 10 ảnh"),
  body("images.*")
    .optional()
    .isString()
    .isLength({ max: 600000 })
    .withMessage("Một ảnh/URL quá dài"),
];

exports.validateMongoIdParam = [param("id").isMongoId().withMessage("id không hợp lệ")];

/** PATCH admin: status + ghi chú */
exports.validateAdminPatch = [
  param("id").isMongoId().withMessage("id không hợp lệ"),
  body("status").optional().isIn(["pending", "processing", "resolved"]).withMessage("status không hợp lệ"),
  body("adminNote").optional().isString().isLength({ max: 4000 }),
];

exports.validateAdminListQuery = [
  query("status")
    .optional()
    .custom((v) => !v || ["pending", "processing", "resolved", "all"].includes(String(v)))
    .withMessage("status filter không hợp lệ"),
  query("page").optional().isInt({ min: 1 }),
  query("limit").optional().isInt({ min: 1, max: 100 }),
];
