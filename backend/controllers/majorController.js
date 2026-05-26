const Major = require("../models/Major");
const Contract = require("../models/Contract");
const { contractIsEffectiveResident } = require("../services/roomOccupancySync");

function escRx(s) {
  return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toStartOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function normMajorKey(s) {
  return String(s || "").trim().toLowerCase();
}

/** Đếm SV đang ở KTX theo HĐ active đang hiệu lực — gom theo user.major (cột Ngành hồ sơ SV). */
async function countResidentsByMajorName() {
  const now = new Date();
  const todayStart = toStartOfDay(now);
  const contracts = await Contract.find({
    status: "active",
    endDate: { $gte: todayStart },
  })
    .populate("user", "major role isDeleted")
    .select("user startDate endDate status")
    .lean();

  const usersByMajor = new Map();
  for (const c of contracts) {
    if (!contractIsEffectiveResident(c, now)) continue;
    const u = c.user;
    if (!u || u.isDeleted) continue;
    const role = String(u.role || "");
    if (role !== "user" && role !== "student") continue;
    const majorRaw = String(u.major || "").trim();
    if (!majorRaw) continue;
    const key = normMajorKey(majorRaw);
    if (!usersByMajor.has(key)) usersByMajor.set(key, new Set());
    usersByMajor.get(key).add(String(u._id || c.user));
  }

  const map = Object.create(null);
  for (const [key, set] of usersByMajor) {
    map[key] = set.size;
  }
  return map;
}

function residentsForMajorRow(m, counts) {
  const facultyKey = normMajorKey(m.faculty);
  const nameKey = normMajorKey(m.name);
  if (facultyKey && counts[facultyKey] != null) return counts[facultyKey];
  if (nameKey && counts[nameKey] != null) return counts[nameKey];
  return 0;
}

exports.list = async (req, res) => {
  try {
    const { q, faculty, active } = req.query || {};
    const filter = {};
    if (typeof active !== "undefined") {
      const v = String(active);
      if (v === "1" || v === "true") filter.isActive = true;
      if (v === "0" || v === "false") filter.isActive = false;
    }
    if (faculty && String(faculty).trim()) filter.faculty = String(faculty).trim();
    if (q && String(q).trim()) {
      const k = escRx(String(q).trim());
      filter.$or = [{ name: new RegExp(k, "i") }, { code: new RegExp(k, "i") }, { faculty: new RegExp(k, "i") }];
    }
    const items = await Major.find(filter).sort({ code: 1, name: 1 }).lean();
    const counts = await countResidentsByMajorName();
    const enriched = items.map((m) => ({
      ...m,
      residentsInDorm: residentsForMajorRow(m, counts),
    }));
    res.json({ items: enriched, total: enriched.length });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.create = async (req, res) => {
  try {
    const code = String(req.body?.code || "").trim().toUpperCase();
    const name = String(req.body?.name || "").trim();
    const faculty = String(req.body?.faculty || "").trim();
    if (!code) return res.status(400).json({ message: "Thiếu mã ngành" });
    if (!name) return res.status(400).json({ message: "Thiếu tên ngành" });
    const created = await Major.create({ code, name, faculty, isActive: true });
    res.status(201).json(created);
  } catch (e) {
    const msg = String(e?.code) === "11000" ? "Mã ngành đã tồn tại" : e.message;
    res.status(400).json({ message: msg });
  }
};

exports.update = async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const patch = {};
    if (typeof req.body?.code !== "undefined") patch.code = String(req.body.code || "").trim().toUpperCase();
    if (typeof req.body?.name !== "undefined") patch.name = String(req.body.name || "").trim();
    if (typeof req.body?.faculty !== "undefined") patch.faculty = String(req.body.faculty || "").trim();
    if (typeof req.body?.isActive !== "undefined") patch.isActive = !!req.body.isActive;
    if (Object.prototype.hasOwnProperty.call(patch, "code") && patch.code === "") {
      return res.status(400).json({ message: "Mã ngành không được để trống" });
    }
    if (Object.prototype.hasOwnProperty.call(patch, "name") && patch.name === "") {
      return res.status(400).json({ message: "Tên ngành không được để trống" });
    }
    const updated = await Major.findByIdAndUpdate(id, patch, { new: true, runValidators: true });
    if (!updated) return res.status(404).json({ message: "Không tìm thấy ngành" });
    res.json(updated);
  } catch (e) {
    const msg = String(e?.code) === "11000" ? "Mã ngành đã tồn tại" : e.message;
    res.status(400).json({ message: msg });
  }
};

exports.remove = async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const removed = await Major.findByIdAndDelete(id);
    if (!removed) return res.status(404).json({ message: "Không tìm thấy ngành" });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};
