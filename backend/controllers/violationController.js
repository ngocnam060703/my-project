const mongoose = require("mongoose");
const ViolationRule = require("../models/ViolationRule");
const Violation = require("../models/Violation");
const Contract = require("../models/Contract");
const Room = require("../models/Room");
const User = require("../models/User");
const Bill = require("../models/Bill");
const Notification = require("../models/Notification");
const { getIO } = require("../socket");

function isAdmin(user) {
  return user?.role === "admin" || user?.role === "manager";
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

async function terminateContractDiscipline(contractId) {
  const contract = await Contract.findById(contractId);
  if (!contract) return;
  if (contract.status === "active" || contract.status === "pending_payment") {
    const room = await Room.findById(contract.room);
    if (room) {
      room.currentOccupancy = Math.max(0, (room.currentOccupancy || 0) - 1);
      room.status = room.currentOccupancy >= room.capacity ? "full" : "available";
      await room.save();
    }
    contract.status = "terminated";
    await contract.save();
  }
}

async function createPenaltyBill({ contractDoc, violationDoc, userId, roomId, totalAmount, penaltyBreakdown, note }) {
  if (totalAmount <= 0) return null;
  const now = new Date();
  const exists = await Bill.findOne({ violation: violationDoc._id });
  if (exists) return exists;
  const bill = await Bill.create({
    billType: "penalty",
    violation: violationDoc._id,
    penaltyBreakdown,
    contract: contractDoc._id,
    user: userId,
    room: roomId,
    month: now.getMonth() + 1,
    year: now.getFullYear(),
    roomFee: 0,
    electricityFee: 0,
    waterFee: 0,
    otherFee: 0,
    sharedCommonFee: 0,
    personalServiceFee: 0,
    occupants: 1,
    total: totalAmount,
    dueDate: new Date(now.getFullYear(), now.getMonth(), 15),
    status: "pending",
    note: note || "Hóa đơn phạt vi phạm nội quy KTX",
  });
  violationDoc.bill = bill._id;
  await violationDoc.save();
  const io = getIO();
  io.emit("bill:new", { userId: String(userId), message: "Bạn có hóa đơn phạt vi phạm mới" });
  await Notification.create({
    user: userId,
    title: "Hóa đơn phạt",
    message: `Bạn có khoản phạt/bồi thường ${Math.round(totalAmount).toLocaleString("vi-VN")}đ. Vui lòng xem mục Phạt trong Hóa đơn.`,
    type: "bill_reminder",
    link: "/student/my-bills",
  });
  return bill;
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
    const { user, room, schoolYear, semester, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (user && mongoose.isValidObjectId(String(user))) filter.user = user;
    if (room && mongoose.isValidObjectId(String(room))) filter.room = room;
    if (schoolYear) filter.schoolYear = String(schoolYear);
    if (semester) filter.semester = String(semester);
    const items = await Violation.find(filter)
      .populate("rule", "code name severity points")
      .populate("user", "fullName studentId email")
      .populate("room", "roomNumber area")
      .populate("room.area", "name")
      .populate("recordedBy", "fullName")
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit));
    const total = await Violation.countDocuments(filter);
    res.json({ violations: items, total });
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
    if (req.user.role !== "user") return res.status(403).json({ message: "Chỉ sinh viên" });
    const items = await Violation.find({ user: req.user._id })
      .populate("rule", "code name handlingAction")
      .populate("room", "roomNumber area")
      .populate("room.area", "name")
      .sort({ createdAt: -1 });
    res.json(items);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.getMyDisciplineStats = async (req, res) => {
  try {
    if (req.user.role !== "user") return res.status(403).json({ message: "Chỉ sinh viên" });
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

    let fineAmount = Number(fineIn || 0);
    const compensationAmount = Number(compIn || 0);
    if (rule.fineMax > 0 && fineAmount > rule.fineMax) fineAmount = rule.fineMax;
    if (rule.fineMin > 0 && fineAmount > 0 && fineAmount < rule.fineMin) {
      return res.status(400).json({ message: `Tiền phạt nên từ ${rule.fineMin.toLocaleString("vi-VN")}đ` });
    }

    const imgArr = Array.isArray(images) ? images.filter((x) => typeof x === "string" && x.length < 2_500_000) : [];

    if (splitToRoom) {
      const contracts = await Contract.find({
        room: roomId,
        status: { $in: ["active", "pending_payment"] },
      });
      if (!contracts.length) {
        return res.status(400).json({ message: "Phòng không có sinh viên để chia phạt" });
      }
      const n = contracts.length;
      const shareFine = Math.round(fineAmount / n);
      const shareComp = Math.round(compensationAmount / n);
      const batchId = new mongoose.Types.ObjectId();
      const created = [];
      for (const c of contracts) {
        const points = noIndividualPoints ? 0 : 0;
        const v = await Violation.create({
          rule: rule._id,
          user: c.user,
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
        });
        const totalPay = shareFine + shareComp;
        if (totalPay > 0) {
          const penaltyBreakdown = [];
          if (shareFine > 0) penaltyBreakdown.push({ label: "Phạt tiền (chia phòng)", amount: shareFine });
          if (shareComp > 0) penaltyBreakdown.push({ label: "Bồi thường (chia phòng)", amount: shareComp });
          await createPenaltyBill({
            contractDoc: c,
            violationDoc: v,
            userId: c.user,
            roomId,
            totalAmount: totalPay,
            penaltyBreakdown,
            note: `${rule.name} — chia đều cho ${n} người trong phòng`,
          });
        }
        created.push(v);
      }
      return res.status(201).json({ created: created.length, violations: created, batchId });
    }

    if (!mongoose.isValidObjectId(String(userId))) {
      return res.status(400).json({ message: "Thiếu sinh viên hoặc bật chia phòng cả phòng" });
    }

    const contract = await Contract.findOne({
      user: userId,
      room: roomId,
      status: { $in: ["active", "pending_payment"] },
    });
    if (!contract) {
      return res.status(400).json({ message: "Sinh viên không có hợp đồng hiệu lực với phòng này" });
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
    });

    const totalPay = fineAmount + compensationAmount;
    if (totalPay > 0) {
      const penaltyBreakdown = [];
      if (fineAmount > 0) penaltyBreakdown.push({ label: "Phạt tiền", amount: fineAmount });
      if (compensationAmount > 0) penaltyBreakdown.push({ label: "Bồi thường", amount: compensationAmount });
      await createPenaltyBill({
        contractDoc: contract,
        violationDoc: v,
        userId,
        roomId,
        totalAmount: totalPay,
        penaltyBreakdown,
        note: `${rule.name} — ${String(description || "").slice(0, 200)}`,
      });
    }

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

    const populated = await Violation.findById(v._id)
      .populate("rule")
      .populate("user", "fullName studentId")
      .populate("room", "roomNumber area")
      .populate("room.area", "name");
    res.status(201).json(populated);
  } catch (e) {
    if (e?.code === 11000) {
      return res.status(400).json({ message: "Đã có hóa đơn cho vi phạm này" });
    }
    res.status(500).json({ message: e.message });
  }
};
