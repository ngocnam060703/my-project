const mongoose = require("mongoose");

/**
 * Yêu cầu gia hạn hợp đồng KTX — sinh viên gửi (pending), admin duyệt / từ chối.
 * Khi duyệt: cập nhật endDate hợp đồng theo số tháng yêu cầu.
 */
const contractExtendRequestSchema = new mongoose.Schema(
  {
    contract: { type: mongoose.Schema.Types.ObjectId, ref: "Contract", required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    /** Số tháng gia hạn (1–36) */
    months: { type: Number, required: true, min: 1, max: 36 },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },
    /** Ngày kết thúc hợp đồng tại thời điểm gửi (minh bạch lịch sử) */
    snapshotEndDate: { type: Date, required: true },
    /** Ngày kết thúc sau khi admin duyệt (ghi nhận) */
    appliedEndDate: { type: Date, default: null },
    note: { type: String, default: "" },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

/** Mỗi hợp đồng chỉ một yêu cầu gia hạn đang pending */
contractExtendRequestSchema.index(
  { contract: 1 },
  { unique: true, partialFilterExpression: { status: "pending" }, name: "contract_extend_one_pending_per_contract" }
);

module.exports = mongoose.model("ContractExtendRequest", contractExtendRequestSchema);
