const { body, query } = require("express-validator");

exports.createApplication = [
  body("semester").trim().notEmpty().withMessage("Học kỳ là bắt buộc"),
  body("schoolYear").trim().notEmpty().withMessage("Năm học là bắt buộc"),
  body("startDate").notEmpty().withMessage("Ngày bắt đầu là bắt buộc"),
  body("preferenceArea").optional({ values: "falsy" }).isMongoId().withMessage("preferenceArea không hợp lệ"),
];

exports.rejectApplication = [
  body("note").optional().isString(),
  body("reason").optional().isString(),
  body().custom((_, { req }) => {
    const t = `${String(req.body?.note ?? "").trim()}${String(req.body?.reason ?? "").trim()}`;
    if (!t) throw new Error("Vui lòng nhập lý do từ chối (note hoặc reason)");
    return true;
  }),
];

exports.listApplications = [
  query("status")
    .optional({ values: "falsy" })
    .isIn(["pending", "approved", "rejected"])
    .withMessage("status không hợp lệ"),
  query("sortOrder").optional({ values: "falsy" }).isIn(["asc", "desc"]).withMessage("sortOrder phải là asc hoặc desc"),
  /** Tham số query luôn là chuỗi — bật allow_string cho isInt */
  query("page").optional({ values: "falsy" }).isInt({ min: 1 }).withMessage("page phải là số nguyên ≥ 1"),
  query("limit").optional({ values: "falsy" }).isInt({ min: 1, max: 100 }).withMessage("limit từ 1 đến 100"),
];

exports.statsByDay = [
  query("days").optional({ values: "falsy" }).isInt({ min: 1, max: 90 }).withMessage("days từ 1 đến 90"),
];
