const bcrypt = require("bcryptjs");
const User = require("../models/User");
const Contract = require("../models/Contract");
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

const notDeleted = { isDeleted: { $ne: true } };

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

function buildListFilter(query) {
  const { role, search, status } = query;
  const filter = { ...notDeleted };
  if (role) filter.role = role;
  if (status === "active") filter.isActive = true;
  if (status === "locked") filter.isActive = false;
  if (search && String(search).trim()) {
    const q = String(search).trim();
    filter.$or = [
      { fullName: { $regex: q, $options: "i" } },
      { email: { $regex: q, $options: "i" } },
      { studentId: { $regex: q, $options: "i" } },
    ];
  }
  return filter;
}

function listSort(query) {
  const sortByRaw = String(query.sortBy || "").trim();
  const sortBy = sortByRaw === "fullName" ? "fullName" : sortByRaw === "id" ? "_id" : "createdAt";
  const order = String(query.sortOrder || (sortBy === "_id" ? "asc" : "desc")).toLowerCase() === "asc" ? 1 : -1;
  return { [sortBy]: order };
}

function hasText(v) {
  return typeof v === "string" && v.trim() !== "";
}

function validateRequiredStudentProfile(profileLike) {
  if (!hasText(profileLike.fullName)) return "Thiếu thông tin bắt buộc: Họ tên";
  if (!hasText(profileLike.email)) return "Thiếu thông tin bắt buộc: Email";
  if (!hasText(profileLike.phone)) return "Thiếu thông tin bắt buộc: Số điện thoại";
  if (!hasText(profileLike.studentId)) return "Thiếu thông tin bắt buộc: Mã sinh viên";
  if (!hasText(profileLike.major)) return "Thiếu thông tin bắt buộc: Ngành";
  if (!hasText(profileLike.faculty)) return "Thiếu thông tin bắt buộc: Khoa";
  if (!hasText(profileLike.homeroomTeacher)) return "Thiếu thông tin bắt buộc: Giáo viên chủ nhiệm";
  if (!hasText(profileLike.gender)) return "Thiếu thông tin bắt buộc: Giới tính";
  if (!hasText(profileLike.citizenId)) return "Thiếu thông tin bắt buộc: CCCD";
  if (!profileLike.dateOfBirth) return "Thiếu thông tin bắt buộc: Ngày sinh";
  if (!profileLike.enrollmentDate) return "Thiếu thông tin bắt buộc: Ngày nhập học";
  if (!hasText(profileLike.addressNative)) return "Thiếu thông tin bắt buộc: Quê quán";
  if (!hasText(profileLike.addressPermanent)) return "Thiếu thông tin bắt buộc: Địa chỉ thường trú";
  if (!hasText(profileLike.addressTemporary)) return "Thiếu thông tin bắt buộc: Tạm trú";
  if (!hasText(profileLike.addressAbsent)) return "Thiếu thông tin bắt buộc: Tạm vắng";
  if (!hasText(profileLike.familyEmergencyPhone)) return "Thiếu thông tin bắt buộc: Số điện thoại liên hệ gia đình";
  const parentName = [profileLike.familyFatherName, profileLike.familyMotherName].find((n) => hasText(n));
  if (!parentName) return "Thiếu thông tin bắt buộc: Tên bố/mẹ";
  return null;
}

