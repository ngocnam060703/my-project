const bcrypt = require("bcryptjs");
const User = require("../models/User");
const Contract = require("../models/Contract");
const Area = require("../models/Area");
const Bill = require("../models/Bill");
const Violation = require("../models/Violation");
const BedHistory = require("../models/BedHistory");
const { validationResult } = require("express-validator");
const userApprovalService = require("../services/userApprovalService");
const { normalizePriorityFields } = require("../utils/normalizePriorityFields");

const PROFILE_FIELDS = [
  "fullName",
  "phone",
  "studentId",
  "className",
  "major",
  "facultyGroup",
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
  "ethnicity",
  "priorityType",
  "priorityProofUrl",
  "familyFatherName",
  "familyFatherPhone",
  "familyMotherName",
  "familyMotherPhone",
  "familyEmergencyPhone",
];

const notDeleted = { isDeleted: { $ne: true } };
const STUDENT_ROLES = ["user", "student"];

function isStudentRole(role) {
  return STUDENT_ROLES.includes(String(role || ""));
}

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
  if (role) {
    if (isStudentRole(role)) filter.role = { $in: STUDENT_ROLES };
    else filter.role = role;
  }
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
  if (!hasText(profileLike.facultyGroup)) return "Thiếu thông tin bắt buộc: Khoa/nhóm ngành";
  if (!hasText(profileLike.major)) return "Thiếu thông tin bắt buộc: Ngành";
  if (!hasText(profileLike.faculty)) return "Thiếu thông tin bắt buộc: Khóa";
  if (!hasText(profileLike.homeroomTeacher)) return "Thiếu thông tin bắt buộc: Giáo viên chủ nhiệm";
  if (!hasText(profileLike.gender)) return "Thiếu thông tin bắt buộc: Giới tính";
  if (!hasText(profileLike.citizenId)) return "Thiếu thông tin bắt buộc: CCCD";
  if (!profileLike.dateOfBirth) return "Thiếu thông tin bắt buộc: Ngày sinh";
  if (!profileLike.enrollmentDate) return "Thiếu thông tin bắt buộc: Ngày nhập học";
  if (!hasText(profileLike.addressNative)) return "Thiếu thông tin bắt buộc: Quê quán";
  if (!hasText(profileLike.addressPermanent)) return "Thiếu thông tin bắt buộc: Địa chỉ thường trú";
  if (!hasText(profileLike.addressTemporary)) return "Thiếu thông tin bắt buộc: Tạm trú";
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
      User.countDocuments({ ...filter, role: { $in: STUDENT_ROLES } }),
      User.countDocuments({ ...filter, role: "manager" }),
      User.countDocuments({ ...filter, role: "admin" }),
    ]);

    const includeDorm = String(req.query.includeDorm || "").trim();
    const roleFilter = String(filter.role || "");
    if (includeDorm === "1" && (!roleFilter || isStudentRole(roleFilter)) && users.length) {
      const now = new Date();
      const enriched = await Promise.all(
        users.map(async (u) => {
          try {
            const c = await Contract.findOne({
              user: u._id,
              status: { $in: ["active", "pending_payment"] },
              endDate: { $gte: now },
            })
              .populate({
                path: "room",
                select: "roomNumber area",
                populate: { path: "area", select: "name" },
              })
              .lean();
            const room = c?.room && typeof c.room === "object" ? c.room : null;
            const areaName =
              room?.area && typeof room.area === "object" ? String(room.area.name || "").trim() : "";
            return {
              ...u,
              currentRoomNumber: room ? String(room.roomNumber || "").trim() : "",
              currentAreaName: areaName,
            };
          } catch {
            return { ...u, currentRoomNumber: "", currentAreaName: "" };
          }
        })
      );
      users.splice(0, users.length, ...enriched);
    }

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

    let contracts = [];
    let currentContract = null;
    let currentRoom = null;

    if (isStudentRole(user.role)) {
      contracts = await Contract.find({ user: user._id })
        .populate({
          path: "room",
          select: "roomNumber floor area price status capacity currentOccupancy",
          populate: { path: "area", select: "name genderPolicy" },
        })
        .populate("bed", "code status room equipmentStatus assignedAt checkInAt")
        .sort({ updatedAt: -1 })
        .lean();

      const now = new Date();
      currentContract =
        contracts.find((c) => c.status === "active" && new Date(c.endDate) >= now) ||
        contracts.find((c) => c.status === "pending_payment" && new Date(c.endDate) >= now) ||
        contracts.find((c) => c.status === "active") ||
        contracts.find((c) => c.status === "pending_payment") ||
        null;
      currentRoom = currentContract?.room || null;
    }

    /** Lịch sử cư trú (theo HĐ + BedHistory), công nợ & vi phạm */
    let stayHistory = [];
    let financialSummary = null;
    let violationsRecent = [];
    let residencyOperationalStatus = null;

    if (isStudentRole(user.role)) {
      const unpaidBills = await Bill.find({
        user: user._id,
        status: { $in: ["pending", "unpaid", "overdue"] },
      })
        .sort({ dueDate: 1, year: -1, month: -1 })
        .limit(24)
        .lean();
      const debtTotal = unpaidBills.reduce((sum, b) => sum + Number(b.total || 0), 0);
      financialSummary = {
        debtTotal,
        unpaidCount: unpaidBills.length,
        unpaidBills,
      };

      violationsRecent = await Violation.find({ user: user._id }).sort({ createdAt: -1 }).limit(25).lean();

      const bCur = currentContract?.bed;
      if (!currentContract) residencyOperationalStatus = "no_active_contract";
      else if (!bCur || typeof bCur !== "object") residencyOperationalStatus = "contract_no_bed";
      else if (String(bCur.status) !== "occupied") residencyOperationalStatus = "no_bed_assigned";
      else if (!bCur.checkInAt && bCur.assignedAt) residencyOperationalStatus = "assigned_pending_checkin";
      else if (bCur.checkInAt) residencyOperationalStatus = "checked_in_staying";
      else residencyOperationalStatus = "assigned_pending_checkin";

      const histRows =
        contracts.length > 0
          ? await BedHistory.find({
              user: user._id,
              contract: { $in: contracts.map((x) => x._id) },
            })
              .sort({ createdAt: 1 })
              .lean()
          : [];

      const histByContract = {};
      for (const h of histRows) {
        const cid = h.contract ? String(h.contract) : "";
        if (!cid) continue;
        if (!histByContract[cid]) histByContract[cid] = [];
        histByContract[cid].push(h);
      }

      /** HĐ đã chấm dứt — không gán trạng thái «đang ở» theo HĐ hiện hành */
      const TERMINAL_CONTRACT_STATUSES = new Set([
        "terminated",
        "expired",
        "cancelled",
        "transferred_settled",
        "terminated_due_to_transfer",
      ]);
      const OCCUPANCY_ELIGIBLE_STATUSES = new Set(["active", "pending_payment", "upcoming"]);

      function contractResidencyEnded(contract, at) {
        const st = String(contract.status || "");
        if (TERMINAL_CONTRACT_STATUSES.has(st)) return true;
        if (contract.endDate && new Date(contract.endDate) < at) return true;
        return false;
      }

      function mapEndedResidencyStayStatus(contractStatus) {
        const st = String(contractStatus || "");
        if (st === "cancelled") return "ended_cancelled";
        if (st === "transferred_settled" || st === "terminated_due_to_transfer") return "ended_transfer_settled";
        if (st === "terminated") return "ended_terminated";
        if (st === "expired") return "ended_expired";
        return "checked_out";
      }

      if (contracts.length) {
        const now = new Date();
        stayHistory = [...contracts]
          .sort((a, b) => new Date(a.startDate || 0) - new Date(b.startDate || 0))
          .map((c) => {
            const cid = String(c._id);
            const ev = histByContract[cid] || [];
            const bdoc = c.bed && typeof c.bed === "object" ? c.bed : null;

            let checkInAt = null;
            for (const e of ev) {
              if (e.action === "checked_in") {
                checkInAt = e.createdAt;
                break;
              }
            }
            if (!checkInAt && bdoc?.checkInAt) checkInAt = bdoc.checkInAt;

            let checkOutAt = null;
            for (const e of ev) {
              if (e.action === "checked_out") checkOutAt = e.createdAt;
            }

            const notesFromHist = [];
            for (const e of ev) {
              const n = String(e.note || "").trim();
              if (!n) continue;
              const label =
                e.action === "checked_out"
                  ? "Check-out"
                  : e.action === "transferred_out"
                    ? "Chuyển đi"
                    : e.action === "transferred_in"
                      ? "Chuyển đến"
                      : e.action === "assigned"
                        ? "Phân giường"
                        : String(e.action);
              notesFromHist.push(`${label}: ${n}`);
            }
            for (const e of ev) {
              const from = String(e.fromBedCode || "").trim();
              const to = String(e.toBedCode || "").trim();
              if ((e.action === "transferred_out" || e.action === "transferred_in") && (from || to)) {
                notesFromHist.push(`Chuyển giường ${from || "—"} → ${to || "—"}`);
              }
            }
            const noteOut = [...new Set(notesFromHist)].slice(0, 5).join(" · ");

            const rn = c.room && typeof c.room === "object" ? String(c.room.roomNumber || "").trim() : "";
            let bc = bdoc ? String(bdoc.code || "").trim() : "";
            if (!bc) {
              for (let i = ev.length - 1; i >= 0; i--) {
                const e = ev[i];
                if ((e.action === "assigned" || e.action === "transferred_in") && e.toBedCode) {
                  bc = String(e.toBedCode).trim();
                  break;
                }
              }
            }
            const composite =
              rn && bc ? (bc.startsWith(`${rn}-`) ? bc : `${rn}-${bc}`) : bc || rn || "—";

            const ended = contractResidencyEnded(c, now);
            const notYetStarted = new Date(c.startDate) > now;
            const isOccupancyCurrent =
              currentContract &&
              String(currentContract._id) === cid &&
              !ended &&
              OCCUPANCY_ELIGIBLE_STATUSES.has(String(c.status || ""));

            // HĐ đã chấm dứt ưu tiên trước «chưa bắt đầu kỳ» (VD: gia hạn upcoming bị hủy)
            if (!checkOutAt && ended && c.endDate && checkInAt) checkOutAt = c.endDate;

            let residencyStayStatus = "checked_out";
            if (ended) residencyStayStatus = mapEndedResidencyStayStatus(c.status);
            else if (notYetStarted) residencyStayStatus = "not_started";
            else if (isOccupancyCurrent) {
              if (residencyOperationalStatus === "assigned_pending_checkin") residencyStayStatus = "pending_checkin";
              else if (residencyOperationalStatus === "checked_in_staying") residencyStayStatus = "staying";
              else if (
                residencyOperationalStatus === "contract_no_bed" ||
                residencyOperationalStatus === "no_bed_assigned"
              )
                residencyStayStatus = "pending_bed";
              else residencyStayStatus = "pending_checkin";
            }

            return {
              contractId: c._id,
              contractNumber: c.contractNumber,
              status: c.status,
              startDate: c.startDate,
              endDate: c.endDate,
              areaName:
                c.room && typeof c.room === "object" && c.room.area && typeof c.room.area === "object"
                  ? c.room.area.name
                  : "",
              roomNumber: rn || "",
              bedCode: bc || "",
              bedSlotDisplay: composite,
              checkInAt,
              checkOutAt,
              residencyStayStatus,
              note: noteOut,
              studentName: user.fullName || "",
              studentId: user.studentId || "",
            };
          });
      }
    }

    /** Khu phụ trách (quản lý): gộp managedArea trên User + Area.manager trỏ về user */
    let managedAreas = [];
    if (user.role === "manager") {
      const seen = new Set();
      const pushArea = (doc) => {
        if (!doc || typeof doc !== "object" || !doc._id) return;
        const id = String(doc._id);
        if (seen.has(id)) return;
        seen.add(id);
        managedAreas.push(doc);
      };
      if (user.managedArea && typeof user.managedArea === "object") pushArea(user.managedArea);
      const linked = await Area.find({ manager: user._id, ...notDeleted })
        .select("name description genderPolicy plannedTotalRooms plannedCapacity manager")
        .sort({ name: 1 })
        .lean();
      linked.forEach(pushArea);
    }

    res.json({
      user,
      currentRoom,
      currentContract,
      contracts,
      managedAreas: user.role === "manager" ? managedAreas : [],
      stayHistory: isStudentRole(user.role) ? stayHistory : [],
      financialSummary: isStudentRole(user.role) ? financialSummary : null,
      violationsRecent: isStudentRole(user.role) ? violationsRecent : [],
      residencyOperationalStatus: isStudentRole(user.role) ? residencyOperationalStatus : null,
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
    if (isStudentRole(targetRole)) {
      normalizePriorityFields(profile);
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
    if (isStudentRole(existing.role) && newRole === "admin") {
      return res.status(403).json({ message: "Không được phép nâng quyền từ sinh viên lên admin" });
    }
    if (isStudentRole(existing.role) && newRole === "manager") {
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

    if (isStudentRole(newRole)) {
      normalizePriorityFields(updateData);
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

exports.getPendingAccounts = async (req, res) => {
  try {
    const users = await userApprovalService.listPendingAccounts();
    res.json({ users, total: users.length });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.approvePendingAccount = async (req, res) => {
  try {
    const result = await userApprovalService.approveAccount({
      userId: req.params.id,
      approverId: req.user._id,
    });
    if (result.notFound) return res.status(404).json({ message: "Không tìm thấy tài khoản" });
    if (result.invalidRole) return res.status(400).json({ message: "Chỉ duyệt tài khoản sinh viên" });
    if (result.invalidStatus) {
      return res.status(400).json({ message: `Không thể duyệt tài khoản có trạng thái ${result.status}` });
    }
    res.json({
      message: "Đã duyệt tài khoản",
      user: {
        _id: String(result.user._id),
        studentId: result.user.studentId || "",
        fullName: result.user.fullName || "",
        email: result.user.email || "",
        phone: result.user.phone || "",
        status: result.user.status,
        approvedAt: result.user.approvedAt,
        approvedBy: result.user.approvedBy,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.rejectPendingAccount = async (req, res) => {
  try {
    const rejectionReason = String(req.body?.rejectionReason || "").trim();
    if (!rejectionReason) {
      return res.status(400).json({ message: "Vui lòng nhập lý do từ chối" });
    }
    const result = await userApprovalService.rejectAccount({
      userId: req.params.id,
      approverId: req.user._id,
      rejectionReason,
    });
    if (result.notFound) return res.status(404).json({ message: "Không tìm thấy tài khoản" });
    if (result.invalidRole) return res.status(400).json({ message: "Chỉ từ chối tài khoản sinh viên" });
    if (result.invalidStatus) {
      return res.status(400).json({ message: `Không thể từ chối tài khoản có trạng thái ${result.status}` });
    }
    res.json({
      message: "Đã từ chối tài khoản",
      user: {
        _id: String(result.user._id),
        studentId: result.user.studentId || "",
        fullName: result.user.fullName || "",
        email: result.user.email || "",
        phone: result.user.phone || "",
        status: result.user.status,
        rejectionReason: result.user.rejectionReason || "",
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
