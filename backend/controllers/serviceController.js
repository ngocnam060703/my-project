const mongoose = require("mongoose");
const Service = require("../models/Service");
const ServiceRegistration = require("../models/ServiceRegistration");
const LaundryUsage = require("../models/LaundryUsage");
const RoomService = require("../models/RoomService");
const ServiceUsage = require("../models/ServiceUsage");
const Contract = require("../models/Contract");
const {
  getStudentServicePeriodLockStatus,
  assertStudentServicePeriodEditable,
} = require("../services/serviceRegistrationLockService");
const { loadMeterServicesAssignedToRoom } = require("../services/roomUtilityBilling");

function isAdmin(user) {
  return user?.role === "admin" || user?.role === "manager";
}

/** Sinh viên: role "user" hoặc "student" (tương thích requireRole). */
function isStudentUser(user) {
  const role = String(user?.role || "");
  return role === "user" || role === "student";
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseMonthYear(month, year) {
  const m = Number(month);
  const y = Number(year);
  if (!(m >= 1 && m <= 12) || y < 2000) return null;
  return { month: m, year: y };
}

function sanitizeHybridConfig(input) {
  const billingModel = input?.billingModel === "hybrid" ? "hybrid" : "single";
  const monthlyPackagePrice = Math.max(0, Number(input?.monthlyPackagePrice || 0));
  const includedUsesPerMonth = Math.max(0, Number(input?.includedUsesPerMonth || 0));
  return { billingModel, monthlyPackagePrice, includedUsesPerMonth };
}

/** Tên dịch vụ không trùng (không phân biệt hoa thường), toàn hệ thống. */
async function assertUniqueServiceName(trimmedName, excludeId) {
  const rx = new RegExp(`^${escapeRegex(trimmedName)}$`, "i");
  const q = { name: rx };
  if (excludeId && mongoose.isValidObjectId(String(excludeId))) {
    q._id = { $ne: excludeId };
  }
  const exists = await Service.findOne(q).select("_id");
  if (exists) {
    const err = new Error("DUPLICATE_NAME");
    throw err;
  }
}

exports.getServices = async (req, res) => {
  try {
    const { type, activeOnly = "false" } = req.query;
    const filter = {};
    if (type) filter.type = String(type);
    if (activeOnly === "true") filter.isActive = true;
    /** Dịch vụ điện/nước (kWh/m³) luôn coi là theo chỉ số — sửa dữ liệu cũ lưu nhầm fixed. */
    await Service.updateMany(
      { measureUnit: { $in: ["kwh", "m3"] }, tariffType: { $ne: "variable" } },
      { $set: { tariffType: "variable" } }
    );
    const services = await Service.find(filter).sort({ type: 1, name: 1 });
    res.json(services);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createService = async (req, res) => {
  try {
    if (!isAdmin(req.user)) return res.status(403).json({ message: "Không có quyền" });
    const { name, type, price, unit, measureUnit, tariffType, description, isActive } = req.body;
    if (!name || !type || price == null || !unit) {
      return res.status(400).json({ message: "Thiếu name, type, price hoặc unit" });
    }
    const p = Number(price);
    if (!(p > 0)) return res.status(400).json({ message: "Đơn giá phải lớn hơn 0" });
    const n = String(name).trim();
    await assertUniqueServiceName(n);
    const mu = measureUnit === "kwh" || measureUnit === "m3" || measureUnit === "month" ? measureUnit : "month";
    const tt = mu === "kwh" || mu === "m3" ? "variable" : tariffType === "variable" ? "variable" : "fixed";
    const hybridCfg = sanitizeHybridConfig(req.body);
    if (hybridCfg.billingModel === "hybrid") {
      if (type !== "personal") {
        return res.status(400).json({ message: "billingModel=hybrid chỉ áp dụng cho dịch vụ cá nhân" });
      }
      if (unit !== "once") {
        return res.status(400).json({ message: "Dịch vụ hybrid phải dùng unit=once (đơn giá/lượt)" });
      }
      if (!(hybridCfg.monthlyPackagePrice > 0)) {
        return res.status(400).json({ message: "monthlyPackagePrice phải lớn hơn 0 cho dịch vụ hybrid" });
      }
      if (!(hybridCfg.includedUsesPerMonth > 0)) {
        return res.status(400).json({ message: "includedUsesPerMonth phải lớn hơn 0 cho dịch vụ hybrid" });
      }
    }
    const doc = await Service.create({
      name: n,
      type,
      price: p,
      unit,
      measureUnit: mu,
      tariffType: tt,
      billingModel: hybridCfg.billingModel,
      monthlyPackagePrice: hybridCfg.monthlyPackagePrice,
      includedUsesPerMonth: hybridCfg.includedUsesPerMonth,
      description: description ? String(description) : "",
      isActive: isActive !== undefined ? !!isActive : true,
    });
    res.status(201).json(doc);
  } catch (error) {
    if (error?.message === "DUPLICATE_NAME") return res.status(400).json({ message: "Tên dịch vụ đã tồn tại" });
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
    if (req.body.name !== undefined) {
      const nm = String(req.body.name).trim();
      await assertUniqueServiceName(nm, id);
      data.name = nm;
    }
    ["type", "unit", "description", "isActive", "measureUnit", "tariffType"].forEach((k) => {
      if (req.body[k] !== undefined) data[k] = req.body[k];
    });
    if (req.body.price !== undefined) {
      const p = Number(req.body.price);
      if (!(p > 0)) return res.status(400).json({ message: "Đơn giá phải lớn hơn 0" });
      data.price = p;
    }
    ["billingModel", "monthlyPackagePrice", "includedUsesPerMonth"].forEach((k) => {
      if (req.body[k] !== undefined) data[k] = req.body[k];
    });
    const current = await Service.findById(id);
    if (!current) return res.status(404).json({ message: "Không tìm thấy dịch vụ" });
    const mergedMeasure = data.measureUnit ?? current.measureUnit;
    if (mergedMeasure === "kwh" || mergedMeasure === "m3") {
      data.tariffType = "variable";
    }
    const merged = {
      type: data.type ?? current.type,
      unit: data.unit ?? current.unit,
      billingModel: data.billingModel ?? current.billingModel ?? "single",
      monthlyPackagePrice: data.monthlyPackagePrice ?? current.monthlyPackagePrice ?? 0,
      includedUsesPerMonth: data.includedUsesPerMonth ?? current.includedUsesPerMonth ?? 0,
    };
    if (merged.billingModel === "hybrid") {
      if (merged.type !== "personal") {
        return res.status(400).json({ message: "billingModel=hybrid chỉ áp dụng cho dịch vụ cá nhân" });
      }
      if (merged.unit !== "once") {
        return res.status(400).json({ message: "Dịch vụ hybrid phải dùng unit=once (đơn giá/lượt)" });
      }
      if (!(Number(merged.monthlyPackagePrice) > 0)) {
        return res.status(400).json({ message: "monthlyPackagePrice phải lớn hơn 0 cho dịch vụ hybrid" });
      }
      if (!(Number(merged.includedUsesPerMonth) > 0)) {
        return res.status(400).json({ message: "includedUsesPerMonth phải lớn hơn 0 cho dịch vụ hybrid" });
      }
    }
    const doc = await Service.findByIdAndUpdate(id, data, { returnDocument: 'after', runValidators: true });
    if (!doc) return res.status(404).json({ message: "Không tìm thấy dịch vụ" });
    res.json(doc);
  } catch (error) {
    if (error?.message === "DUPLICATE_NAME") return res.status(400).json({ message: "Tên dịch vụ đã tồn tại" });
    if (error?.code === 11000) return res.status(400).json({ message: "Dịch vụ đã tồn tại" });
    res.status(500).json({ message: error.message });
  }
};

/** PATCH — cùng logic PUT cập nhật. */
exports.patchService = exports.updateService;

exports.deleteService = async (req, res) => {
  try {
    if (!isAdmin(req.user)) return res.status(403).json({ message: "Không có quyền" });
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: "ID không hợp lệ" });
    const [rs, su, reg] = await Promise.all([
      RoomService.countDocuments({ service: id }),
      ServiceUsage.countDocuments({ service: id }),
      ServiceRegistration.countDocuments({ service: id }),
    ]);
    if (rs + su + reg > 0) {
      return res.status(400).json({
        message: "Không xóa được: còn gán phòng, chỉ số hoặc đăng ký sinh viên liên quan. Hãy tắt dịch vụ (inactive) thay thế.",
      });
    }
    const doc = await Service.findByIdAndDelete(id);
    if (!doc) return res.status(404).json({ message: "Không tìm thấy dịch vụ" });
    res.json({ message: "Đã xóa" });
  } catch (error) {
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

/** SV: dịch vụ điện/nước đã gán cho phòng đang ở (để đăng ký sử dụng). */
exports.getMyRoomMeterServices = async (req, res) => {
  try {
    if (!isStudentUser(req.user)) return res.status(403).json({ message: "Chỉ sinh viên mới dùng được" });
    const member = await Contract.findOne({
      user: req.user._id,
      status: { $in: ["active", "pending_payment"] },
    }).select("room");
    if (!member?.room) {
      return res.json({ roomId: null, serviceIds: [] });
    }
    const meters = await loadMeterServicesAssignedToRoom(member.room);
    const serviceIds = [meters.electricity?._id, meters.water?._id].filter(Boolean).map(String);
    res.json({ roomId: String(member.room), serviceIds });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getPeriodLockStatus = async (req, res) => {
  try {
    if (!isStudentUser(req.user)) return res.status(403).json({ message: "Chỉ sinh viên mới dùng được" });
    const parsed = parseMonthYear(req.query.month, req.query.year);
    if (!parsed) return res.status(400).json({ message: "Tháng/năm không hợp lệ" });
    const status = await getStudentServicePeriodLockStatus(req.user._id, parsed.month, parsed.year);
    res.json(status);
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

    let periodLock = null;
    if (month != null && year != null) {
      const parsed = parseMonthYear(month, year);
      if (parsed) {
        periodLock = await getStudentServicePeriodLockStatus(req.user._id, parsed.month, parsed.year);
      }
    }
    res.json({ items, periodLock });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.upsertMyServiceRegistration = async (req, res) => {
  try {
    if (!isStudentUser(req.user)) return res.status(403).json({ message: "Chỉ sinh viên mới dùng được" });
    const { serviceId, month, year, quantity, enabled, planType } = req.body;
    if (!mongoose.isValidObjectId(String(serviceId || ""))) {
      return res.status(400).json({ message: "serviceId không hợp lệ" });
    }
    const svc = await Service.findById(serviceId);
    if (!svc) return res.status(404).json({ message: "Không tìm thấy dịch vụ" });
    const isMeterUtility = svc.measureUnit === "kwh" || svc.measureUnit === "m3";
    if (svc.type !== "personal" && !isMeterUtility) {
      return res.status(400).json({ message: "Chỉ đăng ký được dịch vụ cá nhân hoặc điện/nước theo phòng" });
    }
    if (!svc.isActive) {
      return res.status(400).json({ message: "Dịch vụ đang ngừng hoạt động" });
    }

    const parsed = parseMonthYear(month, year);
    if (!parsed) {
      return res.status(400).json({ message: "Tháng/năm không hợp lệ" });
    }
    const m = parsed.month;
    const y = parsed.year;

    await assertStudentServicePeriodEditable(req.user._id, m, y);

    const member = await Contract.findOne({
      user: req.user._id,
      status: { $in: ["active", "pending_payment"] },
    });
    if (!member) return res.status(403).json({ message: "Bạn chưa là thành viên KTX" });

    if (isMeterUtility) {
      const assigned = await RoomService.findOne({
        room: member.room,
        service: serviceId,
        isActive: { $ne: false },
      }).lean();
      if (!assigned) {
        return res.status(400).json({
          message: "Phòng của bạn chưa được gán dịch vụ điện/nước này — liên hệ quản lý KTX",
        });
      }
    }

    const q = Math.max(0, Number(quantity ?? 1));
    const pType = planType === "monthly_package" ? "monthly_package" : "per_use";
    if (svc.billingModel === "hybrid" && pType === "monthly_package") {
      if (!(Number(svc.monthlyPackagePrice || 0) > 0) || !(Number(svc.includedUsesPerMonth || 0) > 0)) {
        return res.status(400).json({ message: "Dịch vụ chưa cấu hình gói tháng hợp lệ" });
      }
    }
    const doc = await ServiceRegistration.findOneAndUpdate(
      { user: req.user._id, service: serviceId, month: m, year: y },
      {
        user: req.user._id,
        service: serviceId,
        month: m,
        year: y,
        quantity: svc.billingModel === "hybrid" ? 0 : svc.unit === "once" ? q : 1,
        planType: svc.billingModel === "hybrid" ? pType : "per_use",
        packagePriceSnapshot:
          svc.billingModel === "hybrid" && pType === "monthly_package" ? Number(svc.monthlyPackagePrice || 0) : 0,
        includedUsesSnapshot:
          svc.billingModel === "hybrid" && pType === "monthly_package" ? Number(svc.includedUsesPerMonth || 0) : 0,
        overageUnitPriceSnapshot:
          svc.billingModel === "hybrid" && pType === "monthly_package" ? Number(svc.price || 0) : 0,
        enabled: svc.billingModel === "hybrid" ? enabled !== false : svc.unit === "monthly" ? enabled !== false : q > 0,
      },
      { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true, runValidators: true }
    ).populate("service");

    res.json(doc);
  } catch (error) {
    if (error?.statusCode === 409) return res.status(409).json({ message: error.message, code: error.code });
    res.status(500).json({ message: error.message });
  }
};

exports.recordMyLaundryUse = async (req, res) => {
  try {
    if (!isStudentUser(req.user)) return res.status(403).json({ message: "Chỉ sinh viên mới dùng được" });
    const { serviceId, month, year, quantity = 1, note = "" } = req.body;
    if (!mongoose.isValidObjectId(String(serviceId || ""))) {
      return res.status(400).json({ message: "serviceId không hợp lệ" });
    }
    const parsed = parseMonthYear(month, year);
    if (!parsed) return res.status(400).json({ message: "Tháng/năm không hợp lệ" });
    await assertStudentServicePeriodEditable(req.user._id, parsed.month, parsed.year);
    const q = Math.max(1, Math.floor(Number(quantity) || 1));

    const svc = await Service.findById(serviceId);
    if (!svc || svc.type !== "personal" || svc.billingModel !== "hybrid") {
      return res.status(400).json({ message: "Chỉ hỗ trợ ghi nhận lượt cho dịch vụ hybrid cá nhân" });
    }
    if (!svc.isActive) return res.status(400).json({ message: "Dịch vụ đang ngừng hoạt động" });

    const member = await Contract.findOne({
      user: req.user._id,
      status: { $in: ["active", "pending_payment"] },
    });
    if (!member) return res.status(403).json({ message: "Bạn chưa là thành viên KTX" });

    const reg = await ServiceRegistration.findOne({
      user: req.user._id,
      service: serviceId,
      month: parsed.month,
      year: parsed.year,
      enabled: true,
    });
    if (!reg) {
      return res.status(400).json({ message: "Bạn chưa đăng ký dịch vụ cho tháng này" });
    }

    await LaundryUsage.create({
      user: req.user._id,
      service: serviceId,
      month: parsed.month,
      year: parsed.year,
      quantity: q,
      note: String(note || ""),
    });
    const agg = await LaundryUsage.aggregate([
      { $match: { user: req.user._id, service: svc._id, month: parsed.month, year: parsed.year } },
      { $group: { _id: null, total: { $sum: "$quantity" } } },
    ]);
    const usedCount = Number(agg[0]?.total || 0);
    const includedUses = reg.planType === "monthly_package" ? Number(reg.includedUsesSnapshot || svc.includedUsesPerMonth || 0) : 0;

    return res.status(201).json({
      message: "Đã ghi nhận lượt sử dụng",
      planType: reg.planType,
      usedCount,
      includedUses,
      remainingUses: Math.max(0, includedUses - usedCount),
    });
  } catch (error) {
    if (error?.statusCode === 409) return res.status(409).json({ message: error.message, code: error.code });
    res.status(500).json({ message: error.message });
  }
};

exports.getMyLaundryUsageSummary = async (req, res) => {
  try {
    if (!isStudentUser(req.user)) return res.status(403).json({ message: "Chỉ sinh viên mới dùng được" });
    const { serviceId, month, year } = req.query;
    if (!mongoose.isValidObjectId(String(serviceId || ""))) {
      return res.status(400).json({ message: "serviceId không hợp lệ" });
    }
    const parsed = parseMonthYear(month, year);
    if (!parsed) return res.status(400).json({ message: "Tháng/năm không hợp lệ" });

    const [svc, reg] = await Promise.all([
      Service.findById(serviceId),
      ServiceRegistration.findOne({
        user: req.user._id,
        service: serviceId,
        month: parsed.month,
        year: parsed.year,
      }),
    ]);
    if (!svc || svc.type !== "personal" || svc.billingModel !== "hybrid") {
      return res.status(400).json({ message: "Dịch vụ không thuộc mô hình hybrid cá nhân" });
    }

    const agg = await LaundryUsage.aggregate([
      { $match: { user: req.user._id, service: svc._id, month: parsed.month, year: parsed.year } },
      { $group: { _id: null, total: { $sum: "$quantity" } } },
    ]);
    const usedCount = Number(agg[0]?.total || 0);
    const currentPlanType = reg?.planType || "per_use";
    const includedUses =
      currentPlanType === "monthly_package" ? Number(reg?.includedUsesSnapshot || svc.includedUsesPerMonth || 0) : 0;
    const monthlyPackagePrice =
      currentPlanType === "monthly_package" ? Number(reg?.packagePriceSnapshot || svc.monthlyPackagePrice || 0) : 0;
    const perUsePrice = Number(svc.price || 0);
    const overageCount = currentPlanType === "monthly_package" ? Math.max(0, usedCount - includedUses) : 0;
    const estimatedAmount =
      currentPlanType === "monthly_package" ? monthlyPackagePrice + overageCount * perUsePrice : usedCount * perUsePrice;

    res.json({
      serviceId: String(svc._id),
      month: parsed.month,
      year: parsed.year,
      enabled: reg?.enabled !== false,
      planType: currentPlanType,
      usedCount,
      includedUses,
      remainingUses: Math.max(0, includedUses - usedCount),
      overageCount,
      perUsePrice,
      monthlyPackagePrice,
      estimatedAmount,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
