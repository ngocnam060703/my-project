const mongoose = require("mongoose");
const Contract = require("../models/Contract");
const Room = require("../models/Room");
const User = require("../models/User");
const Notification = require("../models/Notification");
const { getIO } = require("../socket");

async function decrementRoomOccupancy(roomId) {
  if (!roomId) return;
  const room = await Room.findById(roomId);
  if (!room) return;
  room.currentOccupancy = Math.max(0, room.currentOccupancy - 1);
  room.status = room.currentOccupancy >= room.capacity ? "full" : "available";
  await room.save();
}

function statusHoldsSlot(status) {
  return status === "active" || status === "pending_payment";
}

exports.getAll = async (req, res) => {
  try {
    const { status, user, room, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (user) filter.user = user;
    if (room) filter.room = room;
    const contracts = await Contract.find(filter)
      .populate("user", "fullName email phone studentId")
      .populate({
        path: "room",
        populate: [
          { path: "area", select: "name" },
          { path: "roomLeader", select: "_id fullName" },
        ],
      })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });
    const total = await Contract.countDocuments(filter);
    res.json({ contracts, total });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getMyContracts = async (req, res) => {
  try {
    const contracts = await Contract.find({ user: req.user._id })
      .populate({
        path: "room",
        populate: [
          { path: "area", select: "name" },
          { path: "roomLeader", select: "_id fullName" },
        ],
      })
      .sort({ createdAt: -1 });
    res.json(contracts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/** CRUD — tạo hợp đồng (admin/manager). Cộng chỗ phòng nếu trạng thái pending_payment hoặc active. */
exports.create = async (req, res) => {
  try {
    const { user, room, startDate, endDate, status: bodyStatus, terms, registration: regId } = req.body;
    if (!user || !room || !startDate || !endDate) {
      return res.status(400).json({ message: "Thiếu user, room, startDate hoặc endDate" });
    }
    if (!mongoose.isValidObjectId(user) || !mongoose.isValidObjectId(room)) {
      return res.status(400).json({ message: "user hoặc room không hợp lệ" });
    }
    const u = await User.findById(user);
    if (!u) return res.status(404).json({ message: "Không tìm thấy sinh viên" });
    const roomDoc = await Room.findById(room);
    if (!roomDoc) return res.status(404).json({ message: "Không tìm thấy phòng" });
    const st = bodyStatus || "pending_payment";
    if (!["pending_payment", "active", "expired", "terminated"].includes(st)) {
      return res.status(400).json({ message: "Trạng thái không hợp lệ" });
    }
    if (statusHoldsSlot(st)) {
      if (roomDoc.currentOccupancy >= roomDoc.capacity) {
        return res.status(400).json({ message: "Phòng đã đầy" });
      }
      roomDoc.currentOccupancy += 1;
      roomDoc.status = roomDoc.currentOccupancy >= roomDoc.capacity ? "full" : "available";
      await roomDoc.save();
    }
    let registrationRef = null;
    if (regId) {
      if (!mongoose.isValidObjectId(regId)) return res.status(400).json({ message: "registration không hợp lệ" });
      registrationRef = regId;
    }
    const cnRaw = req.body.contractNumber;
    const contractNumber =
      cnRaw !== undefined && cnRaw !== null && String(cnRaw).trim() !== "" ? String(cnRaw).trim() : `HD-${Date.now()}`;
    const contract = await Contract.create({
      registration: registrationRef,
      user,
      room,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      status: st,
      terms: terms != null ? String(terms) : "",
      contractNumber,
      createdBy: req.user._id,
    });
    const populated = await Contract.findById(contract._id)
      .populate("user", "fullName email phone studentId")
      .populate({
        path: "room",
        populate: [{ path: "area", select: "name" }, { path: "roomLeader", select: "_id fullName" }],
      });
    res.status(201).json(populated);
  } catch (error) {
    if (error && error.code === 11000) {
      return res.status(400).json({ message: "Số hợp đồng đã tồn tại" });
    }
    console.error("create contract:", error);
    res.status(500).json({ message: error.message || "Lỗi khi tạo hợp đồng" });
  }
};

/** CRUD — cập nhật (ngày, điều khoản, trạng thái). Điều chỉnh chỗ phòng khi đổi trạng thái. */
exports.update = async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Mã hợp đồng không hợp lệ" });
    }
    const contract = await Contract.findById(id);
    if (!contract) return res.status(404).json({ message: "Không tìm thấy hợp đồng" });

    const { startDate, endDate, terms, status: newStatus } = req.body;
    if (newStatus !== undefined) {
      if (!["pending_payment", "active", "expired", "terminated"].includes(newStatus)) {
        return res.status(400).json({ message: "Trạng thái không hợp lệ" });
      }
      const oldHolds = statusHoldsSlot(contract.status);
      const nextHolds = statusHoldsSlot(newStatus);
      if (oldHolds && !nextHolds) {
        await decrementRoomOccupancy(contract.room);
      } else if (!oldHolds && nextHolds) {
        const roomDoc = await Room.findById(contract.room);
        if (!roomDoc) return res.status(400).json({ message: "Phòng không tồn tại" });
        if (roomDoc.currentOccupancy >= roomDoc.capacity) {
          return res.status(400).json({ message: "Phòng đã đầy, không thể đặt trạng thái này" });
        }
        roomDoc.currentOccupancy += 1;
        roomDoc.status = roomDoc.currentOccupancy >= roomDoc.capacity ? "full" : "available";
        await roomDoc.save();
      }
      contract.status = newStatus;
    }
    if (startDate !== undefined) contract.startDate = new Date(startDate);
    if (endDate !== undefined) contract.endDate = new Date(endDate);
    if (terms !== undefined) contract.terms = String(terms);
    await contract.save();
    const populated = await Contract.findById(contract._id)
      .populate("user", "fullName email phone studentId")
      .populate({
        path: "room",
        populate: [{ path: "area", select: "name" }, { path: "roomLeader", select: "_id fullName" }],
      });
    res.json(populated);
  } catch (error) {
    console.error("update contract:", error);
    res.status(500).json({ message: error.message || "Lỗi khi cập nhật hợp đồng" });
  }
};

exports.getById = async (req, res) => {
  try {
    const contract = await Contract.findById(req.params.id)
      .populate("user", "fullName email phone studentId")
      .populate({
        path: "room",
        populate: [
          { path: "area", select: "name" },
          { path: "roomLeader", select: "_id fullName" },
        ],
      });
    if (!contract) return res.status(404).json({ message: "Không tìm thấy hợp đồng" });
    if (req.user.role === "user" && contract.user._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Không có quyền xem" });
    }
    res.json(contract);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.extend = async (req, res) => {
  try {
    const contract = await Contract.findById(req.params.id);
    if (!contract) return res.status(404).json({ message: "Không tìm thấy hợp đồng" });
    const { endDate } = req.body;
    contract.endDate = new Date(endDate);
    await contract.save();
    res.json(contract);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.terminate = async (req, res) => {
  try {
    const contract = await Contract.findById(req.params.id);
    if (!contract) return res.status(404).json({ message: "Không tìm thấy hợp đồng" });
    if (contract.status === "active" || contract.status === "pending_payment") {
      await decrementRoomOccupancy(contract.room);
    }
    contract.status = "terminated";
    await contract.save();
    res.json(contract);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.studentSign = async (req, res) => {
  try {
    const contract = await Contract.findById(req.params.id).populate("registration");
    if (!contract) return res.status(404).json({ message: "Không tìm thấy hợp đồng" });
    if (contract.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Không có quyền ký hợp đồng này" });
    }
    if (contract.status !== "pending_payment") {
      return res.status(400).json({ message: "Hợp đồng không ở trạng thái chờ thanh toán" });
    }
    contract.signedAt = new Date();
    await contract.save();

    const io = getIO();
    io.emit("bill:new", {
      userId: req.user._id.toString(),
      message: "Bạn đã xác nhận thanh toán. Chờ admin xác nhận để hợp đồng có hiệu lực.",
    });
    await Notification.create({
      user: req.user._id,
      title: "Đã gửi xác nhận thanh toán",
      message: "Bạn đã xác nhận thanh toán hợp đồng. Vui lòng chờ admin xác nhận.",
      type: "contract_signed",
      link: "/student/my-contracts",
    });

    if (contract.createdBy) {
      await Notification.create({
        user: contract.createdBy,
        title: "Sinh viên đã ký xác nhận",
        message: `Sinh viên đã ký xác nhận hợp đồng ${contract.contractNumber}. Vui lòng xác nhận thanh toán.`,
        type: "contract_pending_admin_confirm",
        link: "/admin/contracts",
      });
    }

    res.json(contract);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.confirmPayment = async (req, res) => {
  try {
    const contract = await Contract.findById(req.params.id);
    if (!contract) return res.status(404).json({ message: "Không tìm thấy hợp đồng" });
    if (contract.status !== "pending_payment") {
      return res.status(400).json({ message: "Hợp đồng không ở trạng thái chờ thanh toán" });
    }
    if (!contract.signedAt) {
      return res.status(400).json({ message: "Sinh viên chưa ký xác nhận thanh toán" });
    }
    contract.status = "active";
    contract.paymentConfirmedAt = new Date();
    contract.paymentConfirmedBy = req.user._id;
    await contract.save();

    const io = getIO();
    io.emit("registration:approved", {
      userId: contract.user.toString(),
      message: "Bạn là thành viên của KTX",
    });
    await Notification.create({
      user: contract.user,
      title: "Bạn là thành viên của KTX",
      message: "Thanh toán đã được xác nhận. Hợp đồng của bạn đã có hiệu lực, bạn là thành viên của KTX.",
      type: "contract_active",
      link: "/student/my-contracts",
    });

    res.json(contract);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
