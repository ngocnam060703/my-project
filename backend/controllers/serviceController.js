const mongoose = require("mongoose");
const Service = require("../models/Service");
const ServiceRegistration = require("../models/ServiceRegistration");
const Contract = require("../models/Contract");

function isAdmin(user) {
  return user?.role === "admin" || user?.role === "manager";
}

exports.getServices = async (req, res) => {
  try {
    const { type, activeOnly = "false" } = req.query;
    const filter = {};
    if (type) filter.type = String(type);
    if (activeOnly === "true") filter.isActive = true;
    const services = await Service.find(filter).sort({ type: 1, name: 1 });
    res.json(services);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createService = async (req, res) => {
  try {
    if (!isAdmin(req.user)) return res.status(403).json({ message: "Không có quyền" });
    const { name, type, price, unit, description, isActive } = req.body;
    if (!name || !type || price == null || !unit) {
      return res.status(400).json({ message: "Thiếu name, type, price hoặc unit" });
    }
    const doc = await Service.create({
      name: String(name).trim(),
      type,
      price: Number(price),
      unit,
      description: description ? String(description) : "",
      isActive: isActive !== undefined ? !!isActive : true,
    });
    res.status(201).json(doc);
  } catch (error) {
    if (error?.code === 11000) return res.status(400).json({ message: "Dịch vụ đã tồn tại" });
    res.status(500).json({ message: error.message });
  }
};

exports.updateService = async (req, res) => {
  try {
    if (!isAdmin(req.user)) return res.status(403).json({ message: "Không có quyền" });
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: "ID không hợp lệ" });
    const data = {};
    ["name", "type", "unit", "description", "isActive"].forEach((k) => {
      if (req.body[k] !== undefined) data[k] = req.body[k];
    });
    if (req.body.price !== undefined) data.price = Number(req.body.price);
    const doc = await Service.findByIdAndUpdate(id, data, { new: true, runValidators: true });
    if (!doc) return res.status(404).json({ message: "Không tìm thấy dịch vụ" });
    res.json(doc);
  } catch (error) {
    if (error?.code === 11000) return res.status(400).json({ message: "Dịch vụ đã tồn tại" });
    res.status(500).json({ message: error.message });
  }
};

exports.toggleService = async (req, res) => {
  try {
    if (!isAdmin(req.user)) return res.status(403).json({ message: "Không có quyền" });
    const { id } = req.params;
    const doc = await Service.findById(id);
    if (!doc) return res.status(404).json({ message: "Không tìm thấy dịch vụ" });
    doc.isActive = !doc.isActive;
    await doc.save();
    res.json(doc);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getMyServiceRegistrations = async (req, res) => {
  try {
    const month = req.query.month != null ? Number(req.query.month) : null;
    const year = req.query.year != null ? Number(req.query.year) : null;
    const filter = { user: req.user._id };
    if (month != null && year != null) {
      filter.month = month;
      filter.year = year;
    }
    const items = await ServiceRegistration.find(filter)
      .populate("service")
      .sort({ year: -1, month: -1, createdAt: -1 });
    res.json(items);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.upsertMyServiceRegistration = async (req, res) => {
  try {
    if (req.user.role !== "user") return res.status(403).json({ message: "Chỉ sinh viên mới dùng được" });
    const { serviceId, month, year, quantity, enabled } = req.body;
    if (!mongoose.isValidObjectId(String(serviceId || ""))) {
      return res.status(400).json({ message: "serviceId không hợp lệ" });
    }
    const svc = await Service.findById(serviceId);
    if (!svc || svc.type !== "personal") {
      return res.status(400).json({ message: "Chỉ đăng ký được dịch vụ cá nhân" });
    }
    if (!svc.isActive) {
      return res.status(400).json({ message: "Dịch vụ đang ngừng hoạt động" });
    }

    const m = Number(month);
    const y = Number(year);
    if (!(m >= 1 && m <= 12) || y < 2000) {
      return res.status(400).json({ message: "Tháng/năm không hợp lệ" });
    }

    const member = await Contract.findOne({
      user: req.user._id,
      status: { $in: ["active", "pending_payment"] },
    });
    if (!member) return res.status(403).json({ message: "Bạn chưa là thành viên KTX" });

    const q = Math.max(0, Number(quantity ?? 1));
    const doc = await ServiceRegistration.findOneAndUpdate(
      { user: req.user._id, service: serviceId, month: m, year: y },
      {
        user: req.user._id,
        service: serviceId,
        month: m,
        year: y,
        quantity: svc.unit === "once" ? q : 1,
        enabled: svc.unit === "monthly" ? enabled !== false : q > 0,
      },
      { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
    ).populate("service");

    res.json(doc);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
