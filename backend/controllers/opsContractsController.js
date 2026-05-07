const Contract = require("../models/Contract");
const ContractExtendRequest = require("../models/ContractExtendRequest");
const Registration = require("../models/Registration");
const Bill = require("../models/Bill");
const Violation = require("../models/Violation");
const Room = require("../models/Room");
const MaintenanceReport = require("../models/MaintenanceReport");

function daysFromNow(days) {
  const now = new Date();
  return new Date(now.getTime() + Number(days) * 86400000);
}

exports.getDashboard = async (req, res) => {
  try {
    const now = new Date();
    const expiringTo = daysFromNow(30);

    const [
      activeContracts,
      expiringSoonContracts,
      pendingRenewalRequests,
      pendingTransferRequests,
      roomsTotal,
      roomsMaintenance,
      roomsOverCapacity,
      pendingMaintenanceReports,
      pendingViolations,
      debtBills,
    ] = await Promise.all([
      Contract.countDocuments({ status: "active" }),
      Contract.countDocuments({ status: "active", endDate: { $gte: now, $lte: expiringTo } }),
      ContractExtendRequest.countDocuments({ status: "pending" }),
      Registration.countDocuments({ status: "pending", registrationType: "transfer" }),
      Room.countDocuments({}),
      Room.countDocuments({ status: "maintenance" }),
      Room.countDocuments({ $expr: { $gt: ["$currentOccupancy", "$capacity"] } }),
      MaintenanceReport.countDocuments({ status: { $in: ["pending", "processing"] } }),
      Violation.countDocuments({ status: "pending" }),
      Bill.find({ status: { $in: ["pending", "unpaid", "overdue"] } }).select("user").lean(),
    ]);

    const studentIdsWithDebt = new Set(debtBills.map((b) => String(b.user || ""))).size;
    const occupancyRate = roomsTotal > 0
      ? Math.round(
          (await Room.aggregate([
            { $group: { _id: null, cap: { $sum: "$capacity" }, occ: { $sum: "$currentOccupancy" } } },
          ]).then((x) => {
            const r = x?.[0] || { cap: 0, occ: 0 };
            return r.cap > 0 ? (r.occ / r.cap) * 100 : 0;
          }))
        )
      : 0;

    res.json({
      window: { expiringDays: 30 },
      cards: {
        activeContracts,
        expiringSoonContracts,
        studentsWithDebt: studentIdsWithDebt,
        pendingViolations,
        pendingRenewalRequests,
        pendingTransferRequests,
        occupancyRate,
        roomsOverCapacity,
        roomsMaintenance,
        pendingMaintenanceReports,
      },
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

