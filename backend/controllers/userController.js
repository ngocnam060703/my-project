const bcrypt = require("bcryptjs");
const User = require("../models/User");
const { validationResult } = require("express-validator");

exports.getAll = async (req, res) => {
  try {
    const { role, search, page = 1, limit = 10 } = req.query;
    const filter = {};
    if (role) filter.role = role;
    if (search) {
      filter.$or = [
        { fullName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { studentId: { $regex: search, $options: "i" } },
      ];
    }
    const users = await User.find(filter)
      .select("-password")
      .populate("managedArea", "name")
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });
    const total = await User.countDocuments(filter);
    const [userCount, managerCount, adminCount] = await Promise.all([
      User.countDocuments({ ...filter, role: "user" }),
      User.countDocuments({ ...filter, role: "manager" }),
      User.countDocuments({ ...filter, role: "admin" }),
    ]);
    res.json({ users, total, stats: { user: userCount, manager: managerCount, admin: adminCount } });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password").populate("managedArea");
    if (!user) return res.status(404).json({ message: "Không tìm thấy người dùng" });
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.create = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const { email, password, fullName, phone, studentId, role, managedArea } = req.body;
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: "Email đã tồn tại" });
    const user = await User.create({ email, password, fullName, phone, studentId, role: role || "user", managedArea });
    res.status(201).json(await User.findById(user._id).select("-password"));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.update = async (req, res) => {
  try {
    const { fullName, phone, studentId, role, managedArea, isActive } = req.body;
    const updateData = { fullName, phone, studentId, role, managedArea, isActive };
    // findByIdAndUpdate không chạy pre('save') → phải hash tay (tránh lưu plaintext → đăng nhập luôn sai).
    if (req.body.password) {
      updateData.password = await bcrypt.hash(String(req.body.password), 10);
    }
    const user = await User.findByIdAndUpdate(req.params.id, updateData, { new: true }).select("-password");
    if (!user) return res.status(404).json({ message: "Không tìm thấy người dùng" });
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.delete = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: "Không tìm thấy người dùng" });
    res.json({ message: "Xóa thành công" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
