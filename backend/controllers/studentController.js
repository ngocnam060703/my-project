const bcrypt = require("bcryptjs");
const User = require("../models/User");
const Contract = require("../models/Contract");

const notDeleted = { isDeleted: { $ne: true } };

const STUDENT_FIELDS = [
  "fullName",
  "email",
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
  "avatar",
  "isActive",
  "createdAt",
  "updatedAt",
];

function normalizeDate(input) {
  if (input === undefined) return undefined;
  return input ? new Date(input) : null;
}

async function buildStudentDetail(studentId) {
  const student = await User.findOne({ _id: studentId, role: "user", ...notDeleted })
    .select("-password")
    .lean();
  if (!student) return null;

  const contracts = await Contract.find({ user: student._id })
    .populate({
      path: "room",
      select: "roomNumber floor area price status",
      populate: { path: "area", select: "name" },
    })
    .sort({ updatedAt: -1 })
    .lean();

  const now = new Date();
  const contractStillInStay = (c) => {
    if (!c || !c.endDate) return false;
    if (new Date(c.endDate) < now) return false;
    return c.status === "active" || c.status === "pending_payment";
  };
  const currentContract =
    contracts.find((c) => c.status === "active" && new Date(c.endDate) >= now) ||
    contracts.find((c) => c.status === "pending_payment" && new Date(c.endDate) >= now) ||
    contracts.find((c) => c.status === "active") ||
    contracts.find((c) => c.status === "pending_payment") ||
    null;
  const currentRoom = currentContract?.room || null;
  const residenceStatus = contractStillInStay(currentContract) ? "dang_o" : "da_roi";

  return {
    student,
    currentRoom,
    currentContract,
    contracts,
    residenceStatus,
  };
}

exports.list = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const search = String(req.query.search || "").trim();
    const filter = { role: "user", ...notDeleted };
    if (search) {
      filter.$or = [
        { fullName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { studentId: { $regex: search, $options: "i" } },
      ];
    }
    const [students, total] = await Promise.all([
      User.find(filter)
        .select("-password")
        .sort({ _id: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ]);
    res.json({ students, total, page, limit });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getMe = async (req, res) => {
  try {
    if (!req.user || req.user.role !== "user") {
      return res.status(403).json({ message: "Chỉ sinh viên mới truy cập hồ sơ cá nhân" });
    }
    const detail = await buildStudentDetail(req.user._id);
    if (!detail) return res.status(404).json({ message: "Không tìm thấy hồ sơ sinh viên" });
    res.json(detail);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getById = async (req, res) => {
  try {
    if (req.user.role === "user" && String(req.user._id) !== String(req.params.id)) {
      return res.status(403).json({ message: "Bạn chỉ được xem hồ sơ của mình" });
    }
    const detail = await buildStudentDetail(req.params.id);
    if (!detail) return res.status(404).json({ message: "Không tìm thấy hồ sơ sinh viên" });
    res.json(detail);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.create = async (req, res) => {
  try {
    const normalizedEmail = String(req.body.email || "").trim().toLowerCase();
    const exists = await User.findOne({ email: normalizedEmail, ...notDeleted });
    if (exists) return res.status(400).json({ message: "Email đã tồn tại" });

    const payload = {
      role: "user",
      email: normalizedEmail,
      password: String(req.body.password),
      fullName: String(req.body.fullName || "").trim(),
      phone: req.body.phone,
      studentId: String(req.body.studentId || "").trim(),
      className: req.body.className,
      major: String(req.body.major || "").trim(),
      gender: req.body.gender,
      citizenId: req.body.citizenId,
      dateOfBirth: normalizeDate(req.body.dateOfBirth),
      address: req.body.address,
      faculty: String(req.body.faculty || "").trim(),
      enrollmentDate: normalizeDate(req.body.enrollmentDate),
      homeroomTeacher: req.body.homeroomTeacher,
      addressNative: req.body.addressNative,
      addressPermanent: req.body.addressPermanent,
      addressTemporary: req.body.addressTemporary,
      addressAbsent: req.body.addressAbsent,
      familyFatherName: req.body.familyFatherName,
      familyFatherPhone: req.body.familyFatherPhone,
      familyMotherName: req.body.familyMotherName,
      familyMotherPhone: req.body.familyMotherPhone,
      familyEmergencyPhone: req.body.familyEmergencyPhone,
      avatar: req.body.avatar,
    };
    const created = await User.create(payload);
    const detail = await buildStudentDetail(created._id);
    res.status(201).json(detail);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateByAdmin = async (req, res) => {
  try {
    const target = await User.findOne({ _id: req.params.id, role: "user", ...notDeleted });
    if (!target) return res.status(404).json({ message: "Không tìm thấy hồ sơ sinh viên" });

    const updates = {};
    const assign = (key) => {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    };
    [
      "fullName",
      "phone",
      "studentId",
      "className",
      "major",
      "gender",
      "citizenId",
      "address",
      "faculty",
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
      "avatar",
      "isActive",
    ].forEach(assign);

    if (req.body.email !== undefined) {
      const email = String(req.body.email || "").trim().toLowerCase();
      if (!email) return res.status(400).json({ message: "Email không được để trống" });
      const exists = await User.findOne({ email, _id: { $ne: target._id }, ...notDeleted });
      if (exists) return res.status(400).json({ message: "Email đã tồn tại" });
      updates.email = email;
    }

    if (req.body.password) updates.password = await bcrypt.hash(String(req.body.password), 10);
    if (req.body.dateOfBirth !== undefined) updates.dateOfBirth = normalizeDate(req.body.dateOfBirth);
    if (req.body.enrollmentDate !== undefined) updates.enrollmentDate = normalizeDate(req.body.enrollmentDate);

    await User.findByIdAndUpdate(target._id, updates, { runValidators: true });
    const detail = await buildStudentDetail(target._id);
    res.json(detail);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateMe = async (req, res) => {
  try {
    if (!req.user || req.user.role !== "user") {
      return res.status(403).json({ message: "Chỉ sinh viên mới được cập nhật hồ sơ cá nhân" });
    }
    const current = await User.findOne({ _id: req.user._id, role: "user", ...notDeleted });
    if (!current) return res.status(404).json({ message: "Không tìm thấy hồ sơ sinh viên" });

    // Sinh viên được tự cập nhật đầy đủ thông tin hồ sơ cá nhân (trừ quyền/hệ thống)
    const updates = {};
    [
      "fullName",
      "phone",
      "studentId",
      "className",
      "major",
      "gender",
      "citizenId",
      "address",
      "faculty",
      "homeroomTeacher",
      "addressNative",
      "addressPermanent",
      "addressTemporary",
      "addressAbsent",
      "familyFatherName",
      "familyFatherPhone",
      "familyMotherName",
      "familyMotherPhone",
      "avatar",
      "familyEmergencyPhone",
    ].forEach((k) => {
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    });
    if (req.body.dateOfBirth !== undefined) updates.dateOfBirth = normalizeDate(req.body.dateOfBirth);
    if (req.body.enrollmentDate !== undefined) updates.enrollmentDate = normalizeDate(req.body.enrollmentDate);

    await User.findByIdAndUpdate(current._id, updates, { runValidators: true });
    const detail = await buildStudentDetail(current._id);
    res.json(detail);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const target = await User.findOne({ _id: req.params.id, role: "user", ...notDeleted });
    if (!target) return res.status(404).json({ message: "Không tìm thấy hồ sơ sinh viên" });
    await User.findByIdAndUpdate(target._id, { isDeleted: true, isActive: false });
    res.json({ message: "Đã xóa mềm hồ sơ sinh viên" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
