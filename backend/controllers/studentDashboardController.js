const Registration = require("../models/Registration");
const Contract = require("../models/Contract");
const Bill = require("../models/Bill");
const RegistrationPeriod = require("../models/RegistrationPeriod");

exports.getDashboard = async (req, res) => {
  try {
    const userId = req.user._id;
    const now = new Date();

    const [pendingReg, approvedReg, contracts, bills, period] = await Promise.all([
      Registration.findOne({ user: userId, status: "pending" }).populate("room").populate("room.area", "name"),
      Registration.findOne({ user: userId, status: "approved" }).populate("room").populate("room.area", "name"),
      Contract.find({ user: userId, status: "active" }).populate("room").populate("room.area", "name").sort({ endDate: -1 }),
      Bill.find({ user: userId, status: { $in: ["pending", "overdue"] } }),
      RegistrationPeriod.findOne({ isActive: true, startDate: { $lte: now }, endDate: { $gte: now } }),
    ]);

    let studentStatus = "not_registered";
    if (contracts.length > 0) studentStatus = "member";
    else if (pendingReg) studentStatus = "pending";
    else if (approvedReg) studentStatus = "approved_waiting_payment";

    const activeContract = contracts[0] || null;
    let contractInfo = null;
    if (activeContract) {
      const end = new Date(activeContract.endDate);
      const daysLeft = Math.max(0, Math.ceil((end - now) / (24 * 60 * 60 * 1000)));
      contractInfo = {
        startDate: activeContract.startDate,
        endDate: activeContract.endDate,
        daysLeft,
      };
    }

    const totalUnpaid = bills.reduce((sum, b) => sum + (b.total || 0), 0);

    let registrationPeriodInfo = null;
    if (period) {
      registrationPeriodInfo = {
        isOpen: true,
        startDate: period.startDate,
        endDate: period.endDate,
        name: period.name,
      };
    } else {
      const nextPeriod = await RegistrationPeriod.findOne({ isActive: true, startDate: { $gt: now } })
        .sort({ startDate: 1 })
        .select("name startDate endDate");
      registrationPeriodInfo = {
        isOpen: false,
        nextPeriod: nextPeriod || null,
      };
    }

    res.json({
      studentStatus,
      room: activeContract?.room
        ? {
            roomNumber: activeContract.room.roomNumber,
            area: activeContract.room.area?.name,
            floor: activeContract.room.floor,
            roomType: activeContract.room.roomType || activeContract.room.description || "-",
          }
        : null,
      contract: contractInfo,
      unpaidTotal: totalUnpaid,
      unpaidCount: bills.length,
      registrationPeriod: registrationPeriodInfo,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
