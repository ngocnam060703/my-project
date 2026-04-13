const Contract = require("../models/Contract");
const Room = require("../models/Room");
const Bill = require("../models/Bill");
const Notification = require("../models/Notification");
const { getIO } = require("../socket");

async function terminateContractDiscipline(contractId) {
  const contract = await Contract.findById(contractId);
  if (!contract) return;
  if (contract.status === "active" || contract.status === "pending_payment") {
    const room = await Room.findById(contract.room);
    if (room) {
      room.currentOccupancy = Math.max(0, (room.currentOccupancy || 0) - 1);
      room.status = room.currentOccupancy >= room.capacity ? "full" : "available";
      await room.save();
    }
    contract.status = "terminated";
    await contract.save();
  }
}

async function createPenaltyBill({ contractDoc, violationDoc, userId, roomId, totalAmount, penaltyBreakdown, note }) {
  if (totalAmount <= 0) return null;
  const now = new Date();
  const exists = await Bill.findOne({ violation: violationDoc._id });
  if (exists) return exists;
  const bill = await Bill.create({
    billType: "penalty",
    violation: violationDoc._id,
    penaltyBreakdown,
    contract: contractDoc._id,
    user: userId,
    room: roomId,
    month: now.getMonth() + 1,
    year: now.getFullYear(),
    roomFee: 0,
    electricityFee: 0,
    waterFee: 0,
    otherFee: 0,
    sharedCommonFee: 0,
    personalServiceFee: 0,
    occupants: 1,
    total: totalAmount,
    dueDate: new Date(now.getFullYear(), now.getMonth(), Math.min(28, 15)),
    status: "unpaid",
    note: note || "Hóa đơn phạt vi phạm nội quy KTX",
  });
  violationDoc.bill = bill._id;
  await violationDoc.save();
  const io = getIO();
  io.emit("bill:new", { userId: String(userId), message: "Bạn có hóa đơn phạt vi phạm mới" });
  await Notification.create({
    user: userId,
    title: "Hóa đơn phạt",
    message: `Bạn có khoản phạt/bồi thường ${Math.round(totalAmount).toLocaleString("vi-VN")}đ. Vui lòng xem mục Phạt trong Hóa đơn.`,
    type: "bill_reminder",
    link: "/student/my-bills",
  });
  return bill;
}

module.exports = { createPenaltyBill, terminateContractDiscipline };
