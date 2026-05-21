const mongoose = require("mongoose");
const Bed = require("../models/Bed");
const BedHistory = require("../models/BedHistory");
const Contract = require("../models/Contract");
const Room = require("../models/Room");
const { ensureBedsForRoom } = require("../services/bedAllocation");
const {
  syncExpiredActiveContracts,
  clearOccupiedBedDocument,
  countTakenSlots,
} = require("../services/bedOccupancy");

function normalizeBedStatus(s) {
  const v = String(s || "").toLowerCase().trim();
  if (["available", "occupied", "reserved", "maintenance", "locked"].includes(v)) return v;
  return null;
}

function isContractAssignable(contract) {
  const now = new Date();
  if (!["pending_payment", "active"].includes(String(contract.status))) return false;
  if (contract.endDate && new Date(contract.endDate) < now) return false;
  return true;
}

function genderAllowsStay(userGender, areaGenderPolicy) {
  const pol = String(areaGenderPolicy || "mixed").toLowerCase();
  const g = String(userGender || "").toLowerCase().trim();
  if (pol === "mixed") return true;
  if (pol === "male") return g === "male" || g === "m" || g === "nam";
  if (pol === "female") return g === "female" || g === "f" || g === "nu" || g === "nữ";
  return true;
}

function enrichBedLean(b) {
  if (!b || typeof b !== "object") return b;
  let residencyPhase = null;
  if (b.status === "occupied") {
    residencyPhase = b.checkInAt ? "checked_in_staying" : "assigned_pending_checkin";
  } else if (b.status === "reserved") {
    residencyPhase = "reserved_hold";
  } else if (b.status === "maintenance" || b.status === "locked") {
    residencyPhase = "maintenance";
  } else {
    residencyPhase = "vacant";
  }
  return { ...b, residencyPhase };
}

