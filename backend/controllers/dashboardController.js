const Room = require("../models/Room");
const User = require("../models/User");
const Registration = require("../models/Registration");
const Bill = require("../models/Bill");
const Violation = require("../models/Violation");
const Contract = require("../models/Contract");
const MaintenanceReport = require("../models/MaintenanceReport");

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function resolveRange(range) {
  const now = new Date();
  const todayStart = startOfDay(now);
  if (range === "14d") {
    const start = new Date(todayStart);
    start.setDate(start.getDate() - 13);
    return { key: "14d", label: "14 ngày gần nhất", start, end: endOfDay(now) };
  }
  if (range === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { key: "month", label: "Tháng này", start, end: endOfDay(now) };
  }
  const start = new Date(todayStart);
  start.setDate(start.getDate() - 6);
  return { key: "7d", label: "7 ngày gần nhất", start, end: endOfDay(now) };
}

function resolveBillingFilter(query) {
  const billStatus = String(query.billStatus || "all");
  const billPeriodType = String(query.billPeriodType || "month");
  const now = new Date();
  const year = Number(query.billYear || now.getFullYear());
  const month = Number(query.billMonth || now.getMonth() + 1);
  const quarter = Number(query.billQuarter || Math.floor(now.getMonth() / 3) + 1);

  const filter = {};
  if (billStatus !== "all") filter.status = billStatus;

  if (billPeriodType === "quarter") {
    const q = Math.min(4, Math.max(1, quarter));
    const startMonth = (q - 1) * 3 + 1;
    filter.year = year;
    filter.month = { $gte: startMonth, $lte: startMonth + 2 };
  } else if (billPeriodType === "year") {
    filter.year = year;
  } else {
    filter.year = year;
    filter.month = Math.min(12, Math.max(1, month));
  }
  return { filter, billStatus, billPeriodType, year, month, quarter };
}

function getRoomStatusForFilter(room) {
  if (room.status === "maintenance") return "maintenance";
  return Number(room.currentOccupancy || 0) >= Number(room.capacity || 0) ? "full" : "available";
}

