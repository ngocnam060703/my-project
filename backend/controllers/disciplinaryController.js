const mongoose = require("mongoose");
const Violation = require("../models/Violation");
const { resolveViolationDisciplinary } = require("../services/violationDisciplineService");

function isAdmin(user) {
  return user?.role === "admin" || user?.role === "manager";
}

/**
 * POST /disciplinary — ghi nhận xử lý kỷ luật (một vi phạm chỉ một lần).
 */
exports.resolveDisciplinary = async (req, res) => {
  try {
    if (!isAdmin(req.user)) return res.status(403).json({ message: "Không có quyền" });
    const { violationId, actionType, penaltyAmount, note } = req.body;

    const populated = await resolveViolationDisciplinary({
      violationId,
      reviewerId: req.user._id,
      actionType,
      penaltyAmount,
      note,
    });
    res.json(populated);
  } catch (e) {
    if (e?.code === 11000) {
      return res.status(400).json({ message: "Đã có hóa đơn gắn với vi phạm này" });
    }
    const code = e.statusCode || 500;
    res.status(code).json({ message: e.message });
  }
};

/**
 * GET /disciplinary/:violationId — admin hoặc chính sinh viên liên quan.
 */
exports.getDisciplinary = async (req, res) => {
  try {
    const { violationId } = req.params;
    if (!mongoose.isValidObjectId(String(violationId))) {
      return res.status(400).json({ message: "violationId không hợp lệ" });
    }
    const v = await Violation.findById(violationId)
      .populate("rule", "code name handlingAction")
      .populate("user", "fullName studentId email")
      .populate("room", "roomNumber area")
      .populate("room.area", "name")
      .populate("resolution.resolvedBy", "fullName");

    if (!v) return res.status(404).json({ message: "Không tìm thấy vi phạm" });

    if (!isAdmin(req.user)) {
      if (req.user.role !== "user" && req.user.role !== "student") {
        return res.status(403).json({ message: "Không có quyền xem" });
      }
      if (String(v.user?._id || v.user) !== String(req.user._id)) {
        return res.status(403).json({ message: "Không có quyền xem" });
      }
    }

    res.json({
      violationId: String(v._id),
      status: v.status || "pending",
      resolution: v.resolution || null,
      ruleName: v.ruleName,
      fineAmount: v.fineAmount,
      compensationAmount: v.compensationAmount,
      createdAt: v.createdAt,
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};
