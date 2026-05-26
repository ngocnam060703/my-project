const { body, param, validationResult } = require("express-validator");

function handleValidation(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: "Dữ liệu không hợp lệ", errors: errors.array() });
  }
  next();
}

const updateViolationRules = [
  param("id").isMongoId().withMessage("id không hợp lệ"),
  body("description").optional().isString().isLength({ max: 5000 }),
  body("fineAmount").optional().isFloat({ min: 0 }),
  body("compensationAmount").optional().isFloat({ min: 0 }),
  body("schoolYear").optional().isString().isLength({ min: 1, max: 32 }),
  body("semester").optional().isString().isLength({ min: 1, max: 16 }),
  handleValidation,
];

const resolveDisciplinaryRules = [
  body("violationId").isMongoId().withMessage("violationId không hợp lệ"),
  body("penaltyAmount").optional({ values: "null" }).isFloat({ min: 0 }),
  body("note").optional().isString().isLength({ max: 2000 }),
  body().custom((_, { req }) => {
    const at = req.body.actionType;
    if (!["warning", "fine", "compensation", "expulsion"].includes(at)) {
      throw new Error("actionType phải là: warning | fine | compensation | expulsion");
    }
    if (at === "fine" || at === "compensation") {
      const n = Number(req.body.penaltyAmount);
      if (!Number.isFinite(n) || n <= 0) {
        throw new Error(
          at === "fine"
            ? "Với hình thức phạt tiền, penaltyAmount phải là số dương"
            : "Với hình thức bồi thường, penaltyAmount phải là số dương"
        );
      }
    }
    return true;
  }),
  handleValidation,
];

const violationIdParam = [param("violationId").isMongoId().withMessage("violationId không hợp lệ"), handleValidation];

module.exports = {
  updateViolationRules,
  resolveDisciplinaryRules,
  violationIdParam,
};
