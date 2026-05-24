const Registration = require("../models/Registration");
const Contract = require("../models/Contract");
const Bill = require("../models/Bill");
const RegistrationPeriod = require("../models/RegistrationPeriod");
const { findOpenRegistrationPeriod, findNextRegistrationPeriod } = require("../services/registrationPeriodPolicy");
const {
  findResidenceContract,
  mapDashboardStudentStatus,
  MEMBER_LABEL,
  isWithinStayPeriod,
} = require("../services/ktxMembership");

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

exports.getDashboard = async (req, res) => {
  try {
    const userId = req.user._id;
    const now = new Date();

    const [pendingReg, approvedReg, residenceContract, bills, period] = await Promise.all([
      Registration.findOne({ user: userId, status: "pending", registrationType: { $ne: "transfer" } }).populate(
        roomPopulate
      ),
      Registration.findOne({ user: userId, status: "approved", registrationType: { $ne: "transfer" } })
        .sort({ createdAt: -1 })
        .populate(roomPopulate),
      findResidenceContract(userId, { syncLifecycle: true }).then((c) =>
        c
          ? Contract.findById(c._id).populate(roomPopulate)
          : null
      ),
      Bill.find({ user: userId, status: { $in: ["unpaid", "pending", "overdue"] } }),
      findOpenRegistrationPeriod(now),
    ]);

    let studentStatus = mapDashboardStudentStatus(residenceContract);
    if (studentStatus === "not_registered" && pendingReg) studentStatus = "pending";
    if (studentStatus === "not_registered" && approvedReg) studentStatus = "approved_waiting_payment";

    const memberStatusLabel = MEMBER_LABEL[studentStatus] || MEMBER_LABEL.not_registered;

    const activeContract =
      residenceContract && residenceContract.status === "active" ? residenceContract : null;
    const pendingPayContract =
      residenceContract && residenceContract.status === "pending_payment" ? residenceContract : null;
    const upcomingContract =
      residenceContract && residenceContract.status === "upcoming" ? residenceContract : null;

    let contractInfo = null;
    const contractForInfo = activeContract || upcomingContract || pendingPayContract;
    if (contractForInfo && isWithinStayPeriod(contractForInfo)) {
      const end = new Date(contractForInfo.endDate);
      const daysLeft = Math.max(0, Math.ceil((end - now) / (24 * 60 * 60 * 1000)));
      contractInfo = {
        startDate: contractForInfo.startDate,
        endDate: contractForInfo.endDate,
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
    } else if (upcomingContract?.room) {
      room = roomDto(upcomingContract.room, {
        context: "upcoming_renewal",
        contextLabel: "HĐ gia hạn — sắp / đang chuyển hiệu lực",
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
