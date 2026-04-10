const jwt = require("jsonwebtoken");
const User = require("../models/User");

const auth = async (req, res, next) => {
  try {
    const token = req.header("Authorization")?.replace("Bearer ", "");
    if (!token) {
      return res.status(401).json({ message: "Vui lòng đăng nhập" });
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret");
    const user = await User.findById(String(decoded.userId));
    if (!user || user.isDeleted) {
      return res.status(401).json({ message: "Phiên đăng nhập không hợp lệ" });
    }
    if (!user.isActive) {
      return res.status(401).json({ message: "Tài khoản đã bị khóa" });
    }
    req.user = user;
    req.token = token;
    next();
  } catch (error) {
    res.status(401).json({ message: "Phiên đăng nhập hết hạn hoặc không hợp lệ" });
  }
};

const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: "Vui lòng đăng nhập" });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Bạn không có quyền truy cập" });
    }
    next();
  };
};

module.exports = { auth, requireRole };
