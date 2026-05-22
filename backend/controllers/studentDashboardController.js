const Registration = require("../models/Registration");
const Contract = require("../models/Contract");
const Bill = require("../models/Bill");
const RegistrationPeriod = require("../models/RegistrationPeriod");
const { findOpenRegistrationPeriod, findNextRegistrationPeriod } = require("../services/registrationPeriodPolicy");

const roomPopulate = { path: "room", populate: { path: "area", select: "name" } };

function roomDto(roomDoc, { context, contextLabel, sectionTitle }) {
  if (!roomDoc) return null;
  return {
    roomNumber: roomDoc.roomNumber,
    area: roomDoc.area?.name,
    floor: roomDoc.floor,
    roomType: roomDoc.roomType || roomDoc.description || "-",
    context,
    contextLabel,
    sectionTitle,
  };
}

const MEMBER_LABEL = {
  member: "Thành viên KTX",
  approved_waiting_payment: "Chưa là thành viên — chờ ký hợp đồng & thanh toán",
  pending: "Chưa là thành viên — đơn nội trú chờ duyệt",
  not_registered: "Chưa là thành viên KTX",
};

exports.getDashboard = async (req, res) => {
  try {
    const userId = req.user._id;
    const now = new Date();

    const [pendingReg, approvedReg, activeContracts, pendingPayContracts, bills, period] = await Promise.all([
      Registration.findOne({ user: userId, status: "pending" }).populate(roomPopulate),
      Registration.findOne({ user: userId, status: "approved" }).sort({ createdAt: -1 }).populate(roomPopulate),
      Contract.find({ user: userId, status: "active" }).populate(roomPopulate).sort({ endDate: -1 }),
      Contract.find({ user: userId, status: "pending_payment" }).populate(roomPopulate).sort({ createdAt: -1 }),
      Bill.find({ user: userId, status: { $in: ["unpaid", "pending", "overdue"] } }),
      findOpenRegistrationPeriod(now),
    ]);

    let studentStatus = "not_registered";
    if (activeContracts.length > 0) studentStatus = "member";
    else if (pendingPayContracts.length > 0) studentStatus = "approved_waiting_payment";
    else if (pendingReg) studentStatus = "pending";
    else if (approvedReg) studentStatus = "approved_waiting_payment";

    const memberStatusLabel = MEMBER_LABEL[studentStatus] || MEMBER_LABEL.not_registered;

    const activeContract = activeContracts[0] || null;
    const pendingPayContract = pendingPayContracts[0] || null;

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

    let room = null;
    if (activeContract?.room) {
      room = roomDto(activeContract.room, {
        context: "active",
        contextLabel: "Đang ở (hợp đồng hiệu lực)",
        sectionTitle: "Phòng ở hiện tại",
      });
    } else if (pendingPayContract?.room) {
      room = roomDto(pendingPayContract.room, {
        context: "pending_payment",
        contextLabel: "Chờ ký hợp đồng & thanh toán",
        sectionTitle: "Phòng dự kiến",
      });
    } else if (pendingReg?.room) {
      room = roomDto(pendingReg.room, {
        context: "pending_registration",
        contextLabel: "Đơn đăng ký chờ duyệt",
        sectionTitle: "Phòng đã chọn trong đơn",
      });
    } else if (approvedReg?.room) {
      room = roomDto(approvedReg.room, {
        context: "approved_registration",
        contextLabel: "Đơn đã duyệt — chờ hợp đồng & thanh toán",
        sectionTitle: "Phòng dự kiến",
      });
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
      const nextPeriod = await findNextRegistrationPeriod(now);
      registrationPeriodInfo = {
        isOpen: false,
        nextPeriod: nextPeriod || null,
      };
    }

    res.json({
      studentStatus,
      memberStatusLabel,
      room,
      contract: contractInfo,
      unpaidTotal: totalUnpaid,
      unpaidCount: bills.length,
      registrationPeriod: registrationPeriodInfo,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
