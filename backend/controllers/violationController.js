const mongoose = require("mongoose");
const ViolationRule = require("../models/ViolationRule");
const Violation = require("../models/Violation");
const Contract = require("../models/Contract");
const Room = require("../models/Room");
const User = require("../models/User");
const Notification = require("../models/Notification");
const { getIO } = require("../socket");
const { terminateContractDiscipline } = require("../services/violationActions");
const { normalizeViolationRecord, normalizeAmount } = require("../services/violationDisciplineService");
const { sendNotification } = require("../services/notificationService");
const {
  listResidentsForViolationByRoom,
  findEffectiveResidenceInRoom,
} = require("../services/violationResidentsService");

const STUDENT_ROLES = ["user", "student"];

function isAdmin(user) {
  return user?.role === "admin" || user?.role === "manager";
}

/** Sinh viên KTX: role user hoặc student (đồng bộ các API client khác). */
function isStudentRole(userOrRole) {
  const role = typeof userOrRole === "object" && userOrRole ? userOrRole.role : userOrRole;
  return STUDENT_ROLES.includes(String(role || ""));
}

exports.requireStudentAccount = (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: "Vui lòng đăng nhập" });
  if (!isStudentRole(req.user)) return res.status(403).json({ message: "Chỉ sinh viên" });
  next();
};

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function warningLevelFromPoints(total) {
  if (total >= 7) return { key: "expel", text: "Chấm dứt hợp đồng, buộc rời KTX", severity: "critical" };
  if (total >= 5) return { key: "severe", text: "Cảnh cáo nghiêm trọng + thông báo", severity: "high" };
  if (total >= 3) return { key: "warn", text: "Cảnh cáo", severity: "medium" };
  if (total >= 1) return { key: "remind", text: "Nhắc nhở", severity: "low" };
  return { key: "ok", text: "Không có điểm vi phạm tích lũy trong kỳ", severity: "none" };
}

async function sumSemesterPoints(userId, schoolYear, semester) {
  const agg = await Violation.aggregate([
    {
      $match: {
        user: new mongoose.Types.ObjectId(String(userId)),
        schoolYear: String(schoolYear),
        semester: String(semester),
        noIndividualPoints: { $ne: true },
        points: { $gt: 0 },
      },
    },
    { $group: { _id: null, total: { $sum: "$points" } } },
  ]);
  return agg[0]?.total || 0;
}

async function notifyThreshold(userId, totalPoints, schoolYear, semester) {
  const w = warningLevelFromPoints(totalPoints);
  const io = getIO();
  const msg = `Tổng điểm vi phạm kỳ ${semester} (${schoolYear}): ${totalPoints}. Mức: ${w.text}.`;
  await Notification.create({
    user: userId,
    title: "Cảnh báo kỷ luật",
    message: totalPoints >= 7 ? `${msg} Bạn đã đạt ngưỡng xử lý nghiêm — liên hệ ban quản lý KTX.` : msg,
    type: "discipline_warning",
    link: "/student/my-violations",
  });
  io.emit("bill:new", { userId: String(userId), message: "Cập nhật điểm vi phạm kỷ luật" });

  const admins = await User.find({ role: { $in: ["admin", "manager"] } }).select("_id");
  for (const a of admins) {
    await Notification.create({
      user: a._id,
      title: "Vi phạm kỷ luật",
      message: `Sinh viên có UserId ${userId}: ${msg}`,
      type: "discipline_admin",
      link: "/admin/violations",
    });
  }
}

