const express = require("express");
const userController = require("../controllers/userController");
const { auth, requireRole } = require("../middleware/auth");
const validateRequest = require("../middleware/validateRequest");
const {
  createUserRules,
  updateUserRules,
  resetPasswordRules,
  mongoIdParam,
} = require("../validators/userValidators");

const router = express.Router();
router.use(auth, requireRole("admin", "manager"));

router.get("/", userController.getAll);

router.patch("/:id/lock", mongoIdParam, validateRequest, userController.lockUser);
router.patch("/:id/unlock", mongoIdParam, validateRequest, userController.unlockUser);
router.patch(
  "/:id/reset-password",
  requireRole("admin"),
  mongoIdParam,
  validateRequest,
  resetPasswordRules,
  validateRequest,
  userController.resetPassword
);

router.post("/", createUserRules, validateRequest, userController.create);
router.patch("/:id", updateUserRules, validateRequest, userController.update);
router.put("/:id", updateUserRules, validateRequest, userController.updatePut);
router.delete("/:id", requireRole("admin"), mongoIdParam, validateRequest, userController.softDelete);
router.get("/:id", mongoIdParam, validateRequest, userController.getById);

module.exports = router;
