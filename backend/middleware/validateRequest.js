const { validationResult } = require("express-validator");

/** Dùng sau các rule express-validator trên route */
module.exports = function validateRequest(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const arr = errors.array();
    const first = arr[0];
    return res.status(400).json({
      errors: arr,
      message: first?.msg || first?.message || "Dữ liệu không hợp lệ",
    });
  }
  next();
};
