const mongoose = require("mongoose");
const Application = require("../models/Application");
const Contract = require("../models/Contract");
const Room = require("../models/Room");
const User = require("../models/User");
const Notification = require("../models/Notification");
const { getIO } = require("../socket");
const { isSchoolYearNotPast } = require("../utils/schoolYear");
const RegistrationPeriod = require("../models/RegistrationPeriod");
const { findOpenRegistrationPeriod } = require("../services/registrationPeriodPolicy");
const { countEffectiveResidentsByRoom } = require("../services/roomOccupancySync");
const { hasDormRegistrationProfile, REQUIRED_DORM_REGISTRATION_FIELDS } = require("../utils/profileComplete");
const {
  normalizeGender,
  pickBestRoomForApplication,
  assignRoomWithRetry,
  areaAllowsGender,
  findCandidateRooms,
  tryAssignRoomForApplication,
  loadOccupantGendersByRoom,
  countRoomSlotHoldersByRoom,
  roomFitsStudentGender,
  buildAreaVacancyStats,
  applyLiveOccupancyToAssignedRooms,
} = require("../services/applicationRoomAssignment");

function isStudentAccount(user) {
  const role = String(user?.role || "");
  return role === "user" || role === "student";
}

function inferSemesterSchoolYearFromDate(date = new Date()) {
  const d = new Date(date);
  const month = d.getMonth() + 1;
  const year = d.getFullYear();
  let semester = "HK2";
  if (month >= 8 && month <= 12) semester = "HK1";
  if (month >= 6 && month <= 7) semester = "HK3";
  const schoolYear = month >= 8 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
  return { semester, schoolYear };
}

async function notifyAdminsNewApplication({ student, preferenceLabel }) {
  const io = getIO();
  const admins = await User.find({ $or: [{ role: "admin" }, { role: "manager" }] }).select("_id");
  if (!admins.length) return;
  const title = "Đơn đăng ký KTX mới (chờ duyệt)";
  const message = `${student?.fullName || "Sinh viên"} vừa gửi đơn${preferenceLabel ? ` — nguyện vọng: ${preferenceLabel}` : ""}.`;
  const link = "/admin/applications";
  await Notification.insertMany(
    admins.map((a) => ({
      user: a._id,
      title,
      message,
      type: "general",
      link,
    }))
  );
  for (const a of admins) {
    io.emit("notification:new", { userId: String(a._id), title, message, link });
  }
}

async function userHasActiveResidence(userId) {
  const c = await Contract.findOne({
    user: userId,
    status: { $in: ["active", "pending_payment"] },
  }).select("_id");
  return !!c;
}

