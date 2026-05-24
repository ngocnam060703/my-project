const { body, param, query } = require("express-validator");

const STATUSES = ["pending", "processing", "resolved", "cancelled", "all"];
const DAMAGE_CAUSES = ["natural_wear", "student_caused"];

/** POST /api/reports — SV: thiết bị/vật tư + mô tả + ảnh */
exports.validateCreateMaintenance = [
  body("type").not().exists().withMessage("Sinh viên không gửi loại sự cố cũ"),
  body("incidentType").not().exists().withMessage("Sinh viên không gửi loại sự cố cũ"),
  body("facilityLocationId").optional().isMongoId().withMessage("CSVC phòng không hợp lệ"),
  body("damagedItemLabel")
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage("Tên thiết bị quá dài"),
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
  body("status").not().exists().withMessage("Sinh viên không được đặt trạng thái"),
  body("resolutionType").not().exists().withMessage("Sinh viên không được chọn loại xử lý"),
  body("compensationAmount").not().exists().withMessage("Sinh viên không được nhập phí đền bù"),
  body("damageCause").not().exists().withMessage("Sinh viên không được chọn nguyên nhân"),
  body("severity").not().exists().withMessage("Sinh viên không được chọn mức độ"),
  body().custom((_, { req }) => {
    const loc = req.body?.facilityLocationId;
    const label = String(req.body?.damagedItemLabel || "").trim();
    if (!loc && label.length < 2) {
      throw new Error("Vui lòng chọn thiết bị/vật tư hỏng hoặc nhập tên (tối thiểu 2 ký tự)");
    }
    return true;
  }),
];

exports.validateMongoIdParam = [param("id").isMongoId().withMessage("id không hợp lệ")];

/** PATCH admin — kiểm tra & phán quyết */
exports.validateAdminPatch = [
  param("id").isMongoId().withMessage("id không hợp lệ"),
  body("status")
    .optional()
    .isIn(["pending", "processing", "resolved"])
    .withMessage("status không hợp lệ"),
  body("adminNote").optional().isString().isLength({ max: 4000 }),
  body("damageCause")
    .optional()
    .isIn(DAMAGE_CAUSES)
    .withMessage("Nguyên nhân phải là hao mòn tự nhiên hoặc sinh viên làm hỏng"),
  body("compensationAmount")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("Phí đền bù không hợp lệ"),
  body("severity").not().exists().withMessage("Không dùng mức độ — chỉ nguyên nhân & phí đền bù"),
  body("resolutionType").not().exists().withMessage("Loại xử lý được suy ra từ nguyên nhân"),
  body("maintenanceStatus").not().exists().withMessage("Trạng thái đơn dùng pending/processing/resolved"),
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
