const bcrypt = require("bcryptjs");
const User = require("../models/User");
const { validationResult } = require("express-validator");

const PROFILE_FIELDS = [
  "fullName",
  "phone",
  "studentId",
  "className",
  "major",
  "gender",
  "citizenId",
  "dateOfBirth",
  "address",
  "faculty",
  "enrollmentDate",
  "homeroomTeacher",
  "addressNative",
  "addressPermanent",
  "addressTemporary",
  "addressAbsent",
  "familyFatherName",
  "familyFatherPhone",
  "familyMotherName",
  "familyMotherPhone",
  "familyEmergencyPhone",
];

function pickProfile(body) {
  const out = {};
  for (const k of PROFILE_FIELDS) {
    if (body[k] !== undefined) out[k] = body[k];
  }
  if (out.dateOfBirth !== undefined) {
    out.dateOfBirth = out.dateOfBirth ? new Date(out.dateOfBirth) : null;
  }
  if (out.enrollmentDate !== undefined) {
    out.enrollmentDate = out.enrollmentDate ? new Date(out.enrollmentDate) : null;
  }
  return out;
}

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
    const targetRole = role || "user";
    if (targetRole === "admin" && !req.user.isSuperAdmin) {
      return res.status(403).json({ message: "Chỉ quản trị viên cấp cao mới được tạo tài khoản admin" });
    }
    if (targetRole === "manager" && !req.user.isSuperAdmin) {
      return res.status(403).json({ message: "Chỉ quản trị viên cấp cao mới được tạo tài khoản quản lý" });
    }
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: "Email đã tồn tại" });
    const profile = pickProfile(req.body);
    const user = await User.create({
      email,
      password,
      fullName,
      phone,
      studentId,
      role: targetRole,
      managedArea,
      ...profile,
    });
    res.status(201).json(await User.findById(user._id).select("-password"));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.update = async (req, res) => {
  try {
    const existing = await User.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: "Không tìm thấy người dùng" });

    const newRole = req.body.role !== undefined ? req.body.role : existing.role;
    if (existing.role === "user" && newRole === "admin") {
      return res.status(403).json({ message: "Không được phép nâng quyền từ sinh viên lên admin" });
    }
    if (existing.role === "user" && newRole === "manager") {
      return res.status(403).json({ message: "Không được phép nâng quyền từ sinh viên lên quản lý" });
    }
    if (newRole === "admin" && existing.role !== "admin" && !req.user.isSuperAdmin) {
      return res.status(403).json({ message: "Chỉ quản trị viên cấp cao mới được cấp quyền admin" });
    }
    if (newRole === "manager" && existing.role !== "manager" && !req.user.isSuperAdmin) {
      return res.status(403).json({ message: "Chỉ quản trị viên cấp cao mới được cấp quyền quản lý" });
    }

    const updateData = {
      ...pickProfile(req.body),
      fullName: req.body.fullName !== undefined ? req.body.fullName : existing.fullName,
      phone: req.body.phone !== undefined ? req.body.phone : existing.phone,
      studentId: req.body.studentId !== undefined ? req.body.studentId : existing.studentId,
      role: req.body.role !== undefined ? req.body.role : existing.role,
      managedArea: req.body.managedArea !== undefined ? req.body.managedArea : existing.managedArea,
      isActive: req.body.isActive !== undefined ? req.body.isActive : existing.isActive,
    };
    if (req.body.isSuperAdmin !== undefined && req.user.isSuperAdmin) {
      updateData.isSuperAdmin = !!req.body.isSuperAdmin;
    }
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
