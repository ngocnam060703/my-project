const { body, query } = require("express-validator");

exports.requestExtend = [
  body("months")
    .toInt()
    .isInt({ min: 1, max: 36 })
    .withMessage("months phải từ 1 đến 36"),
];

exports.rejectExtendRequest = [
  body("note").trim().notEmpty().withMessage("Vui lòng nhập lý do từ chối"),
];

exports.listExtendRequestsQuery = [
  query("status")
    .optional({ values: "falsy" })
    .isIn(["pending", "approved", "rejected", "all"])
    .withMessage("status không hợp lệ"),
];
