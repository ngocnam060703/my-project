const Area = require("../models/Area");
const Room = require("../models/Room");
const Contract = require("../models/Contract");

const notDeleted = { isDeleted: { $ne: true } };

exports.getResidents = async (req, res) => {
  try {
    const area = await Area.findOne({ _id: req.params.id, ...notDeleted }).select("_id name").lean();
    if (!area) return res.status(404).json({ message: "Không tìm thấy khu" });

    const rooms = await Room.find({ area: area._id }).select("_id").lean();
    const roomIds = rooms.map((r) => r._id);
    if (!roomIds.length) return res.json({ area, residents: [], totalResidents: 0 });

    const contracts = await Contract.find({
      room: { $in: roomIds },
      status: { $in: ["active", "pending_payment"] },
    })
      .populate("user", "fullName studentId email phone gender major enrollmentDate")
      .populate("room", "roomNumber floor area")
      .populate("bed", "code status")
      .sort({ createdAt: 1 })
      .lean();

    const residents = contracts
      .filter((c) => c.user && c.room)
      .map((c) => ({
        contractId: c._id,
        status: c.status,
        contractNumber: c.contractNumber,
        startDate: c.startDate,
        endDate: c.endDate,
        bedId: c.bed?._id || c.bed || null,
        user: c.user,
        room: c.room,
        bed: c.bed || null,
      }));

    res.json({ area, residents, totalResidents: residents.length });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

