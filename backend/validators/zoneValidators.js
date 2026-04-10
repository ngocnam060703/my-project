const { body, param } = require("express-validator");

exports.zoneIdParam = [param("id").isMongoId().withMessage("ID khu không hợp lệ")];

exports.createZoneRules = [
  body("name").trim().notEmpty().withMessage("Tên khu không được để trống"),
  body("description").optional().isString(),
  body("plannedTotalRooms").isInt({ min: 1 }).withMessage("Tổng số phòng phải > 0"),
  body("plannedCapacity").isInt({ min: 1 }).withMessage("Sức chứa phải > 0"),
  body("genderPolicy").optional().isIn(["male", "female", "mixed"]),
  body("manager").optional({ values: "falsy" }).isMongoId().withMessage("Quản lý không hợp lệ"),
];

exports.updateZoneRules = [
  ...exports.zoneIdParam,
  body("name").optional().trim().notEmpty().withMessage("Tên khu không được để trống"),
  body("description").optional().isString(),
  body("plannedTotalRooms").optional().isInt({ min: 1 }).withMessage("Tổng số phòng phải > 0"),
  body("plannedCapacity").optional().isInt({ min: 1 }).withMessage("Sức chứa phải > 0"),
  body("genderPolicy").optional().isIn(["male", "female", "mixed"]),
  body("manager").optional({ values: "falsy" }).isMongoId().withMessage("Quản lý không hợp lệ"),
];
