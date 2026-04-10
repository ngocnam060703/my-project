const { validationResult } = require("express-validator");

/** Dùng sau các rule express-validator trên route */
module.exports = function validateRequest(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};