exports.getAll = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const filter = buildListFilter(req.query);
    const sort = listSort(req.query);

    const [users, total, userCount, managerCount, adminCount] = await Promise.all([
      User.find(filter)
        .select("-password")
        .populate("managedArea", "name")
        .skip((page - 1) * limit)
        .limit(limit)
        .sort(sort)
        .lean(),
      User.countDocuments(filter),
      User.countDocuments({ ...filter, role: "user" }),
      User.countDocuments({ ...filter, role: "manager" }),
      User.countDocuments({ ...filter, role: "admin" }),
    ]);

    res.json({
      users,
      total,
      page,
      limit,
      stats: { user: userCount, manager: managerCount, admin: adminCount },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.params.id, ...notDeleted }).select("-password").populate("managedArea").lean();
    if (!user) return res.status(404).json({ message: "Không tìm thấy người dùng" });

    const contracts = await Contract.find({ user: user._id })
      .populate({
        path: "room",
        select: "roomNumber floor area price status",
        populate: { path: "area", select: "name genderPolicy" },
      })
      .sort({ updatedAt: -1 })
      .lean();

    const now = new Date();
    const activeContracts = contracts.filter((c) => c.status === "active" && new Date(c.endDate) >= now);
    const currentContract = activeContracts[0] || contracts.find((c) => c.status === "active") || null;
    const currentRoom = currentContract?.room || null;

    res.json({
      user,
      currentRoom,
      currentContract,
      contracts,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.create = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { email, password, fullName, phone, studentId, role, managedArea, avatar } = req.body;
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const targetRole = role || "user";

    if (targetRole === "admin" && !req.user.isSuperAdmin) {
      return res.status(403).json({ message: "Chỉ quản trị viên cấp cao mới được tạo tài khoản admin" });
    }
    if (targetRole === "manager" && !req.user.isSuperAdmin) {
      return res.status(403).json({ message: "Chỉ quản trị viên cấp cao mới được tạo tài khoản quản lý" });
    }

    const existing = await User.findOne({ email: normalizedEmail, ...notDeleted });
    if (existing) return res.status(400).json({ message: "Email đã tồn tại" });

    const profile = pickProfile(req.body);
    if (targetRole === "user") {
      const err = validateRequiredStudentProfile({
        fullName,
        email: normalizedEmail,
        phone,
        studentId,
        ...profile,
      });
      if (err) return res.status(400).json({ message: err });
    }
    const user = await User.create({
      email: normalizedEmail,
      password,
      fullName,
      phone,
      studentId,
      role: targetRole,
      managedArea,
      avatar: avatar != null && String(avatar).trim() !== "" ? String(avatar).trim() : "",
      ...profile,
    });
    res.status(201).json(await User.findById(user._id).select("-password").lean());
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.update = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const existing = await User.findOne({ _id: req.params.id, ...notDeleted });
    if (!existing) return res.status(404).json({ message: "Không tìm thấy người dùng" });

    if (req.body.email !== undefined) {
      return res.status(400).json({ message: "Không được đổi email qua API này" });
    }

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

    if (req.body.avatar !== undefined) {
      updateData.avatar = String(req.body.avatar || "").trim();
    }

    if (req.body.isSuperAdmin !== undefined && req.user.isSuperAdmin) {
      updateData.isSuperAdmin = !!req.body.isSuperAdmin;
    }

    if (req.body.password) {
      updateData.password = await bcrypt.hash(String(req.body.password), 10);
    }

    if (newRole === "user") {
      const err = validateRequiredStudentProfile({
        ...existing.toObject(),
        ...updateData,
        email: existing.email,
      });
      if (err) return res.status(400).json({ message: err });
    }

    const user = await User.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true })
      .select("-password")
      .lean();
    if (!user) return res.status(404).json({ message: "Không tìm thấy người dùng" });
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.softDelete = async (req, res) => {
  try {
    const target = await User.findOne({ _id: req.params.id, ...notDeleted });
    if (!target) return res.status(404).json({ message: "Không tìm thấy người dùng" });

    if (target.isSuperAdmin) {
      return res.status(403).json({ message: "Không được xóa tài khoản quản trị cấp cao" });
    }
    if (String(target._id) === String(req.user._id)) {
      return res.status(403).json({ message: "Không được xóa chính tài khoản đang đăng nhập" });
    }

    await User.findByIdAndUpdate(req.params.id, { isDeleted: true, isActive: false });
    res.json({ message: "Đã xóa người dùng (xóa mềm)" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.lockUser = async (req, res) => {
  try {
    const target = await User.findOne({ _id: req.params.id, ...notDeleted });
    if (!target) return res.status(404).json({ message: "Không tìm thấy người dùng" });

    if (String(target._id) === String(req.user._id)) {
      return res.status(403).json({ message: "Không thể khóa chính tài khoản đang đăng nhập" });
    }
    if (target.isSuperAdmin && !req.user.isSuperAdmin) {
      return res.status(403).json({ message: "Chỉ quản trị cấp cao mới được khóa tài khoản quản trị cấp cao" });
    }

    const user = await User.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true }).select("-password").lean();
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.unlockUser = async (req, res) => {
  try {
    const target = await User.findOne({ _id: req.params.id, ...notDeleted });
    if (!target) return res.status(404).json({ message: "Không tìm thấy người dùng" });

    if (target.isSuperAdmin && !req.user.isSuperAdmin) {
      return res.status(403).json({ message: "Chỉ quản trị cấp cao mới được mở khóa tài khoản quản trị cấp cao" });
    }

    const user = await User.findByIdAndUpdate(req.params.id, { isActive: true }, { new: true }).select("-password").lean();
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const target = await User.findOne({ _id: req.params.id, ...notDeleted });
    if (!target) return res.status(404).json({ message: "Không tìm thấy người dùng" });

    if (target.role === "admin" && !req.user.isSuperAdmin) {
      return res.status(403).json({ message: "Chỉ quản trị cấp cao mới được đặt lại mật khẩu cho tài khoản admin" });
    }
    if (target.role === "manager" && !req.user.isSuperAdmin) {
      return res.status(403).json({ message: "Chỉ quản trị cấp cao mới được đặt lại mật khẩu cho tài khoản quản lý" });
    }

    const hash = await bcrypt.hash(String(req.body.newPassword), 10);
    await User.findByIdAndUpdate(req.params.id, { password: hash });
    res.json({ message: "Đã đặt lại mật khẩu" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/** Tương thích client cũ dùng PUT */
exports.updatePut = exports.update;