exports.getRules = async (req, res) => {
  try {
    const rules = await ViolationRule.find({ isActive: true }).sort({ order: 1 });
    res.json(rules);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.getAllViolations = async (req, res) => {
  try {
    if (!isAdmin(req.user)) return res.status(403).json({ message: "Không có quyền" });
    const { user, room, schoolYear, semester, search, severity, status, page = 1, limit = 20 } = req.query;
    const conditions = [];
    if (user && mongoose.isValidObjectId(String(user))) conditions.push({ user });
    if (room && mongoose.isValidObjectId(String(room))) conditions.push({ room });
    if (schoolYear) conditions.push({ schoolYear: String(schoolYear) });
    if (semester) conditions.push({ semester: String(semester) });
    if (severity && ["light", "medium", "heavy"].includes(String(severity))) {
      conditions.push({ severity: String(severity) });
    }
    if (status === "pending") {
      conditions.push({ $or: [{ status: "pending" }, { status: { $exists: false } }] });
    } else if (status === "resolved") {
      conditions.push({ status: "resolved" });
    }
    const q = search != null ? String(search).trim() : "";
    if (q) {
      const safe = escapeRegex(q);
      const re = new RegExp(safe, "i");
      const userIds = await User.find({
        role: { $in: ["user", "student"] },
        isDeleted: { $ne: true },
        $or: [{ fullName: re }, { studentId: re }],
      }).distinct("_id");
      const orClauses = [{ ruleName: re }, { description: re }];
      if (userIds.length) orClauses.push({ user: { $in: userIds } });
      conditions.push({ $or: orClauses });
    }
    const filter =
      conditions.length === 0 ? {} : conditions.length === 1 ? conditions[0] : { $and: conditions };
    const items = await Violation.find(filter)
      .populate("rule", "code name severity points")
      .populate("user", "fullName studentId email")
      .populate("room", "roomNumber area")
      .populate("room.area", "name")
      .populate("recordedBy", "fullName")
      .populate("resolution.resolvedBy", "fullName")
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit));
    const total = await Violation.countDocuments(filter);
    res.json({ violations: items.map(normalizeViolationRecord), total });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.getViolationById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(String(id))) return res.status(400).json({ message: "id không hợp lệ" });
    const doc = await Violation.findById(id)
      .populate("rule", "code name severity points handlingAction")
      .populate("user", "fullName studentId email phone gender")
      .populate("room", "roomNumber area")
      .populate("room.area", "name")
      .populate("recordedBy", "fullName")
      .populate("resolution.resolvedBy", "fullName");
    if (!doc) return res.status(404).json({ message: "Không tìm thấy vi phạm" });

    if (isAdmin(req.user)) {
      return res.json(normalizeViolationRecord(doc));
    }
    if (isStudentRole(req.user)) {
      const ownerId = String(doc.user?._id || doc.user || "");
      if (!ownerId || ownerId !== String(req.user._id)) {
        return res.status(403).json({ message: "Không có quyền xem vi phạm này" });
      }
      return res.json(normalizeViolationRecord(doc));
    }
    return res.status(403).json({ message: "Không có quyền" });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.updateViolation = async (req, res) => {
  try {
    if (!isAdmin(req.user)) return res.status(403).json({ message: "Không có quyền" });
    const { id } = req.params;
    if (!mongoose.isValidObjectId(String(id))) return res.status(400).json({ message: "id không hợp lệ" });
    const v = await Violation.findById(id);
    if (!v) return res.status(404).json({ message: "Không tìm thấy vi phạm" });
    const st = v.status || "pending";
    if (st === "resolved") return res.status(400).json({ message: "Đã xử lý, không thể sửa" });

    const { description, fineAmount, compensationAmount, schoolYear: sy, semester: sem } = req.body;
    if (description !== undefined) v.description = String(description);
    if (fineAmount !== undefined) v.fineAmount = Math.max(0, Number(fineAmount) || 0);
    if (compensationAmount !== undefined) v.compensationAmount = Math.max(0, Number(compensationAmount) || 0);
    if (sy !== undefined) v.schoolYear = String(sy).trim();
    if (sem !== undefined) v.semester = String(sem).trim();

    await v.save();
    const populated = await Violation.findById(v._id)
      .populate("rule", "code name severity points")
      .populate("user", "fullName studentId email")
      .populate("room", "roomNumber area")
      .populate("room.area", "name")
      .populate("recordedBy", "fullName")
      .populate("resolution.resolvedBy", "fullName");
    res.json(normalizeViolationRecord(populated));
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.deleteViolation = async (req, res) => {
  try {
    if (!isAdmin(req.user)) return res.status(403).json({ message: "Không có quyền" });
    const { id } = req.params;
    if (!mongoose.isValidObjectId(String(id))) return res.status(400).json({ message: "id không hợp lệ" });
    const v = await Violation.findById(id);
    if (!v) return res.status(404).json({ message: "Không tìm thấy vi phạm" });
    const st = v.status || "pending";
    if (st === "resolved") return res.status(400).json({ message: "Đã xử lý, không xóa được" });
    if (v.bill) return res.status(400).json({ message: "Đã có hóa đơn gắn vi phạm, không xóa được" });
    await Violation.deleteOne({ _id: v._id });
    res.json({ ok: true, deleted: String(id) });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

/** Admin: SV đang ở phòng theo HĐ active hiệu lực (form ghi nhận vi phạm). */
exports.getRoomResidents = async (req, res) => {
  try {
    if (!isAdmin(req.user)) return res.status(403).json({ message: "Không có quyền" });
    const { roomId } = req.query;
    if (!mongoose.isValidObjectId(String(roomId || ""))) {
      return res.status(400).json({ message: "roomId không hợp lệ" });
    }
    const room = await Room.findById(roomId).select("roomNumber area").populate("area", "name").lean();
    if (!room) return res.status(404).json({ message: "Không tìm thấy phòng" });
    const residents = await listResidentsForViolationByRoom(roomId);
    res.json({ room, residents, totalResidents: residents.length });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.getStudentSummary = async (req, res) => {
  try {
    if (!isAdmin(req.user)) return res.status(403).json({ message: "Không có quyền" });
    const { schoolYear, semester } = req.query;
    if (!schoolYear || !semester) {
      return res.status(400).json({ message: "Cần schoolYear và semester" });
    }
    const agg = await Violation.aggregate([
      {
        $match: {
          schoolYear: String(schoolYear),
          semester: String(semester),
          user: { $ne: null },
          noIndividualPoints: { $ne: true },
        },
      },
      { $group: { _id: "$user", totalPoints: { $sum: "$points" }, count: { $sum: 1 } } },
      { $sort: { totalPoints: -1 } },
    ]);
    const userIds = agg.map((x) => x._id);
    const users = await User.find({ _id: { $in: userIds } }).select("fullName studentId email");
    const uMap = new Map(users.map((u) => [String(u._id), u]));
    const rows = agg.map((row) => ({
      user: uMap.get(String(row._id)) || { _id: row._id },
      totalPoints: row.totalPoints,
      violationCount: row.count,
      warning: warningLevelFromPoints(row.totalPoints),
    }));
    res.json({ schoolYear, semester, students: rows });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.getMyViolations = async (req, res) => {
  try {
    if (!isStudentRole(req.user)) return res.status(403).json({ message: "Chỉ sinh viên" });
    const items = await Violation.find({ user: req.user._id })
      .populate("rule", "code name handlingAction")
      .populate("room", "roomNumber area")
      .populate("room.area", "name")
      .populate("bill", "status total dueDate month year")
      .populate("resolution.resolvedBy", "fullName")
      .sort({ createdAt: -1 });
    res.json(items.map(normalizeViolationRecord));
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.getMyDisciplineStats = async (req, res) => {
  try {
    if (!isStudentRole(req.user)) return res.status(403).json({ message: "Chỉ sinh viên" });
    const schoolYear = String(req.query.schoolYear || "");
    const semester = String(req.query.semester || "");
    if (!schoolYear || !semester) {
      return res.status(400).json({ message: "Cần schoolYear và semester (vd: 2025-2026, HK1)" });
    }
    const totalPoints = await sumSemesterPoints(req.user._id, schoolYear, semester);
    const warning = warningLevelFromPoints(totalPoints);
    res.json({ schoolYear, semester, totalPoints, warning });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.createViolation = async (req, res) => {
  try {
    if (!isAdmin(req.user)) return res.status(403).json({ message: "Không có quyền" });
    const {
      ruleId,
      userId,
      roomId,
      semester,
      schoolYear,
      description,
      images,
      fineAmount: fineIn,
      compensationAmount: compIn,
      splitToRoom,
      immediateExpulsion,
      noIndividualPoints,
    } = req.body;

    if (!mongoose.isValidObjectId(String(ruleId)) || !mongoose.isValidObjectId(String(roomId))) {
      return res.status(400).json({ message: "ruleId hoặc roomId không hợp lệ" });
    }
    if (!semester || !schoolYear) {
      return res.status(400).json({ message: "Thiếu học kỳ hoặc năm học" });
    }

    const rule = await ViolationRule.findById(ruleId);
    if (!rule || !rule.isActive) return res.status(404).json({ message: "Không tìm thấy loại vi phạm" });

    const room = await Room.findById(roomId);
    if (!room) return res.status(404).json({ message: "Không tìm thấy phòng" });

    let fineAmount = normalizeAmount(fineIn);
    const compensationAmount = normalizeAmount(compIn);
    if (rule.fineMax > 0 && fineAmount > rule.fineMax) fineAmount = rule.fineMax;
    if (rule.fineMin > 0 && fineAmount > 0 && fineAmount < rule.fineMin) {
      return res.status(400).json({ message: `Tiền phạt nên từ ${rule.fineMin.toLocaleString("vi-VN")}đ` });
    }

    const imgArr = Array.isArray(images) ? images.filter((x) => typeof x === "string" && x.length < 2_500_000) : [];

    if (splitToRoom) {
      const residents = await listResidentsForViolationByRoom(roomId);
      if (!residents.length) {
        return res.status(400).json({ message: "Phòng không có sinh viên đang ở (HĐ active hiệu lực) để chia phạt" });
      }
      const n = residents.length;
      const shareFine = Math.round(fineAmount / n);
      const shareComp = Math.round(compensationAmount / n);
      const batchId = new mongoose.Types.ObjectId();
      const created = [];
      for (const row of residents) {
        const points = noIndividualPoints ? 0 : 0;
        const v = await Violation.create({
          rule: rule._id,
          user: row.user._id,
          room: roomId,
          semester: String(semester),
          schoolYear: String(schoolYear),
          ruleName: rule.name,
          severity: rule.severity,
          points,
          fineAmount: shareFine,
          compensationAmount: shareComp,
          description: String(description || ""),
          images: imgArr,
          splitToRoom: true,
          noIndividualPoints: true,
          immediateExpulsion: false,
          batchId,
          recordedBy: req.user._id,
          status: "pending",
        });
        created.push(v);
        await sendNotification({
          userId: row.user._id,
          title: "Vi phạm nội quy KTX",
          message: `Phòng bạn được ghi nhận vi phạm: ${rule.name}. Xem «Vi phạm của tôi».`,
          type: "discipline_warning",
          link: "/student/my-violations",
        });
      }
      return res.status(201).json({ created: created.length, violations: created, batchId });
    }

    if (!mongoose.isValidObjectId(String(userId))) {
      return res.status(400).json({ message: "Thiếu sinh viên hoặc bật chia phòng cả phòng" });
    }

    const contract = await findEffectiveResidenceInRoom(userId, roomId);
    if (!contract) {
      return res.status(400).json({
        message:
          "Sinh viên không có hợp đồng đang hiệu lực (active) tại phòng này — có thể đã chuyển phòng hoặc HĐ chưa active",
      });
    }

    const points = noIndividualPoints ? 0 : Number(rule.points || 0);

    const v = await Violation.create({
      rule: rule._id,
      user: userId,
      room: roomId,
      semester: String(semester),
      schoolYear: String(schoolYear),
      ruleName: rule.name,
      severity: rule.severity,
      points,
      fineAmount,
      compensationAmount,
      description: String(description || ""),
      images: imgArr,
      splitToRoom: false,
      noIndividualPoints: !!noIndividualPoints,
      immediateExpulsion: !!immediateExpulsion || (rule.canImmediateExpulsion && req.body.forceExpulsion),
      batchId: null,
      recordedBy: req.user._id,
      status: "pending",
    });

    if (immediateExpulsion || v.immediateExpulsion) {
      await terminateContractDiscipline(contract._id);
      await Notification.create({
        user: userId,
        title: "Kỷ luật nghiêm",
        message: "Hợp đồng nội trú đã bị chấm dứt theo quyết định kỷ luật.",
        type: "discipline_expel",
        link: "/student/my-contracts",
      });
    } else if (!noIndividualPoints && points > 0) {
      const total = await sumSemesterPoints(userId, schoolYear, semester);
      await notifyThreshold(userId, total, schoolYear, semester);
      if (total >= 7) {
        await Notification.create({
          user: userId,
          title: "Ngưỡng kỷ luật",
          message: "Tổng điểm vi phạm đã đạt 7. Theo quy định cần xử lý chấm dứt hợp đồng — ban quản lý sẽ liên hệ.",
          type: "discipline_expel",
          link: "/student/my-violations",
        });
      }
    }

    await sendNotification({
      userId,
      title: "Vi phạm nội quy KTX",
      message: `Bạn được ghi nhận vi phạm: ${rule.name}. Ban quản lý sẽ xử lý kỷ luật — xem chi tiết tại «Vi phạm của tôi».`,
      type: "discipline_warning",
      link: "/student/my-violations",
    });

    const populated = await Violation.findById(v._id)
      .populate("rule")
      .populate("user", "fullName studentId")
      .populate("room", "roomNumber area")
      .populate("room.area", "name");
    res.status(201).json(normalizeViolationRecord(populated));
  } catch (e) {
    if (e?.code === 11000) {
      return res.status(400).json({ message: "Đã có hóa đơn cho vi phạm này" });
    }
    res.status(500).json({ message: e.message });
  }
};
