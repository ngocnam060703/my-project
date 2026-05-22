const { validationResult } = require("express-validator");
const Area = require("../models/Area");
const Room = require("../models/Room");
const Contract = require("../models/Contract");
const { contractHoldsRoomSlot } = require("../services/roomOccupancySync");
const { normalizeGenderPolicy } = require("../utils/genderPolicy");

const notDeleted = { isDeleted: { $ne: true } };

async function loadRoomStatsForAreas(areaDocs) {
  const ids = areaDocs.map((a) => a._id);
  const byArea = new Map();
  for (const id of ids) {
    byArea.set(String(id), { actualRooms: 0, currentStudents: 0, sumRoomCapacity: 0 });
  }
  if (!ids.length) return byArea;

  const rooms = await Room.find({ area: { $in: ids } }).select("area currentOccupancy capacity").lean();
  for (const r of rooms) {
    const key = String(r.area);
    if (!byArea.has(key)) continue;
    const agg = byArea.get(key);
    agg.actualRooms += 1;
    agg.currentStudents += Number(r.currentOccupancy) || 0;
    agg.sumRoomCapacity += Number(r.capacity) || 0;
  }
  return byArea;
}

function effectivePlannedCapacity(area, sumRoomCapacity, actualRooms) {
  /** Chưa có phòng thực tế → sức chứa hiệu lực = 0 (tránh hiển thị 1 do quy hoạch). */
  if (!actualRooms || actualRooms <= 0) return 0;
  return Math.max(0, sumRoomCapacity);
}

function effectivePlannedRooms(area, actualRooms) {
  const p = area.plannedTotalRooms;
  if (p != null && Number(p) > 0) return Number(p);
  return actualRooms;
}

/** Trạng thái theo spec: chỉ available | full (đủ chỗ vs đầy theo sức chứa khu) */
function computeZoneStatus(currentStudents, capacity) {
  if (!capacity || capacity <= 0) return "available";
  return currentStudents >= capacity ? "full" : "available";
}

function fillPercent(current, capacity) {
  if (!capacity || capacity <= 0) return 0;
  return Math.min(100, Math.round((current / capacity) * 10000) / 100);
}

function toZoneDTO(areaDoc, stats) {
  const a = areaDoc.toObject ? areaDoc.toObject() : { ...areaDoc };
  const agg = stats.get(String(a._id)) || { actualRooms: 0, currentStudents: 0, sumRoomCapacity: 0 };
  const capacity = effectivePlannedCapacity(a, agg.sumRoomCapacity, agg.actualRooms);
  const plannedRoomsDisplay = effectivePlannedRooms(a, agg.actualRooms);
  const status = computeZoneStatus(agg.currentStudents, capacity);
  return {
    ...a,
    genderPolicy: normalizeGenderPolicy(a.genderPolicy),
    actualTotalRooms: agg.actualRooms,
    /** Hiển thị cột “Tổng phòng”: ưu tiên số phòng thực tế; kèm quy hoạch */
    totalRooms: agg.actualRooms,
    plannedTotalRooms: a.plannedTotalRooms,
    plannedRoomsDisplay,
    currentStudents: agg.currentStudents,
    plannedCapacity: a.plannedCapacity,
    effectiveCapacity: capacity,
    zoneStatus: status,
    fillPercent: fillPercent(agg.currentStudents, capacity),
  };
}

