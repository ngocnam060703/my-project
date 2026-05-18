const express = require("express");
const billController = require("../controllers/billController");
const { auth, requireRole } = require("../middleware/auth");

const router = express.Router();
const admin = requireRole("admin", "manager");

/** Sinh viên: danh sách của tôi */
router.get("/my", auth, billController.getMyBills);

/** Admin: thống kê doanh thu */
router.get("/revenue/summary", auth, admin, billController.revenueSummary);

/** Thanh toán (sinh viên + admin) */
router.put("/:id/paid", auth, billController.markPaid);
router.patch("/:id/pay", auth, billController.markPaid);
router.put("/:id/pay-online", auth, requireRole("user"), billController.payOnline);

/** Admin: danh sách / tạo / sinh hàng loạt — GET / đặt trước GET /:id để tránh nhầm path */
router.get("/", auth, admin, billController.getAll);
router.post("/", auth, admin, billController.create);
router.post("/generate", auth, admin, billController.generateByMonth);
router.post("/overdue/refresh", auth, admin, billController.runOverdueRefresh);
router.patch("/:id", auth, admin, billController.updateBill);

/** Chi tiết (staff + chủ hóa đơn) */
router.get("/:id", auth, billController.getById);

module.exports = router;
