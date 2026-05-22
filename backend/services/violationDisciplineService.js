const Violation = require("../models/Violation");
const Contract = require("../models/Contract");
const { createPenaltyBill, terminateContractDiscipline } = require("./violationActions");
const { sendNotification } = require("./notificationService");

const RESOLUTION_LABELS = {
  warning: "Cảnh cáo / nhắc nhở chính thức",
  fine: "Phạt tiền",
  expulsion: "Buộc rời KTX / chấm dứt HĐ",
};

function normalizeAmount(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

/** Chuẩn hóa số tiền trả về API */
function normalizeViolationRecord(doc) {
  const o = doc && typeof doc.toObject === "function" ? doc.toObject() : { ...doc };
  o.fineAmount = normalizeAmount(o.fineAmount);
  o.compensationAmount = normalizeAmount(o.compensationAmount);
  o.totalRecordedAmount = o.fineAmount + o.compensationAmount;
  if (o.resolution?.penaltyAmount != null) {
    o.resolution.penaltyAmount = normalizeAmount(o.resolution.penaltyAmount);
  }
  return o;
}

async function populateViolation(violationId) {
  return Violation.findById(violationId)
    .populate("rule", "code name")
    .populate("user", "fullName studentId email")
    .populate("room", "roomNumber area")
    .populate("room.area", "name")
    .populate("resolution.resolvedBy", "fullName");
}

/**
 * Admin xử lý một vi phạm (warning | fine | expulsion).
 */
async function resolveViolationDisciplinary({ violationId, reviewerId, actionType, penaltyAmount, note }) {
  const v = await Violation.findById(violationId).populate("user", "_id fullName").populate("room", "_id");
  if (!v) {
    const err = new Error("Không tìm thấy vi phạm");
    err.statusCode = 404;
    throw err;
  }

  const st = v.status || "pending";
  if (st === "resolved" || v.resolution) {
    const err = new Error("Vi phạm đã được xử lý, không thể xử lý lại");
    err.statusCode = 400;
    throw err;
  }

  const now = new Date();
  const penalty = actionType === "fine" ? normalizeAmount(penaltyAmount) : 0;

  v.status = "resolved";
  v.resolution = {
    actionType,
    penaltyAmount: penalty,
    note: String(note || "").slice(0, 2000),
    resolvedAt: now,
    resolvedBy: reviewerId,
  };
  if (actionType === "fine" && penalty > 0) {
    v.fineAmount = penalty;
  }

  const roomId = v.room?._id || v.room;
  const userId = v.user?._id || v.user;

  if (actionType === "fine" && penalty > 0 && !v.bill && userId && roomId) {
    const contract = await Contract.findOne({
      user: userId,
      room: roomId,
      status: { $in: ["active", "pending_payment"] },
    });
    if (contract) {
      await createPenaltyBill({
        contractDoc: contract,
        violationDoc: v,
        userId,
        roomId,
        totalAmount: penalty,
        penaltyBreakdown: [{ label: "Phạt tiền (quyết định xử lý)", amount: penalty }],
        note: `Xử lý kỷ luật — ${String(note || "").slice(0, 200)}`,
      });
    } else {
      await v.save();
    }
  } else {
    await v.save();
  }

  if (actionType === "expulsion" && userId && roomId) {
    const contract = await Contract.findOne({
      user: userId,
      room: roomId,
      status: { $in: ["active", "pending_payment"] },
    });
    if (contract) await terminateContractDiscipline(contract._id);
  }

  if (userId) {
    await sendNotification({
      userId,
      title: "Quyết định xử lý vi phạm",
      message: `Vi phạm "${v.ruleName}": ${RESOLUTION_LABELS[actionType] || actionType}.${penalty > 0 ? ` Số tiền: ${penalty.toLocaleString("vi-VN")}đ.` : ""}`,
      type: "discipline_resolved",
      link: "/student/my-violations",
    });
  }

  const populated = await populateViolation(v._id);
  return normalizeViolationRecord(populated);
}

module.exports = {
  normalizeViolationRecord,
  normalizeAmount,
  resolveViolationDisciplinary,
  populateViolation,
};
