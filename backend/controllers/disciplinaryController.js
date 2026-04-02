const mongoose = require("mongoose");
const Violation = require("../models/Violation");
const Contract = require("../models/Contract");
const Notification = require("../models/Notification");
const { createPenaltyBill, terminateContractDiscipline } = require("../services/violationActions");

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

    const v = await Violation.findById(violationId)
      .populate("user", "_id fullName")
      .populate("room", "_id");
    if (!v) return res.status(404).json({ message: "Không tìm thấy vi phạm" });

    const st = v.status || "pending";
    if (st === "resolved" || v.resolution) {
      return res.status(400).json({ message: "Vi phạm đã được xử lý, không thể xử lý lại" });
    }

    const now = new Date();
    const penalty = actionType === "fine" ? Math.round(Number(penaltyAmount)) : 0;

    v.status = "resolved";
    v.resolution = {
      actionType,
      penaltyAmount: penalty,
      note: String(note || "").slice(0, 2000),
      resolvedAt: now,
      resolvedBy: req.user._id,
    };

    let savedViaBill = false;
    if (actionType === "fine" && penalty > 0 && !v.bill && v.user) {
      const contract = await Contract.findOne({
        user: v.user._id || v.user,
        room: v.room._id || v.room,
        status: { $in: ["active", "pending_payment"] },
      });
      if (contract) {
        await createPenaltyBill({
          contractDoc: contract,
          violationDoc: v,
          userId: v.user._id || v.user,
          roomId: v.room._id || v.room,
          totalAmount: penalty,
          penaltyBreakdown: [{ label: "Phạt tiền (quyết định xử lý)", amount: penalty }],
          note: `Xử lý kỷ luật — ${String(note || "").slice(0, 200)}`,
        });
        savedViaBill = true;
      }
    }

    if (actionType === "expulsion" && v.user) {
      const contract = await Contract.findOne({
        user: v.user._id || v.user,
        room: v.room._id || v.room,
        status: { $in: ["active", "pending_payment"] },
      });
      if (contract) await terminateContractDiscipline(contract._id);
    }

    if (!savedViaBill) await v.save();

    const userId = v.user?._id || v.user;
    if (userId) {
      const labels = { warning: "Cảnh cáo / nhắc nhở chính thức", fine: "Phạt tiền", expulsion: "Buộc rời KTX / chấm dứt HĐ" };
      await Notification.create({
        user: userId,
        title: "Quyết định xử lý vi phạm",
        message: `Vi phạm "${v.ruleName}": ${labels[actionType] || actionType}.${penalty > 0 ? ` Số tiền: ${penalty.toLocaleString("vi-VN")}đ.` : ""}`,
        type: "discipline_resolved",
        link: "/student/my-violations",
      });
    }

    const populated = await Violation.findById(v._id)
      .populate("rule", "code name")
      .populate("user", "fullName studentId email")
      .populate("room", "roomNumber area")
      .populate("room.area", "name")
      .populate("resolution.resolvedBy", "fullName");
    res.json(populated);
  } catch (e) {
    if (e?.code === 11000) {
      return res.status(400).json({ message: "Đã có hóa đơn gắn với vi phạm này" });
    }
    res.status(500).json({ message: e.message });
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
      if (req.user.role !== "user" || String(v.user?._id || v.user) !== String(req.user._id)) {
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
