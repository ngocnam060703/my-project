const Major = require("../models/Major");

function escRx(s) {
  return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
      filter.name = new RegExp(escRx(String(q).trim()), "i");
    }
    const items = await Major.find(filter).sort({ faculty: 1, name: 1 }).lean();
    res.json({ items, total: items.length });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.create = async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    const faculty = String(req.body?.faculty || "").trim();
    if (!name) return res.status(400).json({ message: "Thiếu tên ngành" });
    const created = await Major.create({ name, faculty, isActive: true });
    res.status(201).json(created);
  } catch (e) {
    const msg = String(e?.code) === "11000" ? "Ngành đã tồn tại" : e.message;
    res.status(400).json({ message: msg });
  }
};

exports.update = async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const patch = {};
    if (typeof req.body?.name !== "undefined") patch.name = String(req.body.name || "").trim();
    if (typeof req.body?.faculty !== "undefined") patch.faculty = String(req.body.faculty || "").trim();
    if (typeof req.body?.isActive !== "undefined") patch.isActive = !!req.body.isActive;
    if (patch.name === "") return res.status(400).json({ message: "Tên ngành không được để trống" });
    const updated = await Major.findByIdAndUpdate(id, patch, { new: true, runValidators: true });
    if (!updated) return res.status(404).json({ message: "Không tìm thấy ngành" });
    res.json(updated);
  } catch (e) {
    const msg = String(e?.code) === "11000" ? "Ngành đã tồn tại" : e.message;
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

