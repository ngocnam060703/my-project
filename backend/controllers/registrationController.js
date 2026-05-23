const Registration = require("../models/Registration");
const Room = require("../models/Room");
const Contract = require("../models/Contract");
const Notification = require("../models/Notification");
const User = require("../models/User");
const { getIO } = require("../socket");
const { isSchoolYearNotPast } = require("../utils/schoolYear");
const RegistrationPeriod = require("../models/RegistrationPeriod");
const { findOpenRegistrationPeriod } = require("../services/registrationPeriodPolicy");
const { hasDormRegistrationProfile, REQUIRED_DORM_REGISTRATION_FIELDS } = require("../utils/profileComplete");
const { assignRoomForStudent } = require("../utils/assignRoom");
const {
  approveTransferRequest,
  executeRoomTransfer,
  getTransferSummaryForStudent,
  getTransferEligibilityForStudent,
} = require("../services/roomTransferService");
const { recountRoomOccupancyForRoom } = require("../services/roomOccupancySync");

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

function normalizeRegistrationSemesterYear(reg) {
  const sem = String(reg.semester || "");
  const sy = String(reg.schoolYear || "");
  const isBad = !sem || !sy || sem === "CHUYEN_PHONG" || sy === "N/A";
  if (!isBad) return reg;
  const linked = reg.currentContract?.registration;
  if (linked?.semester && linked?.schoolYear) {
    reg.semester = linked.semester;
    reg.schoolYear = linked.schoolYear;
    return reg;
  }
  const fallback = inferSemesterSchoolYearFromDate(reg.startDate || reg.createdAt || new Date());
  reg.semester = fallback.semester;
  reg.schoolYear = fallback.schoolYear;
  return reg;
}

async function notifyAdminsNewRegistration({ registration, roomDoc, student, typeLabel }) {
  const io = getIO();
  const roomAreaId = String(roomDoc?.area?._id || roomDoc?.area || "");
  const roomNumber = roomDoc?.roomNumber || "";
  const admins = await User.find({
    $or: [{ role: "admin" }, { role: "manager", managedArea: roomAreaId || null }],
  }).select("_id");
  if (!admins.length) return;
  const title = "Đơn đăng ký mới";
  const message = `${student?.fullName || "Sinh viên"} vừa gửi đơn ${typeLabel} cho phòng ${roomNumber}.`;
  await Notification.insertMany(
    admins.map((a) => ({
      user: a._id,
      title,
      message,
      type: "general",
      link: "/admin/registrations",
    }))
  );
  for (const a of admins) {
    io.emit("notification:new", { userId: String(a._id), title, message, link: "/admin/registrations" });
  }
}