exports.getRoomBeds = async (req, res) => {
  try {
    await syncExpiredActiveContracts();
    const roomId = String(req.params.id || "").trim();
    if (!mongoose.isValidObjectId(roomId)) return res.status(400).json({ message: "roomId không hợp lệ" });
    const room = await Room.findById(roomId).populate("area", "name genderPolicy").select("_id capacity roomNumber area").lean();
    if (!room) return res.status(404).json({ message: "Không tìm thấy phòng" });
    await ensureBedsForRoom(roomId, room.capacity, room.roomNumber);
    let beds = await Bed.find({ room: roomId })
      .populate("currentUser", "fullName studentId email phone gender")
      .populate("currentContract", "contractNumber status startDate endDate")
      .sort({ code: 1 })
      .lean();
    const taken = await countTakenSlots(roomId);
    const occupiedOnly = await Bed.countDocuments({ room: roomId, status: "occupied" });
    const reservedOnly = await Bed.countDocuments({ room: roomId, status: "reserved" });
    const cap = Math.max(1, Number(room.capacity || 1));
    beds = beds.map(enrichBedLean);
    res.json({
      room,
      beds,
      slotStats: {
        totalSlots: cap,
        occupiedSlots: occupiedOnly,
        reservedSlots: reservedOnly,
        emptySlots: Math.max(0, cap - taken),
        fillRatePercent: cap ? Math.round((taken / cap) * 1000) / 10 : 0,
      },
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.updateBedStatus = async (req, res) => {
  try {
    await syncExpiredActiveContracts();
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
    await syncExpiredActiveContracts();
    const roomId = String(req.params.id || "").trim();
    const { bedId, contractId } = req.body || {};
    if (!mongoose.isValidObjectId(roomId)) return res.status(400).json({ message: "roomId không hợp lệ" });
    if (!mongoose.isValidObjectId(bedId)) return res.status(400).json({ message: "bedId không hợp lệ" });
    if (!mongoose.isValidObjectId(contractId)) return res.status(400).json({ message: "contractId không hợp lệ" });

    const [bed, contract, roomDoc] = await Promise.all([
      Bed.findOne({ _id: bedId, room: roomId }),
      Contract.findById(contractId).populate("user", "fullName studentId email phone gender"),
      Room.findById(roomId).populate("area", "genderPolicy name").lean(),
    ]);
    if (!bed) return res.status(404).json({ message: "Không tìm thấy giường trong phòng" });
    if (!contract) return res.status(404).json({ message: "Không tìm thấy hợp đồng" });
    if (!roomDoc) return res.status(404).json({ message: "Không tìm thấy phòng" });
    if (String(contract.room) !== String(roomId)) return res.status(400).json({ message: "Hợp đồng không thuộc phòng này" });

    if (!isContractAssignable(contract)) {
      return res.status(400).json({ message: "Hợp đồng không còn hiệu lực để phân giường (trạng thái hoặc đã quá hạn)" });
    }

    const areaPol =
      roomDoc.area && typeof roomDoc.area === "object" ? roomDoc.area.genderPolicy : "mixed";
    const uGender = contract.user && typeof contract.user === "object" ? contract.user.gender : "";
    if (!genderAllowsStay(uGender, areaPol)) {
      return res.status(400).json({
        message: `Giới tính sinh viên không khớp chính sách khu (${areaPol === "male" ? "nam" : areaPol === "female" ? "nữ" : ""})`,
      });
    }

    if (bed.status === "maintenance" || bed.status === "locked") {
      return res.status(400).json({ message: "Giường đang bảo trì/khóa" });
    }
    if (bed.status === "reserved") {
      return res.status(400).json({ message: "Giường đang được giữ chỗ" });
    }
    if (bed.currentUser || bed.currentContract || bed.status === "occupied") {
      return res.status(400).json({ message: "Giường đã có người ở" });
    }

    const cap = Math.max(1, Number(roomDoc.capacity || 1));
    const taken = await countTakenSlots(roomId);
    if (taken >= cap) {
      return res.status(400).json({ message: "Đã đạt sức chứa slot (occupied/reserved), không thể phân thêm" });
    }

    const userRef =
      contract.user && typeof contract.user === "object" && contract.user._id ? contract.user._id : contract.user;
    const existingBed = await Bed.findOne({
      currentUser: userRef,
      status: { $in: ["occupied", "reserved"] },
    }).lean();
    if (existingBed) return res.status(400).json({ message: "Sinh viên đã có giường đang hoạt động hoặc đang giữ chỗ" });

    bed.status = "occupied";
    bed.currentUser = contract.user._id || contract.user;
    bed.currentContract = contract._id;
    bed.assignedAt = new Date();
    bed.checkInAt = null;
    await bed.save();

    contract.bed = bed._id;
    await contract.save();

    await BedHistory.create({
      bed: bed._id,
      room: bed.room,
      user: contract.user._id || contract.user,
      contract: contract._id,
      action: "assigned",
      toBedCode: bed.code,
      toStatus: "occupied",
      performedBy: req.user?._id || null,
    });

    const bedOut = await Bed.findById(bed._id)
      .populate("currentUser", "fullName studentId email phone gender")
      .populate("currentContract", "contractNumber status startDate endDate")
      .lean();

    res.json({ bed: enrichBedLean(bedOut), contractId: String(contract._id) });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.checkInOccupiedBed = async (req, res) => {
  try {
    await syncExpiredActiveContracts();
    const roomId = String(req.params.id || "").trim();
    const bedId = String(req.params.bedId || "").trim();
    if (!mongoose.isValidObjectId(roomId) || !mongoose.isValidObjectId(bedId)) {
      return res.status(400).json({ message: "Tham số không hợp lệ" });
    }
    const bed = await Bed.findOne({ _id: bedId, room: roomId });
    if (!bed) return res.status(404).json({ message: "Không tìm thấy giường" });
    if (bed.status !== "occupied") return res.status(400).json({ message: "Chỉ check-in khi giường đang occupied" });
    if (!bed.currentContract) return res.status(400).json({ message: "Giường chưa gắn hợp đồng" });

    bed.checkInAt = new Date();
    await bed.save();

    await BedHistory.create({
      bed: bed._id,
      room: bed.room,
      user: bed.currentUser || null,
      contract: bed.currentContract || null,
      action: "checked_in",
      toBedCode: bed.code,
      toStatus: "occupied",
      note: "Check-in thực tế",
      performedBy: req.user?._id || null,
    });

    const bedOut = await Bed.findById(bed._id)
      .populate("currentUser", "fullName studentId email phone gender")
      .populate("currentContract", "contractNumber status startDate endDate")
      .lean();
    res.json({ bed: enrichBedLean(bedOut) });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.transferBed = async (req, res) => {
  try {
    await syncExpiredActiveContracts();
    const roomId = String(req.params.id || "").trim();
    const { contractId, targetBedId, reason } = req.body || {};
    if (!mongoose.isValidObjectId(roomId)) return res.status(400).json({ message: "roomId không hợp lệ" });
    if (!mongoose.isValidObjectId(contractId)) return res.status(400).json({ message: "contractId không hợp lệ" });
    if (!mongoose.isValidObjectId(targetBedId)) return res.status(400).json({ message: "targetBedId không hợp lệ" });

    const contract = await Contract.findById(contractId).populate("user", "gender fullName studentId");
    if (!contract) return res.status(404).json({ message: "Không tìm thấy hợp đồng" });
    if (String(contract.room) !== String(roomId)) return res.status(400).json({ message: "Hợp đồng không thuộc phòng này" });
    if (!isContractAssignable(contract)) {
      return res.status(400).json({ message: "Hợp đồng không còn hiệu lực để chuyển giường" });
    }

    const roomDoc = await Room.findById(roomId).populate("area", "genderPolicy").lean();
    const areaPol = roomDoc?.area && typeof roomDoc.area === "object" ? roomDoc.area.genderPolicy : "mixed";
    const uGender = contract.user && typeof contract.user === "object" ? contract.user.gender : "";
    if (!genderAllowsStay(uGender, areaPol)) {
      return res.status(400).json({ message: "Giới tính sinh viên không khớp chính sách khu" });
    }

    let sourceBed =
      (contract.bed && (await Bed.findOne({ _id: contract.bed, room: roomId }))) ||
      (await Bed.findOne({ currentContract: contract._id, room: roomId }));
    if (!sourceBed || sourceBed.status !== "occupied") {
      return res.status(400).json({ message: "Sinh viên chưa có giường occupied trong phòng để chuyển" });
    }

    const targetBed = await Bed.findOne({ _id: targetBedId, room: roomId });
    if (!targetBed) return res.status(404).json({ message: "Không tìm thấy giường đích" });
    if (String(targetBed._id) === String(sourceBed._id)) {
      return res.status(400).json({ message: "Giường đích trùng giường hiện tại" });
    }
    if (targetBed.status === "maintenance" || targetBed.status === "locked") {
      return res.status(400).json({ message: "Giường đích đang bảo trì/khóa" });
    }
    if (targetBed.status === "reserved") {
      return res.status(400).json({ message: "Giường đích đang được giữ chỗ" });
    }
    if (targetBed.status === "occupied" || targetBed.currentContract || targetBed.currentUser) {
      return res.status(400).json({ message: "Giường đích đã có người" });
    }

    const uid = sourceBed.currentUser;
    const cid = sourceBed.currentContract;

    await BedHistory.create({
      bed: sourceBed._id,
      room: sourceBed.room,
      user: uid || null,
      contract: cid || null,
      action: "transferred_out",
      fromBedCode: sourceBed.code,
      note: reason ? String(reason) : "Chuyển giường trong phòng",
      performedBy: req.user?._id || null,
    });

    sourceBed.status = "available";
    sourceBed.currentUser = null;
    sourceBed.currentContract = null;
    sourceBed.checkInAt = null;
    sourceBed.assignedAt = null;
    await sourceBed.save();

    targetBed.status = "occupied";
    targetBed.currentUser = uid;
    targetBed.currentContract = cid;
    targetBed.assignedAt = new Date();
    targetBed.checkInAt = null;
    await targetBed.save();

    contract.bed = targetBed._id;
    await contract.save();

    await BedHistory.create({
      bed: targetBed._id,
      room: targetBed.room,
      user: uid || null,
      contract: cid || null,
      action: "transferred_in",
      toBedCode: targetBed.code,
      toStatus: "occupied",
      note: reason ? String(reason) : "",
      performedBy: req.user?._id || null,
    });

    const bedOut = await Bed.findById(targetBed._id)
      .populate("currentUser", "fullName studentId email phone gender")
      .populate("currentContract", "contractNumber status startDate endDate")
      .lean();

    res.json({ bed: enrichBedLean(bedOut), contractId: String(contract._id) });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.checkoutBed = async (req, res) => {
  try {
    await syncExpiredActiveContracts();
    const bedId = String(req.params.bedId || "").trim();
    if (!mongoose.isValidObjectId(bedId)) return res.status(400).json({ message: "bedId không hợp lệ" });
    const note = String(req.body?.note || "").trim();
    const bed = await Bed.findById(bedId);
    if (!bed) return res.status(404).json({ message: "Không tìm thấy giường" });
    if (bed.status !== "occupied" && bed.status !== "reserved") {
      return res.status(400).json({ message: "Chỉ check-out khi giường đang occupied hoặc reserved" });
    }

    await clearOccupiedBedDocument(bed, req.user?._id || null, note || "Check-out / trả giường");

    const cleared = await Bed.findById(bedId).lean();
    res.json({ bed: enrichBedLean(cleared) });
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
