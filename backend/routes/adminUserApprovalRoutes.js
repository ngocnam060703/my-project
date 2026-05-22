const express = require("express");
const { auth, requireRole } = require("../middleware/auth");
const userController = require("../controllers/userController");

const router = express.Router();

router.use(auth, requireRole("admin"));

router.get("/users/pending", userController.getPendingAccounts);
router.put("/users/:id/approve", userController.approvePendingAccount);
router.put("/users/:id/reject", userController.rejectPendingAccount);

module.exports = router;
