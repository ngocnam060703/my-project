const mongoose = require("mongoose");
const Bed = require("../models/Bed");
const BedHistory = require("../models/BedHistory");
const Contract = require("../models/Contract");
const Room = require("../models/Room");

function normalizeBedStatus(s) {
  const v = String(s || "").toLowerCase().trim();
  if (["available", "occupied", "reserved", "maintenance", "locked"].includes(v)) return v;
  return null;
}

async function ensureBedsForRoom(roomId, capacity) {
  const existing = await Bed.find({ room: roomId }).select("_id").lean();
  if (existing.length > 0) return;
  const cap = Math.max(1, Number(capacity || 1));
  const codes = [];
  const rows = ["A", "B", "C", "D", "E", "F"];
  let idx = 0;
  while (codes.length < cap) {
    const r = rows[Math.floor(idx / 10)] || "A";
    const n = (idx % 10) + 1;
    codes.push(`${r}${n}`);
    idx += 1;
  }
  await Bed.insertMany(codes.map((code) => ({ room: roomId, code, status: "available" })));
}

exports.getRoomBeds = async (req, res) => {
  try {
    const roomId = String(req.params.id || "").trim();
    if (!mongoose.isValidObjectId(roomId)) return res.status(400).json({ message: "roomId không hợp lệ" });
    const room = await Room.findById(roomId).select("_id capacity roomNumber").lean();
    if (!room) return res.status(404).json({ message: "Không tìm thấy phòng" });
    await ensureBedsForRoom(roomId, room.capacity);
    const beds = await Bed.find({ room: roomId })
      .populate("currentUser", "fullName studentId email phone gender")
      .sort({ code: 1 })
      .lean();
    res.json({ room, beds });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.updateBedStatus = async (req, res) => {
  try {
    const bedId = String(req.params.bedId || "").trim();
    if (!mongoose.isValidObjectId(bedId)) return res.status(400).json({ message: "bedId không hợp lệ" });
    const st = normalizeBedStatus(req.body?.status);
    if (!st) return res.status(400).json({ message: "status không hợp lệ" });
    const bed = await Bed.findById(bedId);
    if (!bed) return res.status(404).json({ message: "Không tìm thấy giường" });
    if (bed.status === "occupied" && (st === "maintenance" || st === "locked")) {
      return res.status(400).json({ message: "Giường đang có người ở, không thể chuyển sang bảo trì/khóa" });
    }
    const fromStatus = bed.status;
    bed.status = st;
    await bed.save();
    await BedHistory.create({
      bed: bed._id,
      room: bed.room,
      user: bed.currentUser || null,
      contract: bed.currentContract || null,
      action: "status_changed",
      fromStatus,
      toStatus: st,
      performedBy: req.user?._id || null,
    });
    res.json(bed);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.assignBed = async (req, res) => {
  try {
    const roomId = String(req.params.id || "").trim();
    const { bedId, contractId } = req.body || {};
    if (!mongoose.isValidObjectId(roomId)) return res.status(400).json({ message: "roomId không hợp lệ" });
    if (!mongoose.isValidObjectId(bedId)) return res.status(400).json({ message: "bedId không hợp lệ" });
    if (!mongoose.isValidObjectId(contractId)) return res.status(400).json({ message: "contractId không hợp lệ" });

    const [bed, contract] = await Promise.all([
      Bed.findOne({ _id: bedId, room: roomId }),
      Contract.findById(contractId),
    ]);
    if (!bed) return res.status(404).json({ message: "Không tìm thấy giường trong phòng" });
    if (!contract) return res.status(404).json({ message: "Không tìm thấy hợp đồng" });
    if (String(contract.room) !== String(roomId)) return res.status(400).json({ message: "Hợp đồng không thuộc phòng này" });
    if (!["pending_payment", "active"].includes(String(contract.status))) {
      return res.status(400).json({ message: "Chỉ phân giường cho hợp đồng active hoặc pending_payment" });
    }
    if (bed.status === "maintenance" || bed.status === "locked") {
      return res.status(400).json({ message: "Giường đang bảo trì/khóa" });
    }
    if (bed.currentUser || bed.currentContract || bed.status === "occupied") {
      return res.status(400).json({ message: "Giường đã có người ở" });
    }

    // Rule: each student only one bed (active/pending)
    const existingBed = await Bed.findOne({
      currentUser: contract.user,
      status: { $in: ["occupied", "reserved"] },
    }).lean();
    if (existingBed) return res.status(400).json({ message: "Sinh viên đã được phân giường khác" });

    bed.status = "occupied";
    bed.currentUser = contract.user;
    bed.currentContract = contract._id;
    bed.checkInAt = bed.checkInAt || new Date();
    await bed.save();

    contract.bed = bed._id;
    await contract.save();

    await BedHistory.create({
      bed: bed._id,
      room: bed.room,
      user: contract.user,
      contract: contract._id,
      action: "assigned",
      toBedCode: bed.code,
      toStatus: "occupied",
      performedBy: req.user?._id || null,
    });

    res.json({ bed, contractId: String(contract._id) });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.checkoutBed = async (req, res) => {
  try {
    const bedId = String(req.params.bedId || "").trim();
    if (!mongoose.isValidObjectId(bedId)) return res.status(400).json({ message: "bedId không hợp lệ" });
    const bed = await Bed.findById(bedId);
    if (!bed) return res.status(404).json({ message: "Không tìm thấy giường" });

    const userId = bed.currentUser;
    const contractId = bed.currentContract;
    bed.status = "available";
    bed.currentUser = null;
    bed.currentContract = null;
    bed.checkInAt = null;
    await bed.save();

    if (contractId) {
      await Contract.updateOne({ _id: contractId }, { $set: { bed: null } });
    }

    await BedHistory.create({
      bed: bed._id,
      room: bed.room,
      user: userId || null,
      contract: contractId || null,
      action: "checked_out",
      fromBedCode: bed.code,
      fromStatus: "occupied",
      toStatus: "available",
      performedBy: req.user?._id || null,
    });

    res.json({ bed });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.getBedHistory = async (req, res) => {
  try {
    const bedId = String(req.params.bedId || "").trim();
    if (!mongoose.isValidObjectId(bedId)) return res.status(400).json({ message: "bedId không hợp lệ" });
    const items = await BedHistory.find({ bed: bedId })
      .populate("user", "fullName studentId")
      .populate("performedBy", "fullName")
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    res.json({ items });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

