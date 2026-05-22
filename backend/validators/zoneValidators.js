const { body, param } = require("express-validator");

exports.zoneIdParam = [param("id").isMongoId().withMessage("ID khu không hợp lệ")];

exports.createZoneRules = [
  body("name").trim().notEmpty().withMessage("Tên khu không được để trống"),
  body("description").optional().isString(),
  body("plannedTotalRooms").optional({ values: "falsy" }).isInt({ min: 0 }).withMessage("Tổng số phòng phải >= 0"),
  body("plannedCapacity").optional({ values: "falsy" }).isInt({ min: 0 }).withMessage("Sức chứa phải >= 0"),
  body("genderPolicy").optional().isIn(["male", "female", "mixed"]),
  body("manager").optional({ values: "falsy" }).isMongoId().withMessage("Quản lý không hợp lệ"),
];

exports.updateZoneRules = [
  ...exports.zoneIdParam,
  body("name").optional().trim().notEmpty().withMessage("Tên khu không được để trống"),
  body("description").optional().isString(),
  body("plannedTotalRooms").optional({ values: "falsy" }).isInt({ min: 0 }).withMessage("Tổng số phòng phải >= 0"),
  body("plannedCapacity").optional({ values: "falsy" }).isInt({ min: 0 }).withMessage("Sức chứa phải >= 0"),
  body("genderPolicy").optional().isIn(["male", "female", "mixed"]),
  body("manager").optional({ values: "falsy" }).isMongoId().withMessage("Quản lý không hợp lệ"),
];
