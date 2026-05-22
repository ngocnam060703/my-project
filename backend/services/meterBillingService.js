const Bill = require("../models/Bill");
const ServiceUsage = require("../models/ServiceUsage");

const MONTHLY_BILL_FILTER = {
  $or: [{ billType: "monthly" }, { billType: { $exists: false } }, { billType: null }],
};

/** Hóa đơn tháng của phòng trong kỳ (không gồm phạt / bồi thường HH). */
async function findRoomPeriodBills(roomId, month, year) {
  return Bill.find({
    room: roomId,
    month: Number(month),
    year: Number(year),
    ...MONTHLY_BILL_FILTER,
  })
    .select("_id billCode status total user")
    .lean();
}

function derivePaymentStatus(bills) {
  if (!bills.length) return "none";
  if (bills.every((b) => b.status === "paid")) return "paid";
  if (bills.some((b) => b.status === "overdue")) return "overdue";
  if (bills.some((b) => ["unpaid", "pending", "overdue"].includes(b.status))) return "unpaid";
  return "none";
}

/** Tóm tắt trạng thái chốt kỳ / thanh toán theo phòng + tháng/năm. */
async function getRoomPeriodBillingSummary(roomId, month, year) {
  const bills = await findRoomPeriodBills(roomId, month, year);
  const billingStatus = bills.length > 0 ? "closed" : "open";
  const paymentStatus = billingStatus === "closed" ? derivePaymentStatus(bills) : "none";
  return {
    billingStatus,
    paymentStatus,
    billCount: bills.length,
    bills,
    isEditable: billingStatus !== "closed",
  };
}

async function isMeterPeriodClosed(roomId, month, year) {
  const summary = await getRoomPeriodBillingSummary(roomId, month, year);
  return summary.billingStatus === "closed";
}

/** Sau khi tạo/cập nhật hóa đơn tháng — đánh dấu chỉ số đã chốt (KHÔNG ẩn bản ghi). */
async function closeMeterPeriodForRoom({ roomId, month, year, billId }) {
  const m = Number(month);
  const y = Number(year);
  const summary = await getRoomPeriodBillingSummary(roomId, m, y);
  if (summary.billingStatus !== "closed") return { updated: 0 };

  const paymentStatus = summary.paymentStatus === "none" ? "unpaid" : summary.paymentStatus;
  const result = await ServiceUsage.updateMany(
    { room: roomId, month: m, year: y },
    {
      $set: {
        appliedToBilling: true,
        billingStatus: "closed",
        paymentStatus,
        serviceStatus: "recorded",
        bill: billId || summary.bills[0]?._id || null,
        closedAt: new Date(),
      },
    }
  );
  return { updated: result.modifiedCount };
}

/** Đồng bộ paymentStatus trên ServiceUsage khi hóa đơn thay đổi trạng thái. */
async function syncMeterPaymentStatusForRoomPeriod(roomId, month, year) {
  const m = Number(month);
  const y = Number(year);
  const summary = await getRoomPeriodBillingSummary(roomId, m, y);
  if (summary.billingStatus !== "closed") return;

  await ServiceUsage.updateMany(
    { room: roomId, month: m, year: y },
    {
      $set: {
        billingStatus: "closed",
        appliedToBilling: true,
        paymentStatus: summary.paymentStatus === "none" ? "unpaid" : summary.paymentStatus,
      },
    }
  );
}

/** Gắn trạng thái chuẩn hóa lên từng dòng chỉ số (không lọc bỏ bản ghi). */
async function enrichServiceUsageRows(rows) {
  const cache = new Map();
  return Promise.all(
    rows.map(async (row) => {
      const roomId = row.room?._id || row.room;
      const key = `${roomId}-${row.month}-${row.year}`;
      if (!cache.has(key)) {
        cache.set(key, await getRoomPeriodBillingSummary(roomId, row.month, row.year));
      }
      const summary = cache.get(key);
      const billingStatus = summary.billingStatus === "closed" ? "closed" : row.billingStatus || "open";
      const paymentStatus =
        billingStatus === "closed"
          ? summary.paymentStatus !== "none"
            ? summary.paymentStatus
            : row.paymentStatus || "unpaid"
          : row.paymentStatus || "none";

      return {
        ...row,
        serviceStatus: row.serviceStatus || "recorded",
        billingStatus,
        paymentStatus,
        billId: row.bill || summary.bills[0]?._id || null,
        isEditable: billingStatus !== "closed",
        bills: summary.bills,
      };
    })
  );
}

module.exports = {
  findRoomPeriodBills,
  getRoomPeriodBillingSummary,
  isMeterPeriodClosed,
  closeMeterPeriodForRoom,
  syncMeterPaymentStatusForRoomPeriod,
  enrichServiceUsageRows,
};
