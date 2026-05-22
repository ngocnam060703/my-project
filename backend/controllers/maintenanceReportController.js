const mongoose = require("mongoose");
const maintenanceReportService = require("../services/maintenanceReportService");
const MaintenanceReport = require("../models/MaintenanceReport");

function handleServiceError(res, e) {
  const status = e.status || 500;
  res.status(status).json({ message: e.message || "Lỗi hệ thống" });
}

/** GET /api/my-reports */
exports.listMine = async (req, res) => {
  try {
    if (req.user.role !== "user") return res.status(403).json({ message: "Chỉ sinh viên" });
    const items = await maintenanceReportService.listMine(req.user._id);
    res.json(items);
  } catch (e) {
    handleServiceError(res, e);
  }
};

/** POST /api/reports */
exports.create = async (req, res) => {
  try {
    if (req.user.role !== "user") return res.status(403).json({ message: "Chỉ sinh viên được tạo khai báo" });
    const populated = await maintenanceReportService.createReport(req.user, req.body);
    res.status(201).json(populated);
  } catch (e) {
    handleServiceError(res, e);
  }
};

/** GET /api/reports/:id */
exports.getById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(String(id))) return res.status(400).json({ message: "id không hợp lệ" });
    const doc = await MaintenanceReport.findById(id)
      .populate("room", "roomNumber area")
      .populate("room.area", "name")
      .populate("user", "fullName studentId email phone")
      .populate("processedBy", "fullName")
      .populate("bill", "billCode total status billType");
    if (!doc) return res.status(404).json({ message: "Không tìm thấy khai báo" });

    const isStaff = req.user.role === "admin" || req.user.role === "manager";
    const isOwner = String(doc.user?._id || doc.user) === String(req.user._id);
    if (isStaff || (isOwner && req.user.role === "user")) return res.json(doc);
    return res.status(403).json({ message: "Không có quyền xem khai báo này" });
  } catch (e) {
    handleServiceError(res, e);
  }
};

/** DELETE /api/reports/:id — hủy (soft: status cancelled) */
exports.cancel = async (req, res) => {
  try {
    if (req.user.role !== "user") return res.status(403).json({ message: "Chỉ sinh viên" });
    const { id } = req.params;
    if (!mongoose.isValidObjectId(String(id))) return res.status(400).json({ message: "id không hợp lệ" });
    const result = await maintenanceReportService.cancelReport(req.user._id, id);
    res.json(result);
  } catch (e) {
    handleServiceError(res, e);
  }
};

/** GET /api/admin/maintenance-reports */
exports.adminList = async (req, res) => {
  try {
    if (!["admin", "manager"].includes(req.user.role)) return res.status(403).json({ message: "Không có quyền" });
    const data = await maintenanceReportService.adminList(req);
    res.json(data);
  } catch (e) {
    handleServiceError(res, e);
  }
};

/** PATCH /api/admin/maintenance-reports/:id */
exports.adminPatch = async (req, res) => {
  try {
    if (!["admin", "manager"].includes(req.user.role)) return res.status(403).json({ message: "Không có quyền" });
    const { id } = req.params;
    if (!mongoose.isValidObjectId(String(id))) return res.status(400).json({ message: "id không hợp lệ" });
    const out = await maintenanceReportService.adminPatch(req, id, req.body);
    res.json(out);
  } catch (e) {
    handleServiceError(res, e);
  }
};