exports.list = async (req, res) => {
  try {
    const {
      status,
      search,
      faculty,
      enrollmentYear,
      area,
      priorityCategory,
      userPriorityType,
      days,
      sortOrder = "desc",
      page = 1,
      limit = 10,
    } = req.query;
    const filter = {};
    if (status && ["pending", "approved", "rejected"].includes(String(status))) {
      filter.status = status;
    }
    if (search && String(search).trim()) {
      // handled in unified user filter below
    }

    const priorityCat = priorityCategory ? String(priorityCategory) : "";
    const userPriRaw = String(userPriorityType || "").trim();
    const filterByMinorityProfile =
      priorityCat === "dan_toc_thieu_so" || userPriRaw === "minority";
    const USER_PRIORITY_TYPES = new Set([
      "normal",
      "martyr_child",
      "invalid_child",
      "minority",
      "disabled",
    ]);
    const filterByUserPriority = USER_PRIORITY_TYPES.has(userPriRaw);
    if (priorityCat && ["none", "ho_ngheo", "con_thuong_binh", "chinh_sach"].includes(priorityCat) && !filterByUserPriority) {
      filter.priorityCategory = priorityCat;
    }

    if (days) {
      const d = parseInt(String(days), 10);
      if (!Number.isNaN(d) && d > 0) {
        const now = new Date();
        const from = new Date(now.getTime() - (d - 1) * 86400000);
        filter.createdAt = { $gte: from };
      }
    }

    // Unified user filter for search + faculty + enrollmentYear
    const userFilter = { role: "user", isDeleted: { $ne: true } };
    const and = [];
    if (search && String(search).trim()) {
      const rx = new RegExp(String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      and.push({ fullName: rx });
    }
    if (faculty && String(faculty).trim()) {
      and.push({ faculty: String(faculty).trim() });
    }
    if (enrollmentYear) {
      const y = parseInt(String(enrollmentYear), 10);
      if (!Number.isNaN(y)) {
        const from = new Date(Date.UTC(y, 0, 1));
        const to = new Date(Date.UTC(y + 1, 0, 1));
        and.push({ enrollmentDate: { $gte: from, $lt: to } });
      }
    }
    const userAnd = [...and];
    if (filterByUserPriority) {
      userAnd.push({ priorityType: userPriRaw });
    } else if (filterByMinorityProfile) {
      userAnd.push({ priorityType: "minority" });
    }
    if (userAnd.length > 0) {
      const users = await User.find({ ...userFilter, $and: userAnd }).select("_id").lean();
      filter.user = { $in: users.map((u) => u._id) };
    }

    /** Lọc khu — cho danh sách theo trạng thái; cho thống kê luôn dùng $or */
    let areaOrFilter = null;
    let areaIdTrimmed = null;
    let roomIdsInArea = null;
    if (area && String(area).trim()) {
      areaIdTrimmed = String(area).trim();
      const roomInArea = await Room.find({ area: areaIdTrimmed }).select("_id").lean();
      roomIdsInArea = roomInArea.map((r) => r._id);
      areaOrFilter = { $or: [{ preferenceArea: areaIdTrimmed }, { assignedRoom: { $in: roomIdsInArea } }] };
      if (filter.status === "pending") {
        filter.preferenceArea = areaIdTrimmed;
      } else if (filter.status === "approved" || filter.status === "rejected") {
        filter.assignedRoom = { $in: roomIdsInArea };
      } else {
        Object.assign(filter, areaOrFilter);
      }
    }

    const statsFilter = {};
    if (filter.priorityCategory) statsFilter.priorityCategory = filter.priorityCategory;
    if (filter.createdAt) statsFilter.createdAt = filter.createdAt;
    if (filter.user) statsFilter.user = filter.user;
    if (areaOrFilter) Object.assign(statsFilter, areaOrFilter);

    const order = String(sortOrder).toLowerCase() === "asc" ? 1 : -1;
    const pageNum = Math.max(1, parseInt(page, 10));
    const lim = Math.min(100, Math.max(1, parseInt(limit, 10)));

    const isManager = req.user.role === "manager" && req.user.managedArea;

    if (!isManager) {
      const skip = (pageNum - 1) * lim;
      const rows = await Application.find(filter)
        .populate("user", "fullName email phone studentId gender priorityType priorityProofUrl")
        .populate("preferenceArea", "name genderPolicy")
        .populate({ path: "assignedRoom", select: "roomNumber capacity currentOccupancy status", populate: { path: "area", select: "name" } })
        .populate("reviewedBy", "fullName")
        .sort({ createdAt: order })
        .skip(skip)
        .limit(lim)
        .lean();
      await applyLiveOccupancyToAssignedRooms(rows);
      const total = await Application.countDocuments(filter);
      const [pendingCount, approvedCount, totalAll] = await Promise.all([
        Application.countDocuments({ ...statsFilter, status: "pending" }),
        Application.countDocuments({ ...statsFilter, status: "approved" }),
        Application.countDocuments(statsFilter),
      ]);
      return res.json({
        applications: rows,
        total,
        page: pageNum,
        limit: lim,
        stats: { pending: pendingCount, approved: approvedCount, total: totalAll },
      });
    }

    const managed = req.user.managedArea;
    const roomInArea = await Room.find({ area: managed }).select("_id").lean();
    const roomIdSet = new Set(roomInArea.map((r) => String(r._id)));

    const all = await Application.find(filter)
      .populate("user", "fullName email phone studentId gender priorityType priorityProofUrl")
      .populate("preferenceArea", "name genderPolicy")
      .populate({ path: "assignedRoom", select: "roomNumber area capacity currentOccupancy status", populate: { path: "area", select: "name" } })
      .populate("reviewedBy", "fullName")
      .sort({ createdAt: order })
      .lean();

    const filtered = all.filter((app) => {
      if (app.status === "pending") {
        const pref = app.preferenceArea ? String(app.preferenceArea._id || app.preferenceArea) : "";
        return pref === String(managed);
      }
      const ar = app.assignedRoom;
      const rid = ar ? String(ar._id || ar) : "";
      const aid = ar && ar.area ? String(ar.area._id || ar.area) : "";
      if (rid && roomIdSet.has(rid)) return true;
      return aid === String(managed);
    });

    const total = filtered.length;
    const slice = filtered.slice((pageNum - 1) * lim, (pageNum - 1) * lim + lim);
    await applyLiveOccupancyToAssignedRooms(slice);

    const allStats = await Application.find(statsFilter)
      .populate("preferenceArea", "name genderPolicy")
      .populate({ path: "assignedRoom", select: "roomNumber area capacity currentOccupancy status", populate: { path: "area", select: "name" } })
      .sort({ createdAt: order })
      .lean();
    const statsFiltered = allStats.filter((app) => {
      if (app.status === "pending") {
        const pref = app.preferenceArea ? String(app.preferenceArea._id || app.preferenceArea) : "";
        return pref === String(managed);
      }
      const ar = app.assignedRoom;
      const rid = ar ? String(ar._id || ar) : "";
      const aid = ar && ar.area ? String(ar.area._id || ar.area) : "";
      if (rid && roomIdSet.has(rid)) return true;
      return aid === String(managed);
    });
    const stats = {
      pending: statsFiltered.filter((a) => a.status === "pending").length,
      approved: statsFiltered.filter((a) => a.status === "approved").length,
      total: statsFiltered.length,
    };

    return res.json({ applications: slice, total, page: pageNum, limit: lim, stats });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const app = await Application.findById(req.params.id)
      .populate("user", "fullName email phone studentId gender priorityType priorityProofUrl className major faculty address")
      .populate("preferenceArea", "name genderPolicy description")
      .populate({ path: "assignedRoom", select: "roomNumber floor capacity currentOccupancy price status", populate: { path: "area", select: "name genderPolicy" } })
      .populate("reviewedBy", "fullName email")
      .populate("linkedContract", "contractNumber status startDate endDate");
    if (!app) return res.status(404).json({ message: "Không tìm thấy đơn" });

    if (isStudentAccount(req.user) && String(app.user._id) !== String(req.user._id)) {
      return res.status(403).json({ message: "Không có quyền xem đơn này" });
    }
    if (req.user.role === "manager" && req.user.managedArea) {
      const okPending =
        app.status === "pending" &&
        app.preferenceArea &&
        String(app.preferenceArea._id || app.preferenceArea) === String(req.user.managedArea);
      const ar = app.assignedRoom;
      const inArea =
        ar &&
        (String(ar.area?._id || ar.area) === String(req.user.managedArea) ||
          (await Room.exists({ _id: ar._id, area: req.user.managedArea })));
      if (!okPending && !inArea) return res.status(403).json({ message: "Không có quyền xem đơn ngoài khu quản lý" });
    }

    const plain = app.toObject();
    await applyLiveOccupancyToAssignedRooms([plain]);
    res.json(plain);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

/** Sinh viên gửi đơn — trạng thái Pending, chưa có phòng */
exports.create = async (req, res) => {
  try {
    if (!isStudentAccount(req.user)) {
      return res.status(403).json({ message: "Chỉ tài khoản sinh viên được gửi đơn" });
    }
    const pending = await Application.findOne({ user: req.user._id, status: "pending" });
    if (pending) return res.status(400).json({ message: "Bạn đã có đơn đang chờ duyệt" });

    if (await userHasActiveResidence(req.user._id)) {
      return res.status(400).json({ message: "Bạn đang ở trong KTX (có hợp đồng hiệu lực), không thể gửi đơn đăng ký mới" });
    }
    if (!hasDormRegistrationProfile(req.user)) {
      return res.status(400).json({
        message: `Vui lòng cập nhật đầy đủ hồ sơ trước khi gửi đơn: ${REQUIRED_DORM_REGISTRATION_FIELDS.join(", ")}`,
      });
    }

    const { preferenceArea, semester, schoolYear, startDate } = req.body;
    const gNormRaw = normalizeGender(req.user.gender);
    const gNorm = gNormRaw === "male" || gNormRaw === "female" ? gNormRaw : "unknown";
    const start = startDate ? new Date(startDate) : null;
    if (!start || isNaN(start.getTime())) {
      return res.status(400).json({ message: "Vui lòng chọn ngày bắt đầu" });
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startN = new Date(start);
    startN.setHours(0, 0, 0, 0);
    if (startN < today) return res.status(400).json({ message: "Ngày bắt đầu không được trong quá khứ" });

    const sy = String(schoolYear || "");
    if (!sy || !isSchoolYearNotPast(sy)) {
      return res.status(400).json({
        message:
          "Năm học không hợp lệ hoặc đã qua. Dùng định dạng VD: 2025-2026 (năm kết thúc phải từ năm hiện tại trở đi).",
      });
    }
    const sem = String(semester || inferSemesterSchoolYearFromDate().semester);
    if (!sem) return res.status(400).json({ message: "Học kỳ không hợp lệ" });

    const periodCount = await RegistrationPeriod.countDocuments();
    if (periodCount > 0) {
      const now = new Date();
      const period = await findOpenRegistrationPeriod(now);
      if (!period) {
        return res.status(400).json({ message: "Đợt đăng ký hiện đã đóng. Vui lòng đợi đợt tiếp theo." });
      }
    }

    let prefId = null;
    if (preferenceArea) {
      const Area = require("../models/Area");
      const ar = await Area.findOne({ _id: preferenceArea, isDeleted: { $ne: true } });
      if (!ar) return res.status(400).json({ message: "Khu nguyện vọng không tồn tại" });
      if (!areaAllowsGender(ar, gNorm)) {
        return res.status(400).json({ message: "Khu nguyện vọng không phù hợp giới tính của bạn" });
      }
      prefId = ar._id;
    }

    const doc = await Application.create({
      user: req.user._id,
      genderSnapshot: gNorm,
      preferenceArea: prefId,
      semester: sem,
      schoolYear: sy,
      startDate: startN,
      priorityCategory: ["none", "ho_ngheo", "con_thuong_binh", "chinh_sach"].includes(String(req.body?.priorityCategory || ""))
        ? String(req.body.priorityCategory)
        : "none",
      status: "pending",
    });
    const populated = await Application.findById(doc._id).populate("preferenceArea", "name").populate("user", "fullName");
    const prefName = populated.preferenceArea && typeof populated.preferenceArea === "object" ? populated.preferenceArea.name : "";
    await notifyAdminsNewApplication({ student: req.user, preferenceLabel: prefName || "" });
    res.status(201).json(populated);
  } catch (e) {
    if (e && e.code === 11000) {
      return res.status(400).json({ message: "Bạn đã có đơn đang chờ duyệt" });
    }
    res.status(500).json({ message: e.message });
  }
};

exports.getSuggestedRoom = async (req, res) => {
  try {
    const app = await Application.findById(req.params.id).lean();
    if (!app) return res.status(404).json({ message: "Không tìm thấy đơn" });
    if (req.user.role === "manager" && req.user.managedArea) {
      if (!app.preferenceArea || String(app.preferenceArea) !== String(req.user.managedArea)) {
        return res.status(403).json({ message: "Chỉ xem gợi ý cho đơn thuộc khu bạn phụ trách." });
      }
    }
    if (app.status !== "pending") {
      return res.status(400).json({ message: "Chỉ gợi ý cho đơn đang chờ duyệt" });
    }
    const room = await pickBestRoomForApplication(app, null);
    if (!room) {
      return res.status(404).json({
        message:
          "Chưa có phòng phù hợp. Nam và nữ không ở chung phòng — cần phòng trống hoặc phòng đang có sinh viên cùng giới tính.",
      });
    }
    const heldMap = await countEffectiveResidentsByRoom([room._id]);
    const held = heldMap.get(String(room._id)) ?? Number(room.currentOccupancy || 0);
    const cap = Number(room.capacity) || 0;
    const full = await Room.findById(room._id).populate("area", "name genderPolicy").lean();
    if (full) {
      full.currentOccupancy = held;
      if (cap > 0) full.status = held >= cap ? "full" : full.status === "maintenance" ? "maintenance" : "available";
    }
    res.json({
      room: full,
      vacantSlots: cap > 0 ? Math.max(0, cap - held) : 0,
      rules: [
        "Đúng khu theo giới tính (nam/nữ/hỗn hợp)",
        "Khu hỗn hợp: không xếp nam và nữ chung một phòng",
        "Còn chỗ",
        "Ưu tiên khu nguyện vọng",
        "Ưu tiên phòng gần đầy",
      ],
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.getCandidateRooms = async (req, res) => {
  try {
    const app = await Application.findById(req.params.id).lean();
    if (!app) return res.status(404).json({ message: "Không tìm thấy đơn" });
    if (app.status !== "pending") {
      return res.status(400).json({ message: "Chỉ chọn phòng cho đơn đang chờ duyệt" });
    }

    if (req.user.role === "manager" && req.user.managedArea) {
      if (!app.preferenceArea || String(app.preferenceArea) !== String(req.user.managedArea)) {
        return res.status(403).json({ message: "Chỉ xem danh sách phòng cho đơn thuộc khu bạn phụ trách." });
      }
    }

    const rooms = await findCandidateRooms(
      { genderNorm: normalizeGender(app.genderSnapshot) || app.genderSnapshot, preferenceAreaId: app.preferenceArea || null },
      null
    );

    const managed = req.user.role === "manager" ? req.user.managedArea : null;
    const filtered = managed ? rooms.filter((r) => String(r.area?._id || r.area) === String(managed)) : rooms;

    const payload = filtered.map((r) => {
      const held = Number(r.currentOccupancy || 0);
      const cap = Number(r.capacity) || 0;
      return {
        _id: r._id,
        roomNumber: r.roomNumber,
        capacity: r.capacity,
        currentOccupancy: held,
        vacantSlots: cap > 0 ? Math.max(0, cap - held) : 0,
        status: cap > 0 && held >= cap ? "full" : r.status === "maintenance" ? "maintenance" : "available",
        area: r.area,
      };
    });
    const areaStats = buildAreaVacancyStats(filtered);
    res.json({
      rooms: payload,
      areaStats,
      ...(payload.length === 0
        ? {
            message:
              "Chưa có phòng phù hợp. Nam và nữ không ở chung phòng — cần phòng trống hoặc phòng đang có sinh viên cùng giới tính.",
          }
        : {}),
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.statsByDay = async (req, res) => {
  try {
    const days = Math.min(90, Math.max(1, parseInt(req.query.days || "14", 10)));
    const since = new Date();
    since.setDate(since.getDate() - days);
    const rows = await Application.aggregate([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);
    res.json({ days, series: rows.map((r) => ({ date: r._id, count: r.count })) });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.approve = async (req, res) => {
  try {
    const app = await Application.findById(req.params.id);
    if (!app) return res.status(404).json({ message: "Không tìm thấy đơn" });
    if (app.status !== "pending") return res.status(400).json({ message: "Đơn đã được xử lý, không thể duyệt lại" });
    if (req.user.role === "manager" && req.user.managedArea) {
      if (!app.preferenceArea || String(app.preferenceArea) !== String(req.user.managedArea)) {
        return res.status(403).json({ message: "Ban quản lý khu chỉ duyệt đơn có nguyện vọng đúng khu mình phụ trách." });
      }
    }
    if (await userHasActiveResidence(app.user)) {
      return res.status(400).json({ message: "Sinh viên đã có hợp đồng KTX hiệu lực — không thể duyệt đơn mới" });
    }

    const requestedRoomId = req.body?.roomId ? String(req.body.roomId) : "";
    let room = null;
    if (requestedRoomId) {
      if (!mongoose.isValidObjectId(requestedRoomId)) return res.status(400).json({ message: "roomId không hợp lệ" });
      const roomDoc = await Room.findById(requestedRoomId).populate("area", "name genderPolicy isActive isDeleted");
      if (!roomDoc) return res.status(404).json({ message: "Không tìm thấy phòng đã chọn" });
      if (roomDoc.status === "maintenance") return res.status(400).json({ message: "Phòng đang bảo trì, không thể xếp" });
      if (req.user.role === "manager" && req.user.managedArea) {
        if (String(roomDoc.area?._id || roomDoc.area) !== String(req.user.managedArea)) {
          return res.status(403).json({ message: "Bạn chỉ được xếp phòng trong khu bạn phụ trách" });
        }
      }
      const genderNorm = normalizeGender(app.genderSnapshot) || app.genderSnapshot;
      const areaDoc = roomDoc.area && typeof roomDoc.area === "object" ? roomDoc.area : null;
      if (!areaDoc || areaDoc.isDeleted || areaDoc.isActive === false) {
        return res.status(400).json({ message: "Khu của phòng không hợp lệ hoặc đã bị khóa" });
      }
      if (!areaAllowsGender(areaDoc, genderNorm)) {
        return res.status(400).json({ message: "Phòng không phù hợp theo giới tính / quy định khu" });
      }
      const occMap = await loadOccupantGendersByRoom([roomDoc._id], null);
      const occ = occMap.get(String(roomDoc._id)) || [];
      if (!roomFitsStudentGender(areaDoc, genderNorm, occ)) {
        return res.status(400).json({
          message:
            "Phòng không phù hợp: nam và nữ không được ở chung phòng (khu hỗn hợp chỉ xếp cùng giới tính trong một phòng).",
        });
      }
      const updated = await tryAssignRoomForApplication(roomDoc._id, genderNorm, null);
      if (!updated) {
        return res.status(400).json({
          message:
            "Phòng không còn phù hợp hoặc đã đầy. Nam và nữ không ở chung phòng — chọn phòng trống hoặc phòng cùng giới tính.",
        });
      }
      room = updated;
    } else {
      const { error, room: autoRoom } = await assignRoomWithRetry(app, null);
      if (error === "NO_ROOM" || !autoRoom) {
        return res.status(400).json({
          message:
            "Chưa có phòng phù hợp. Nam và nữ không ở chung phòng — cần phòng trống hoặc phòng đang có sinh viên cùng giới tính. Vui lòng thêm phòng hoặc chọn phòng thủ công.",
        });
      }
      room = autoRoom;
    }

    app.status = "approved";
    app.assignedRoom = room._id;
    app.reviewedBy = req.user._id;
    app.reviewedAt = new Date();
    app.note = "";
    await app.save();

    const startDate = app.startDate ? new Date(app.startDate) : new Date();
    const appUser = await User.findById(app.user).select("priorityType").lean();
    const roomForPricing = await Room.findById(room._id).lean();
    if (!roomForPricing) return res.status(404).json({ message: "Không tìm thấy phòng để tạo hợp đồng" });
    const { buildContractPricingFields } = require("../services/contractPricing");
    const pricing = buildContractPricingFields({ roomDoc: roomForPricing, userDoc: appUser });
    const c0 = (
      await Contract.create([
        {
          application: app._id,
          registration: null,
          user: app.user,
          room: room._id,
          startDate,
          endDate: new Date(new Date(startDate).setFullYear(new Date(startDate).getFullYear() + 1)),
          contractNumber: `HD-A${Date.now()}`,
          status: "pending_payment",
          signedAt: null,
          createdBy: req.user._id,
          ...pricing,
        },
      ])
    )[0];

    app.linkedContract = c0._id;
    if (!room.roomLeader) {
      room.roomLeader = app.user;
      await room.save();
    }
    await app.save();

    const { recountRoomOccupancyForRoom } = require("../services/roomOccupancySync");
    await recountRoomOccupancyForRoom(room._id);

    const io = getIO();
    io.emit("application:approved", { userId: String(app.user), message: "Đơn đăng ký KTX của bạn đã được duyệt" });
    await Notification.create({
      user: app.user,
      title: "Đơn đăng ký KTX được duyệt",
      message: `Bạn đã được phân phòng ${room.roomNumber}. Vui lòng hoàn tất thanh toán hợp đồng.`,
      type: "registration_approved",
      link: "/student/my-applications",
    });

    const out = await Application.findById(app._id)
      .populate("user", "fullName email studentId")
      .populate({ path: "assignedRoom", populate: { path: "area", select: "name" } })
      .populate("linkedContract");
    res.json({ application: out, contract: c0 });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.reject = async (req, res) => {
  try {
    const note = String(req.body.note || req.body.reason || "").trim();
    if (!note) return res.status(400).json({ message: "Vui lòng nhập lý do từ chối" });

    const app = await Application.findById(req.params.id);
    if (!app) return res.status(404).json({ message: "Không tìm thấy đơn" });
    if (app.status !== "pending") return res.status(400).json({ message: "Đơn đã được xử lý" });
    if (req.user.role === "manager" && req.user.managedArea) {
      if (!app.preferenceArea || String(app.preferenceArea) !== String(req.user.managedArea)) {
        return res.status(403).json({ message: "Ban quản lý khu chỉ từ chối đơn có nguyện vọng đúng khu mình phụ trách." });
      }
    }

    app.status = "rejected";
    app.note = note;
    app.reviewedBy = req.user._id;
    app.reviewedAt = new Date();
    await app.save();

    const io = getIO();
    io.emit("application:rejected", { userId: String(app.user), message: "Đơn đăng ký KTX của bạn đã bị từ chối", note });
    await Notification.create({
      user: app.user,
      title: "Đơn đăng ký KTX bị từ chối",
      message: `Lý do: ${note}`,
      type: "registration_rejected",
      link: "/student/my-applications",
    });

    const out = await Application.findById(app._id).populate("user", "fullName email");
    res.json(out);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.listMine = async (req, res) => {
  try {
    const rows = await Application.find({ user: req.user._id })
      .populate("preferenceArea", "name")
      .populate({ path: "assignedRoom", select: "roomNumber", populate: { path: "area", select: "name" } })
      .sort({ createdAt: -1 })
      .lean();
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

/**
 * Sinh viên hủy đơn của chính mình — chỉ khi còn pending (chưa duyệt).
 * Xóa bản ghi để giải phóng ràng buộc unique 1 đơn pending / user.
 */
exports.cancelMine = async (req, res) => {
  try {
    if (!isStudentAccount(req.user)) {
      return res.status(403).json({ message: "Chỉ tài khoản sinh viên được hủy đơn qua API này" });
    }
    const id = String(req.params.id || "");
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "ID đơn không hợp lệ" });
    }
    const deleted = await Application.findOneAndDelete({
      _id: id,
      user: req.user._id,
      status: "pending",
    }).lean();
    if (!deleted) {
      return res.status(404).json({
        message: "Không hủy được: đơn không tồn tại, không thuộc bạn, hoặc đã được xử lý (không còn chờ duyệt)",
      });
    }
    res.json({ message: "Đã hủy đơn đăng ký", id: String(deleted._id) });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};
