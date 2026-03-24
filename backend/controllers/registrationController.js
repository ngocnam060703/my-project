const Registration = require("../models/Registration");
const Room = require("../models/Room");
const Contract = require("../models/Contract");
const Notification = require("../models/Notification");
const User = require("../models/User");
const { getIO } = require("../socket");
const { isSchoolYearNotPast } = require("../utils/schoolYear");
const RegistrationPeriod = require("../models/RegistrationPeriod");
const { hasDormRegistrationProfile, REQUIRED_DORM_REGISTRATION_FIELDS } = require("../utils/profileComplete");

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
    const { status, user, room, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (user) filter.user = user;
    if (room) filter.room = room;
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
    const total = await Registration.countDocuments(filter);
    res.json({ registrations: registrations.map((r) => normalizeRegistrationSemesterYear(r)), total });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getMyRegistrations = async (req, res) => {
  try {
    const registrations = await Registration.find({ user: req.user._id })
      .populate({ path: "room", populate: { path: "area", select: "name" } })
      .populate({ path: "fromRoom", populate: { path: "area", select: "name" } })
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
    if (req.user.role !== "user") {
      return res.status(403).json({ message: "Chỉ sinh viên mới được gửi đơn đăng ký nội trú" });
    }
    const existing = await Registration.findOne({ user: req.user._id, status: "pending", registrationType });
    if (existing) return res.status(400).json({ message: "Bạn đã có đơn đăng ký đang chờ duyệt" });
    const activeContract = await Contract.findOne({
      user: req.user._id,
      status: { $in: ["active", "pending_payment"] },
    })
      .populate({ path: "room", select: "roomNumber area", populate: { path: "area", select: "name" } })
      .populate("registration", "semester schoolYear");
    const roomDoc = await Room.findById(room).populate("area", "name");
    if (!roomDoc) return res.status(404).json({ message: "Không tìm thấy phòng" });
    if (registrationType === "transfer") {
      if (!activeContract) {
        return res.status(400).json({ message: "Bạn chưa là thành viên KTX nên không thể đăng ký chuyển phòng" });
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
      const transfer = await Registration.create({
        user: req.user._id,
        room,
        registrationType: "transfer",
        fromRoom: currentRoom._id,
        currentContract: activeContract._id,
        semester: String(semester || activeContract.registration?.semester || inferSemesterSchoolYearFromDate().semester),
        schoolYear: String(schoolYear || activeContract.registration?.schoolYear || inferSemesterSchoolYearFromDate().schoolYear),
        startDate: startDate ? new Date(startDate) : new Date(),
        note: "Đơn chuyển phòng - chờ admin duyệt",
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
      const period = await RegistrationPeriod.findOne({ isActive: true, startDate: { $lte: now }, endDate: { $gte: now } });
      if (!period) {
        return res.status(400).json({ message: "Đăng ký nội trú hiện đã đóng. Vui lòng đợi đợt đăng ký tiếp theo." });
      }
    }
    const overCapacity = roomDoc.currentOccupancy >= roomDoc.capacity;
    const registration = await Registration.create({
      user: req.user._id,
      room,
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
      const contract = await Contract.findOne({
        _id: reg.currentContract || undefined,
        user: reg.user._id,
        status: { $in: ["active", "pending_payment"] },
      }).populate("room");
      if (!contract) {
        const fallbackContract = await Contract.findOne({
          user: reg.user._id,
          room: reg.fromRoom || undefined,
          status: { $in: ["active", "pending_payment"] },
        }).populate("room");
        if (!fallbackContract) {
          return res.status(400).json({ message: "Không tìm thấy hợp đồng hiện tại để chuyển phòng" });
        }
        reg.currentContract = fallbackContract._id;
        await reg.save();
      }
      const resolvedContract = contract || (await Contract.findById(reg.currentContract).populate("room"));
      const fromRoom = await Room.findById(resolvedContract.room?._id || reg.fromRoom);
      if (!fromRoom) return res.status(404).json({ message: "Không tìm thấy phòng hiện tại của sinh viên" });
      if (String(fromRoom._id) === String(room._id)) {
        return res.status(400).json({ message: "Phòng đích trùng với phòng hiện tại" });
      }
      if (String(fromRoom.area) !== String(room.area)) {
        return res.status(400).json({ message: "Chỉ được duyệt chuyển phòng trong cùng khu" });
      }

      fromRoom.currentOccupancy = Math.max(0, (fromRoom.currentOccupancy || 0) - 1);
      fromRoom.status = fromRoom.currentOccupancy >= fromRoom.capacity ? "full" : "available";
      if (String(fromRoom.roomLeader || "") === String(reg.user._id)) {
        fromRoom.roomLeader = null;
      }

      room.currentOccupancy += 1;
      room.status = room.currentOccupancy >= room.capacity ? "full" : "available";
      if (!room.roomLeader) room.roomLeader = reg.user._id;

      resolvedContract.room = room._id;
      await Promise.all([reg.save(), fromRoom.save(), room.save(), resolvedContract.save()]);

      const io = getIO();
      io.emit("registration:approved", { userId: reg.user._id.toString(), message: "Đơn chuyển phòng của bạn đã được duyệt" });
      await Notification.create({
        user: reg.user._id,
        title: "Đơn chuyển phòng được duyệt",
        message: `Bạn đã được duyệt chuyển sang phòng ${room.roomNumber}.`,
        type: "registration_approved",
        link: "/student/my-contracts",
      });
      return res.json({ registration: reg, contract: resolvedContract, movedFromRoom: fromRoom._id, movedToRoom: room._id });
    }

    await reg.save();
    room.currentOccupancy += 1;
    room.status = room.currentOccupancy >= room.capacity ? "full" : "available";
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
    res.json({ registration: reg, contract });
  } catch (error) {
    res.status(500).json({ message: error.message });
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