exports.getAll = async (req, res) => {
  try {
    const { status, user, room, days, page = 1, limit = 20 } = req.query;
    const filter = { registrationType: "transfer" };
    if (status) filter.status = status;
    if (user) filter.user = user;
    if (room) filter.room = room;
    if (days) {
      const d = parseInt(String(days), 10);
      if (!Number.isNaN(d) && d > 0) {
        const now = new Date();
        const from = new Date(now.getTime() - (d - 1) * 86400000);
        filter.createdAt = { $gte: from };
      }
    }
    if (req.user.role === "manager" && req.user.managedArea) {
      const rooms = await Room.find({ area: req.user.managedArea }).select("_id");
      filter.room = { $in: rooms.map((r) => r._id) };
    }
    const registrations = await Registration.find(filter)
      .populate("user", "fullName email phone studentId")
      .populate({ path: "room", populate: { path: "area", select: "name" } })
      .populate({ path: "fromRoom", populate: { path: "area", select: "name" } })
      .populate({ path: "currentContract", select: "contractNumber status registration", populate: { path: "registration", select: "semester schoolYear" } })
      .populate("reviewedBy", "fullName")
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });
    const [total, pendingCount, approvedCount, rejectedCount] = await Promise.all([
      Registration.countDocuments(filter),
      Registration.countDocuments({ ...filter, status: "pending" }),
      Registration.countDocuments({ ...filter, status: "approved" }),
      Registration.countDocuments({ ...filter, status: "rejected" }),
    ]);
    res.json({
      registrations: registrations.map((r) => normalizeRegistrationSemesterYear(r)),
      total,
      stats: { pending: pendingCount, approved: approvedCount, rejected: rejectedCount },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getMyRegistrations = async (req, res) => {
  try {
    const registrations = await Registration.find({ user: req.user._id, registrationType: "transfer" })
      .populate({ path: "room", populate: { path: "area", select: "name" } })
      .populate({ path: "fromRoom", populate: { path: "area", select: "name" } })
      .populate("newContract", "contractNumber status")
      .populate({ path: "currentContract", select: "contractNumber status registration", populate: { path: "registration", select: "semester schoolYear" } })
      .sort({ createdAt: -1 });
    res.json(registrations.map((r) => normalizeRegistrationSemesterYear(r)));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.create = async (req, res) => {
  try {
    const { room, semester, schoolYear, startDate } = req.body;
    const registrationType = req.body.registrationType === "transfer" ? "transfer" : "dorm";
    const role = String(req.user.role || "");
    if (role !== "user" && role !== "student") {
      return res.status(403).json({ message: "Chỉ sinh viên mới được gửi đơn đăng ký nội trú" });
    }
    const existing = await Registration.findOne({ user: req.user._id, status: "pending", registrationType });
    if (existing) return res.status(400).json({ message: "Bạn đã có đơn đăng ký đang chờ duyệt" });
    const { findResidenceContract, canRequestRoomTransfer } = require("../services/ktxMembership");
    const residenceForDorm = await findResidenceContract(req.user._id);
    const activeContract = residenceForDorm
      ? await Contract.findById(residenceForDorm._id)
          .populate({ path: "room", select: "roomNumber area", populate: { path: "area", select: "name" } })
          .populate("registration", "semester schoolYear")
      : null;
    if (registrationType === "dorm") {
      return res.status(400).json({
        message:
          "Đăng ký ở KTX đã chuyển sang mục Đơn KTX. Bạn không chọn phòng; admin sẽ xếp phòng khi duyệt. Vui lòng gửi đơn tại /applications.",
      });
    }

    const roomDoc = await Room.findById(room).populate("area", "name");
    if (!roomDoc) return res.status(404).json({ message: "Không tìm thấy phòng" });
    if (registrationType === "transfer") {
      const canTransfer = await canRequestRoomTransfer(req.user._id);
      if (!canTransfer || !activeContract || activeContract.status !== "active") {
        return res.status(400).json({
          message:
            "Bạn chưa có hợp đồng đang hiệu lực (active) nên không thể đăng ký chuyển phòng. Nếu HĐ gia hạn đang chờ kích hoạt, vui lòng đợi hoặc liên hệ ban quản lý.",
        });
      }
      const currentRoom = activeContract.room;
      if (!currentRoom || !currentRoom.area) {
        return res.status(400).json({ message: "Không xác định được phòng hiện tại của bạn" });
      }
      if (String(currentRoom._id) === String(roomDoc._id)) {
        return res.status(400).json({ message: "Bạn đang ở phòng này rồi" });
      }
      if (String(currentRoom.area?._id || currentRoom.area) !== String(roomDoc.area?._id || roomDoc.area)) {
        return res.status(400).json({ message: "Chỉ được đăng ký chuyển phòng trong cùng khu" });
      }
      if (roomDoc.status === "maintenance") {
        return res.status(400).json({ message: "Phòng đang bảo trì, không thể đăng ký chuyển đến" });
      }
      const pendingOrProcessing = await Registration.findOne({
        user: req.user._id,
        registrationType: "transfer",
        $or: [{ status: "pending" }, { status: "approved", transferPhase: { $ne: "completed" }, newContract: null }],
      });
      if (pendingOrProcessing) {
        return res.status(400).json({
          message:
            pendingOrProcessing.status === "pending"
              ? "Bạn đã có đơn chuyển phòng đang chờ duyệt"
              : "Bạn có đơn chuyển phòng chưa hoàn tất — không thể gửi thêm",
        });
      }
      const transferContext = await getTransferEligibilityForStudent(req.user._id);
      if (transferContext.hasUpcomingRenewal && !req.body.acknowledgeUpcomingCancellation) {
        return res.status(400).json({
          message: transferContext.warningMessage,
          code: "UPCOMING_RENEWAL_ACK_REQUIRED",
          transferContext,
        });
      }
      const transferReason = String(req.body.transferReason || "").trim();
      const transfer = await Registration.create({
        user: req.user._id,
        room,
        registrationType: "transfer",
        fromRoom: currentRoom._id,
        currentContract: activeContract._id,
        semester: String(semester || activeContract.registration?.semester || inferSemesterSchoolYearFromDate().semester),
        schoolYear: String(schoolYear || activeContract.registration?.schoolYear || inferSemesterSchoolYearFromDate().schoolYear),
        startDate: startDate ? new Date(startDate) : new Date(),
        transferReason,
        note: transferReason || "Đơn chuyển phòng - chờ admin duyệt",
        upcomingCancellationAcknowledgedAt: transferContext.hasUpcomingRenewal ? new Date() : null,
      });
      await notifyAdminsNewRegistration({
        registration: transfer,
        roomDoc,
        student: req.user,
        typeLabel: "chuyển phòng",
      });
      return res.status(201).json(await transfer.populate(["room", "room.area", "fromRoom"]));
    }

    if (activeContract) {
      return res.status(400).json({ message: "Bạn đã là thành viên KTX (đang có hợp đồng hiệu lực)" });
    }
    if (!hasDormRegistrationProfile(req.user)) {
      return res.status(400).json({
        message: `Vui lòng cập nhật đầy đủ hồ sơ trước khi đăng ký nội trú: ${REQUIRED_DORM_REGISTRATION_FIELDS.join(", ")}`,
      });
    }
    const start = startDate ? new Date(startDate) : null;
    if (!start || isNaN(start.getTime())) {
      return res.status(400).json({ message: "Vui lòng chọn ngày bắt đầu" });
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startNormalized = new Date(start);
    startNormalized.setHours(0, 0, 0, 0);
    if (startNormalized < today) {
      return res.status(400).json({ message: "Ngày bắt đầu không được ở trong quá khứ" });
    }
    if (!schoolYear || typeof schoolYear !== "string" || !isSchoolYearNotPast(schoolYear)) {
      return res.status(400).json({
        message:
          "Năm học không hợp lệ hoặc đã qua. Dùng định dạng VD: 2024-2025 (năm kết thúc phải từ năm hiện tại trở đi).",
      });
    }
    const periodCount = await RegistrationPeriod.countDocuments();
    if (periodCount > 0) {
      const now = new Date();
      const period = await findOpenRegistrationPeriod(now);
      if (!period) {
        return res.status(400).json({ message: "Đăng ký nội trú hiện đã đóng. Vui lòng đợi đợt đăng ký tiếp theo." });
      }
    }
    const overCapacity = roomDoc.currentOccupancy >= roomDoc.capacity;
    const registration = await Registration.create({
      user: req.user._id,
      room: roomDoc._id,
      registrationType: "dorm",
      semester,
      schoolYear,
      startDate: startNormalized,
      note: overCapacity ? "Đăng ký vượt sức chứa hiện tại của phòng" : "",
    });
    await notifyAdminsNewRegistration({
      registration,
      roomDoc,
      student: req.user,
      typeLabel: "nội trú",
    });
    res.status(201).json(await registration.populate(["room", "room.area"]));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.approve = async (req, res) => {
  try {
    const reg = await Registration.findById(req.params.id)
      .populate("room")
      .populate("fromRoom")
      .populate("currentContract")
      .populate("user");
    if (!reg) return res.status(404).json({ message: "Không tìm thấy đơn đăng ký" });
    if (reg.status !== "pending") return res.status(400).json({ message: "Đơn đã được xử lý" });
    const room = await Room.findById(reg.room._id);
    if (!room) return res.status(404).json({ message: "Không tìm thấy phòng đích" });

    reg.status = "approved";
    reg.reviewedBy = req.user._id;
    reg.reviewedAt = new Date();

    const isTransferRegistration =
      reg.registrationType === "transfer" ||
      !!reg.currentContract ||
      !!reg.fromRoom;

    if (isTransferRegistration) {
      const result = await approveTransferRequest(reg._id, req.user._id);
      const populated = await Registration.findById(reg._id)
        .populate("room")
        .populate("fromRoom")
        .populate("currentContract", "contractNumber status endDate");
      return res.json({ ...result, registration: populated });
    }

    await reg.save();
    if (!room.roomLeader) room.roomLeader = reg.user._id;
    await room.save();
    const startDate = reg.startDate ? new Date(reg.startDate) : new Date();
    const io = getIO();
    io.emit("registration:approved", { userId: reg.user._id.toString(), message: "Đơn đăng ký của bạn đã được duyệt" });
    await Notification.create({
      user: reg.user._id,
      title: "Đơn được duyệt",
      message: "Đơn của bạn đã được phê duyệt, yêu cầu thanh toán hóa đơn hợp đồng để hoàn tất quá trình.",
      type: "registration_approved",
      link: "/student/my-contracts",
    });

    const contract = await Contract.create({
      registration: reg._id,
      user: reg.user._id,
      room: reg.room._id,
      startDate,
      endDate: new Date(new Date(startDate).setFullYear(new Date(startDate).getFullYear() + 1)),
      contractNumber: `HD-${Date.now()}`,
      status: "pending_payment",
      signedAt: null,
      createdBy: req.user._id,
    });
    await recountRoomOccupancyForRoom(reg.room._id);
    res.json({ registration: reg, contract });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message });
  }
};

exports.reject = async (req, res) => {
  try {
    const regBefore = await Registration.findById(req.params.id).select("user");
    const reason = req.body.reason || "";
    const reg = await Registration.findByIdAndUpdate(
      req.params.id,
      { status: "rejected", reviewedBy: req.user._id, reviewedAt: new Date(), rejectionReason: reason },
      { new: true }
    );
    if (!reg) return res.status(404).json({ message: "Không tìm thấy đơn đăng ký" });
    const io = getIO();
    io.emit("registration:rejected", { userId: regBefore?.user?.toString(), message: "Đơn đăng ký của bạn đã bị từ chối", reason });
    if (regBefore?.user) {
      await Notification.create({
        user: regBefore.user,
        title: "Đơn bị từ chối",
        message: reason ? `Đơn của bạn đã bị từ chối. Lý do: ${reason}` : "Đơn của bạn đã bị từ chối.",
        type: "registration_rejected",
        link: "/student/my-registrations",
      });
    }
    res.json(reg);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getTransferEligibility = async (req, res) => {
  try {
    const data = await getTransferEligibilityForStudent(req.user._id);
    res.json(data);
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message });
  }
};

exports.getTransferSummary = async (req, res) => {
  try {
    const data = await getTransferSummaryForStudent(req.params.id, req.user._id);
    res.json(data);
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message });
  }
};

exports.confirmTransfer = async (req, res) => {
  try {
    const result = await executeRoomTransfer(req.params.id, req.user._id, {
      ip: req.ip,
      ua: req.headers["user-agent"],
    });
    res.json(result);
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message });
  }
};

exports.cancel = async (req, res) => {
  try {
    const reg = await Registration.findById(req.params.id);
    if (!reg) return res.status(404).json({ message: "Không tìm thấy đơn đăng ký" });
    if (reg.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Không có quyền hủy đơn này" });
    }
    if (reg.status !== "pending") {
      return res.status(400).json({ message: "Chỉ có thể hủy đơn đang chờ duyệt" });
    }
    await Registration.findByIdAndDelete(req.params.id);
    res.json({ message: "Đã hủy đơn đăng ký" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
