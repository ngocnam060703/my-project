const { body, query } = require("express-validator");

exports.createContract = [
  body("user").notEmpty().withMessage("Thiếu user"),
  body("room").notEmpty().withMessage("Thiếu room"),
  body("startDate").notEmpty().withMessage("Thiếu startDate"),
  body("endDate").notEmpty().withMessage("Thiếu endDate"),
  body("status")
    .optional()
    .isIn(["pending_payment", "active", "expired", "terminated"])
    .withMessage("Trạng thái không hợp lệ"),
];

exports.updateContract = [
  body("status")
    .optional()
    .isIn(["pending_payment", "active", "expired", "terminated"])
    .withMessage("Trạng thái không hợp lệ"),
];

exports.extendContract = [body("endDate").notEmpty().withMessage("Thiếu endDate")];

exports.terminateContract = [body("reason").optional({ values: "falsy" }).trim().isLength({ max: 500 }).withMessage("Lý do không hợp lệ")];

exports.uploadSignedPdf = [
  body("signedPdfUrl")
    .trim()
    .notEmpty()
    .withMessage("Thiếu đường dẫn PDF đã ký")
    .bail()
    .matches(/\.pdf(\?.*)?$/i)
    .withMessage("signedPdfUrl phải là file PDF"),
];

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
