const Bill = require("../models/Bill");

function toStartOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/**
 * Cập nhật hàng loạt hóa đơn tiền phòng (monthly) còn nợ sang overdue khi quá hạn.
 * Gọi nhẹ khi admin/sinh viên tải danh sách — không cần cron (có thể bổ sung cron sau).
 */
async function refreshOverdueMonthlyBills(now = new Date()) {
  const start = toStartOfDay(now);
  const res = await Bill.updateMany(
    {
      billType: "monthly",
      status: { $in: ["pending", "unpaid"] },
      dueDate: { $lt: start },
    },
    { $set: { status: "overdue" } }
  );
  return { modifiedCount: res.modifiedCount || 0 };
}

module.exports = { refreshOverdueMonthlyBills, toStartOfDay };