exports.list = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const search = String(req.query.search || "").trim();
    const statusFilter = String(req.query.status || "").trim().toLowerCase();
    const sortBy = String(req.query.sortBy || "name").trim();
    const sortOrder = String(req.query.sortOrder || "asc").toLowerCase() === "desc" ? -1 : 1;

    const filter = { ...notDeleted };
    if (search) filter.name = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

    let areas = await Area.find(filter).populate("manager", "fullName email").lean();
    const stats = await loadRoomStatsForAreas(areas);

    let enriched = areas.map((a) => {
      const dto = toZoneDTO(a, stats);
      return dto;
    });

    if (statusFilter === "available" || statusFilter === "full") {
      enriched = enriched.filter((z) => z.zoneStatus === statusFilter);
    }

    enriched.sort((a, b) => {
      if (sortBy === "totalRooms") {
        const d = (a.totalRooms || 0) - (b.totalRooms || 0);
        return d * sortOrder;
      }
      const an = String(a.name || "").toLowerCase();
      const bn = String(b.name || "").toLowerCase();
      if (an < bn) return -1 * sortOrder;
      if (an > bn) return 1 * sortOrder;
      return 0;
    });

    const total = enriched.length;
    const slice = enriched.slice((page - 1) * limit, (page - 1) * limit + limit);

    const allForDash = await Area.find(notDeleted).lean();
    const allStats = await loadRoomStatsForAreas(allForDash);
    let sumZones = 0;
    let sumRooms = 0;
    let sumStudents = 0;
    for (const a of allForDash) {
      sumZones += 1;
      const s = allStats.get(String(a._id));
      if (s) {
        sumRooms += s.actualRooms;
        sumStudents += s.currentStudents;
      }
    }

    res.json({
      zones: slice,
      total,
      page,
      limit,
      dashboard: {
        totalZones: sumZones,
        totalRooms: sumRooms,
        totalStudents: sumStudents,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const area = await Area.findOne({ _id: req.params.id, ...notDeleted }).populate("manager", "fullName email");
    if (!area) return res.status(404).json({ message: "Không tìm thấy khu" });

    const stats = await loadRoomStatsForAreas([area]);
    const zone = toZoneDTO(area, stats);

    const rooms = await Room.find({ area: area._id })
      .select("roomNumber floor capacity currentOccupancy price status")
      .sort({ floor: 1, roomNumber: 1 })
      .lean();

    res.json({
      zone,
      rooms,
      summary: {
        currentStudents: zone.currentStudents,
        effectiveCapacity: zone.effectiveCapacity,
        fillPercent: zone.fillPercent,
        zoneStatus: zone.zoneStatus,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getResidents = async (req, res) => {
  try {
    const area = await Area.findOne({ _id: req.params.id, ...notDeleted }).select("_id name").lean();
    if (!area) return res.status(404).json({ message: "Không tìm thấy khu" });

    const rooms = await Room.find({ area: area._id }).select("_id roomNumber floor").sort({ floor: 1, roomNumber: 1 }).lean();
    const roomIds = rooms.map((r) => r._id);
    if (!roomIds.length) {
      return res.json({ zone: area, residents: [], totalResidents: 0 });
    }

    const contracts = await Contract.find({
      room: { $in: roomIds },
      status: { $in: ["active", "pending_payment"] },
    })
      .populate("user", "fullName studentId email phone gender major enrollmentDate")
      .populate("room", "roomNumber floor area")
      .populate("bed", "code status")
      .sort({ createdAt: 1 })
      .lean();

    const now = new Date();
    const residents = contracts
      .filter((c) => c.user && c.room && contractHoldsRoomSlot(c, now))
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
      }))
      .sort((a, b) => {
        const ar = String((a.room && typeof a.room === "object" ? a.room.roomNumber : "") || "");
        const br = String((b.room && typeof b.room === "object" ? b.room.roomNumber : "") || "");
        if (ar < br) return -1;
        if (ar > br) return 1;
        return 0;
      });

    res.json({ zone: area, residents, totalResidents: residents.length });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

function parseOptionalNonNegInt(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

exports.create = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, description, plannedTotalRooms, plannedCapacity, genderPolicy, manager } = req.body;
    const trimmedName = String(name || "").trim();
    const exists = await Area.findOne({ name: trimmedName, ...notDeleted });
    if (exists) return res.status(400).json({ message: "Tên khu đã tồn tại" });

    const area = await Area.create({
      name: trimmedName,
      description: description != null ? String(description) : "",
      plannedTotalRooms: parseOptionalNonNegInt(plannedTotalRooms),
      plannedCapacity: parseOptionalNonNegInt(plannedCapacity),
      genderPolicy: normalizeGenderPolicy(genderPolicy || "mixed"),
      manager: manager || null,
    });

    const stats = await loadRoomStatsForAreas([area]);
    res.status(201).json(toZoneDTO(area, stats));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.update = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const existing = await Area.findOne({ _id: req.params.id, ...notDeleted });
    if (!existing) return res.status(404).json({ message: "Không tìm thấy khu" });

    if (req.body.name !== undefined) {
      const trimmed = String(req.body.name || "").trim();
      if (!trimmed) return res.status(400).json({ message: "Tên khu không được để trống" });
      const dup = await Area.findOne({ name: trimmed, _id: { $ne: existing._id }, ...notDeleted });
      if (dup) return res.status(400).json({ message: "Tên khu đã tồn tại" });
      existing.name = trimmed;
    }
    if (req.body.description !== undefined) existing.description = String(req.body.description ?? "");
    if (req.body.plannedTotalRooms !== undefined) {
      existing.plannedTotalRooms = parseOptionalNonNegInt(req.body.plannedTotalRooms);
    }
    if (req.body.plannedCapacity !== undefined) {
      existing.plannedCapacity = parseOptionalNonNegInt(req.body.plannedCapacity);
    }
    if (req.body.genderPolicy !== undefined) existing.genderPolicy = normalizeGenderPolicy(req.body.genderPolicy);
    if (req.body.manager !== undefined) existing.manager = req.body.manager || null;
    if (req.body.isActive !== undefined) existing.isActive = !!req.body.isActive;

    await existing.save();
    const stats = await loadRoomStatsForAreas([existing]);
    res.json(toZoneDTO(existing, stats));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const area = await Area.findOne({ _id: req.params.id, ...notDeleted });
    if (!area) return res.status(404).json({ message: "Không tìm thấy khu" });

    const rooms = await Room.find({ area: area._id }).select("currentOccupancy").lean();
    const totalStudents = rooms.reduce((s, r) => s + (Number(r.currentOccupancy) || 0), 0);
    if (totalStudents > 0) {
      return res.status(400).json({ message: "Không thể xóa khu đang có sinh viên ở" });
    }

    await Area.findByIdAndUpdate(area._id, { isDeleted: true, isActive: false });
    res.json({ message: "Đã xóa khu (xóa mềm)" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