exports.getStats = async (req, res) => {
  try {
    const range = resolveRange(String(req.query.range || "7d"));
    const roomArea = String(req.query.area || "all");
    const roomStatusFilter = String(req.query.roomStatus || "all");
    const maintenanceType = String(req.query.maintenanceType || "all");
    const maintenanceStatus = String(req.query.maintenanceStatus || "all");
    const violationSeverity = String(req.query.violationSeverity || "all");
    const billingFilterResolved = resolveBillingFilter(req.query);

    const [rooms, pendingRegistrations, activeContracts, billsInRange, allBillsForDebt, maintenanceReports, violations] = await Promise.all([
      Room.find(roomArea !== "all" ? { area: roomArea } : {})
        .populate("area", "name")
        .select("roomNumber area capacity currentOccupancy status"),
      Registration.countDocuments({ status: "pending", createdAt: { $gte: range.start, $lte: range.end } }),
      Contract.countDocuments({ status: "active" }),
      Bill.find({
        ...billingFilterResolved.filter,
        createdAt: { $gte: range.start, $lte: range.end },
      })
        .populate("user", "fullName studentId")
        .populate("room", "roomNumber area")
        .populate("room.area", "name")
        .select("user room month year total status dueDate paidAt billType"),
      Bill.find({
        ...billingFilterResolved.filter,
        status: { $in: ["pending", "unpaid", "overdue"] },
      })
        .populate("user", "fullName studentId")
        .populate("room", "roomNumber area")
        .populate("room.area", "name")
        .select("user room month year total status dueDate"),
      MaintenanceReport.find({
        ...(maintenanceType !== "all" ? { incidentType: maintenanceType } : {}),
        ...(maintenanceStatus !== "all" ? { status: maintenanceStatus } : {}),
        createdAt: { $gte: range.start, $lte: range.end },
      })
        .populate("room", "roomNumber area")
        .populate("room.area", "name")
        .select("room incidentType status"),
      Violation.find({
        ...(violationSeverity !== "all" ? { severity: violationSeverity } : {}),
        createdAt: { $gte: range.start, $lte: range.end },
      })
        .populate("room", "roomNumber area")
        .populate("room.area", "name")
        .select("room status severity"),
    ]);

    const roomRows = rooms
      .map((r) => {
        const roomStatus = getRoomStatusForFilter(r);
        return {
          roomId: r._id,
          roomNumber: r.roomNumber,
          areaId: r.area?._id || null,
          areaName: r.area?.name || "Chưa phân khu",
          capacity: Number(r.capacity || 0),
          occupiedBeds: Number(r.currentOccupancy || 0),
          emptyBeds: Math.max(0, Number(r.capacity || 0) - Number(r.currentOccupancy || 0)),
          status: roomStatus,
          fillRate:
            Number(r.capacity || 0) > 0
              ? Math.round((Number(r.currentOccupancy || 0) / Number(r.capacity || 0)) * 10000) / 100
              : 0,
        };
      })
      .filter((r) => roomStatusFilter === "all" || r.status === roomStatusFilter);

    const roomSummary = roomRows.reduce(
      (acc, r) => {
        acc.totalRooms += 1;
        acc.totalBeds += r.capacity;
        acc.occupiedBeds += r.occupiedBeds;
        acc.emptyBeds += r.emptyBeds;
        if (r.status === "available") acc.availableRooms += 1;
        else if (r.status === "full") acc.fullRooms += 1;
        else if (r.status === "maintenance") acc.maintenanceRooms += 1;
        return acc;
      },
      {
        totalRooms: 0,
        availableRooms: 0,
        fullRooms: 0,
        maintenanceRooms: 0,
        totalBeds: 0,
        occupiedBeds: 0,
        emptyBeds: 0,
      }
    );
    roomSummary.occupancyRate =
      roomSummary.totalBeds > 0
        ? Math.round((roomSummary.occupiedBeds / roomSummary.totalBeds) * 10000) / 100
        : 0;

    const byAreaMap = new Map();
    for (const r of roomRows) {
      const key = String(r.areaId || "none");
      if (!byAreaMap.has(key)) {
        byAreaMap.set(key, {
          areaId: r.areaId,
          areaName: r.areaName,
          totalRooms: 0,
          availableRooms: 0,
          fullRooms: 0,
          maintenanceRooms: 0,
          totalBeds: 0,
          occupiedBeds: 0,
          emptyBeds: 0,
          fillRate: 0,
        });
      }
      const bucket = byAreaMap.get(key);
      bucket.totalRooms += 1;
      bucket.totalBeds += r.capacity;
      bucket.occupiedBeds += r.occupiedBeds;
      bucket.emptyBeds += r.emptyBeds;
      if (r.status === "available") bucket.availableRooms += 1;
      else if (r.status === "full") bucket.fullRooms += 1;
      else if (r.status === "maintenance") bucket.maintenanceRooms += 1;
    }
    const roomByArea = Array.from(byAreaMap.values()).map((x) => ({
      ...x,
      fillRate: x.totalBeds > 0 ? Math.round((x.occupiedBeds / x.totalBeds) * 10000) / 100 : 0,
      _id: x.areaName,
      total: x.totalRooms,
      available: x.availableRooms,
    }));

    const estimatedRevenue = billsInRange.reduce((sum, b) => sum + Number(b.total || 0), 0);
    const paidRevenue = billsInRange
      .filter((b) => b.status === "paid")
      .reduce((sum, b) => sum + Number(b.total || 0), 0);
    const outstandingDebt = allBillsForDebt.reduce((sum, b) => sum + Number(b.total || 0), 0);

    const debtList = allBillsForDebt
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
      .slice(0, 200)
      .map((b) => ({
        billId: b._id,
        studentName: b.user?.fullName || "—",
        studentId: b.user?.studentId || "",
        roomNumber: b.room?.roomNumber || "—",
        areaName: b.room?.area?.name || "",
        period: `${b.month}/${b.year}`,
        total: Number(b.total || 0),
        status: b.status,
        dueDate: b.dueDate,
      }));

    const revenueSeriesMap = new Map();
    for (const b of billsInRange.filter((x) => x.status === "paid")) {
      const key = `${b.month}/${b.year}`;
      revenueSeriesMap.set(key, (revenueSeriesMap.get(key) || 0) + Number(b.total || 0));
    }
    const revenueByMonth = Array.from(revenueSeriesMap.entries()).map(([key, value]) => ({
      month: key,
      doanhThu: value,
    }));

    const incidentTypeMap = new Map();
    const issueByRoom = new Map();
    for (const m of maintenanceReports) {
      const t = m.incidentType || "other";
      incidentTypeMap.set(t, (incidentTypeMap.get(t) || 0) + 1);
      const roomKey = String(m.room?._id || m.room || "");
      if (!roomKey) continue;
      if (!issueByRoom.has(roomKey)) {
        issueByRoom.set(roomKey, {
          roomId: m.room?._id || roomKey,
          roomNumber: m.room?.roomNumber || "—",
          areaName: m.room?.area?.name || "",
          maintenanceReports: 0,
          violations: 0,
          totalIssues: 0,
        });
      }
      const bucket = issueByRoom.get(roomKey);
      bucket.maintenanceReports += 1;
      bucket.totalIssues += 1;
    }
    for (const v of violations) {
      const roomKey = String(v.room?._id || v.room || "");
      if (!roomKey) continue;
      if (!issueByRoom.has(roomKey)) {
        issueByRoom.set(roomKey, {
          roomId: v.room?._id || roomKey,
          roomNumber: v.room?.roomNumber || "—",
          areaName: v.room?.area?.name || "",
          maintenanceReports: 0,
          violations: 0,
          totalIssues: 0,
        });
      }
      const bucket = issueByRoom.get(roomKey);
      bucket.violations += 1;
      bucket.totalIssues += 1;
    }
    const topIssueRooms = Array.from(issueByRoom.values())
      .sort((a, b) => b.totalIssues - a.totalIssues)
      .slice(0, 20);

    const pendingBills = allBillsForDebt.filter((b) => b.status === "pending" || b.status === "unpaid").length;
    const overdueBills = allBillsForDebt.filter((b) => b.status === "overdue").length;
    const pendingViolations = violations.filter((v) => v.status === "pending").length;

    res.json({
      // Legacy fields giữ tương thích UI cũ
      totalRooms: roomSummary.totalRooms,
      availableRooms: roomSummary.availableRooms,
      fullRooms: roomSummary.fullRooms,
      totalStudents: await User.countDocuments({ role: "user" }),
      pendingRegistrations,
      pendingBills,
      paidBillsThisMonth: billsInRange.filter((b) => b.status === "paid").length,
      pendingViolations,
      roomByArea,
      revenueByMonth,
      occupancyRate: Math.round(roomSummary.occupancyRate),

      // New structure theo use case
      timeRange: {
        key: range.key,
        label: range.label,
        start: range.start,
        end: range.end,
      },
      overview: {
        pendingApplications: pendingRegistrations,
        availableRooms: roomSummary.availableRooms,
        residentStudents: activeContracts,
        estimatedRevenue,
      },
      roomPerformance: {
        summary: roomSummary,
        byArea: roomByArea,
        byRoom: roomRows,
      },
      billing: {
        filter: {
          status: billingFilterResolved.billStatus,
          periodType: billingFilterResolved.billPeriodType,
          year: billingFilterResolved.year,
          month: billingFilterResolved.month,
          quarter: billingFilterResolved.quarter,
        },
        summary: {
          paidRevenue,
          outstandingDebt,
          totalBills: billsInRange.length,
          unpaidBills: pendingBills,
          overdueBills,
        },
        revenueSeries: revenueByMonth,
        debtList,
      },
      incidents: {
        summary: {
          totalReports: maintenanceReports.length,
          pendingReports: maintenanceReports.filter((x) => x.status === "pending").length,
          processingReports: maintenanceReports.filter((x) => x.status === "processing").length,
          resolvedReports: maintenanceReports.filter((x) => x.status === "resolved").length,
          totalViolations: violations.length,
          pendingViolations,
          resolvedViolations: violations.filter((x) => x.status === "resolved").length,
        },
        byIncidentType: Array.from(incidentTypeMap.entries()).map(([type, count]) => ({ type, count })),
        topIssueRooms,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
