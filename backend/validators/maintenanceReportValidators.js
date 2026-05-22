const { body, param, query } = require("express-validator");

const INCIDENT_TYPES = ["electricity", "water", "equipment", "other"];
const STATUSES = ["pending", "processing", "resolved", "cancelled", "all"];
const SEVERITIES = ["light", "medium", "heavy", ""];
const DAMAGE_CAUSES = ["natural_wear", "student_caused", ""];
const RESOLUTION_TYPES = ["maintenance", "compensation", ""];
const MAINTENANCE_STATUSES = ["none", "scheduled", "in_progress", "completed", ""];

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
  body("resolutionType").not().exists().withMessage("Sinh viên không được chọn loại xử lý"),
  body("compensationAmount").not().exists().withMessage("Sinh viên không được nhập bồi thường"),
  body("damageCause").not().exists().withMessage("Sinh viên không được chọn nguyên nhân xử lý"),
  body("severity").not().exists().withMessage("Sinh viên không được chọn mức độ xử lý"),
];

exports.validateMongoIdParam = [param("id").isMongoId().withMessage("id không hợp lệ")];

/** PATCH admin */
exports.validateAdminPatch = [
  param("id").isMongoId().withMessage("id không hợp lệ"),
  body("status").optional().isIn(["pending", "processing", "resolved"]).withMessage("status không hợp lệ"),
  body("adminNote").optional().isString().isLength({ max: 4000 }),
  body("severity").optional().isIn(SEVERITIES).withMessage("Mức độ không hợp lệ"),
  body("damageCause").optional().isIn(DAMAGE_CAUSES).withMessage("Nguyên nhân không hợp lệ"),
  body("resolutionType").optional().isIn(RESOLUTION_TYPES).withMessage("Loại xử lý không hợp lệ"),
  body("maintenanceStatus").optional().isIn(MAINTENANCE_STATUSES).withMessage("Trạng thái bảo trì không hợp lệ"),
  body("compensationAmount")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("Chi phí bồi thường không hợp lệ"),
];

exports.validateAdminListQuery = [
  query("status")
    .optional()
    .custom((v) => !v || STATUSES.includes(String(v)))
    .withMessage("status filter không hợp lệ"),
  query("page").optional().isInt({ min: 1 }),
  query("limit").optional().isInt({ min: 1, max: 100 }),
  query("month").optional().isInt({ min: 1, max: 12 }),
  query("year").optional().isInt({ min: 2000, max: 2100 }),
  query("date").optional().isISO8601().withMessage("Ngày không hợp lệ"),
  query("search").optional().isString().isLength({ max: 200 }),
];
