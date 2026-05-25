const User = require("../models/User");
const jwt = require("jsonwebtoken");
const { validationResult } = require("express-validator");
const { isProfileComplete } = require("../utils/profileComplete");
const { findUserByEmailFlexible } = require("../utils/findUserByEmail");

function registerDuplicateMessage(error) {
  const code = error?.code;
  if (code !== 11000 && code !== 11001) {
    const raw = String(error?.message || "");
    if (!raw.includes("E11000")) return null;
    if (/email/i.test(raw)) return "Email này đã được đăng ký. Vui lòng đăng nhập hoặc dùng email khác.";
    if (/studentId/i.test(raw)) return "MSSV này đã được đăng ký. Vui lòng đăng nhập hoặc dùng MSSV khác.";
    return "Thông tin đăng ký đã trùng với tài khoản khác. Vui lòng kiểm tra email và MSSV.";
  }
  const pattern = error?.keyPattern || {};
  if (pattern.email != null) {
    return "Email này đã được đăng ký. Vui lòng đăng nhập hoặc dùng email khác.";
  }
  if (pattern.studentId != null) {
    return "MSSV này đã được đăng ký. Vui lòng đăng nhập hoặc dùng MSSV khác.";
  }
  return "Thông tin đăng ký đã trùng với tài khoản khác. Vui lòng kiểm tra email và MSSV.";
}

/** Tìm user theo email (kể cả đã xóa mềm) — tránh lọt qua kiểm tra chỉ user còn hiệu lực. */
async function findUserByEmailAny(User, normalizedEmail) {
  const email = String(normalizedEmail || "").trim().toLowerCase();
  if (!email) return null;
  let user = await User.findOne({ email });
  if (user) return user;
  try {
    user = await User.findOne({
      $expr: { $eq: [{ $toLower: { $ifNull: ["$email", ""] } }, email] },
    });
  } catch {
  }
  if (user) return user;
  return findUserByEmailFlexible(User, email);
}

const generateToken = (userId) => {
  const id =
    userId == null
      ? ""
      : typeof userId === "string" || typeof userId === "number"
        ? String(userId)
        : typeof userId.toString === "function"
          ? userId.toString()
          : String(userId);
  if (!id) {
    throw new Error("Không tạo được token: thiếu định danh người dùng");
  }
  const secret = process.env.JWT_SECRET || "secret";
  return jwt.sign({ userId: id }, secret, { expiresIn: "7d" });
};

exports.register = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
    const { email, password, fullName, phone, studentId, confirmPassword } = body;
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const normalizedStudentId = String(studentId || "").trim();
    if (!normalizedStudentId) {
      return res.status(400).json({ message: "MSSV không được để trống" });
    }
    if (String(password || "") !== String(confirmPassword || "")) {
      return res.status(400).json({ message: "Xác nhận mật khẩu không khớp" });
    }
    const existingUser = await findUserByEmailAny(User, normalizedEmail);
    if (existingUser) {
      if (existingUser.isDeleted) {
        return res.status(400).json({
          message: "Email đã từng được đăng ký. Vui lòng liên hệ quản trị viên hoặc dùng email khác.",
        });
      }
      return res.status(400).json({ message: "Email đã tồn tại. Vui lòng đăng nhập hoặc dùng email khác." });
    }
    const existingStudentId = await User.findOne({ studentId: normalizedStudentId }).select("_id isDeleted");
    if (existingStudentId) {
      if (existingStudentId.isDeleted) {
        return res.status(400).json({
          message: "MSSV đã từng được đăng ký. Vui lòng liên hệ quản trị viên hoặc dùng MSSV khác.",
        });
      }
      return res.status(400).json({ message: "MSSV đã tồn tại. Vui lòng đăng nhập hoặc dùng MSSV khác." });
    }
    const user = await User.create({
      email: normalizedEmail,
      password,
      fullName,
      phone,
      studentId: normalizedStudentId,
      role: "student",
      status: "pending",
      approvedAt: null,
      approvedBy: null,
      rejectionReason: "",
    });
    res.status(201).json({
      message: "Tài khoản đã được tạo và đang chờ quản trị viên phê duyệt.",
      user: {
        id: String(user._id),
        _id: String(user._id),
        studentId: user.studentId ?? "",
        fullName: user.fullName,
        email: user.email,
        phone: user.phone ?? "",
        role: user.role,
        status: user.status,
      },
    });
  } catch (error) {
    const dup = registerDuplicateMessage(error);
    if (dup) {
      return res.status(409).json({ message: dup });
    }
    console.error("register:", error);
    res.status(500).json({ message: "Không thể đăng ký tài khoản. Vui lòng thử lại sau." });
  }
};

exports.login = async (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
    const { email, password } = body;
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail || !password) {
      return res.status(400).json({ message: "Vui lòng nhập email và mật khẩu" });
    }
    let user;
    try {
      user = await findUserByEmailFlexible(User, normalizedEmail);
    } catch (dbErr) {
      console.error("Login DB lookup:", dbErr);
      return res.status(503).json({
        message:
          "Không truy vấn được cơ sở dữ liệu. Kiểm tra MongoDB đang chạy và biến MONGODB_URI trong backend/.env",
      });
    }
    if (!user) return res.status(401).json({ message: "Email hoặc mật khẩu không đúng" });
    if (!user.isActive) return res.status(401).json({ message: "Tài khoản đã bị khóa" });
    if (user.role === "student" && user.status === "pending") {
      return res.status(403).json({ message: "Tài khoản đang chờ phê duyệt." });
    }
    if (user.role === "student" && user.status === "rejected") {
      return res.status(403).json({ message: "Tài khoản đã bị từ chối." });
    }

    const pwdRaw = String(password);
    const pwdVariants = [pwdRaw, pwdRaw.trim()].filter((v, i, a) => v && a.indexOf(v) === i);

    let isMatch = false;
    try {
      for (const v of pwdVariants) {
        if (await user.comparePassword(v)) {
          isMatch = true;
          break;
        }
      }
    } catch (e) {
      console.error("login comparePassword:", e);
      return res.status(500).json({ message: "Lỗi xác thực mật khẩu. Liên hệ quản trị." });
    }

    // Khôi phục tài khoản bị lưu mật khẩu plaintext do findByIdAndUpdate (admin đổi MK): hash lại một lần.
    if (!isMatch && user.password && typeof user.password === "string" && !user.password.startsWith("$2")) {
      try {
        for (const v of pwdVariants) {
          if (v && user.password === v) {
            user.password = v;
            await user.save();
            isMatch = true;
            break;
          }
        }
      } catch (e) {
        console.error("login legacy password save:", e);
        return res.status(500).json({ message: "Lỗi cập nhật mật khẩu. Liên hệ quản trị." });
      }
    }

    if (!isMatch) return res.status(401).json({ message: "Email hoặc mật khẩu không đúng" });

    let token;
    try {
      token = generateToken(user._id);
    } catch (jwtErr) {
      console.error("Login JWT:", jwtErr);
      return res.status(500).json({ message: "Lỗi tạo phiên đăng nhập (JWT). Kiểm tra JWT_SECRET trên server." });
    }

    // Chỉ gửi primitive — tránh lỗi serialize Express 5 / BSON (đồng bộ với register)
    const idStr = String(user._id);
    const safeUser = {
      id: idStr,
      _id: idStr,
      email: String(user.email ?? ""),
      fullName: String(user.fullName ?? ""),
      role: String(user.role ?? "user"),
      status: String(user.status || "approved"),
      phone: user.phone != null ? String(user.phone) : "",
      studentId: user.studentId != null ? String(user.studentId) : "",
      isSuperAdmin: user.role === "admin" ? !!user.isSuperAdmin : false,
    };
    return res.json({ user: safeUser, token });
  } catch (error) {
    console.error("Login error:", error);
    const msg =
      error && typeof error === "object" && "message" in error && String(error.message).trim()
        ? String(error.message)
        : "Lỗi máy chủ khi đăng nhập";
    return res.status(500).json({ message: msg });
  }
};

exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-password").lean();
    const isStudent = req.user.role === "user" || req.user.role === "student";
    const profileComplete = isStudent ? isProfileComplete(user) : true;
    res.json({ ...user, profileComplete });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const current = await User.findById(req.user._id);
    if (!current) return res.status(404).json({ message: "Không tìm thấy người dùng" });

    const updates = {};
    const assignIfDefined = (key, val) => {
      if (val !== undefined) updates[key] = val;
    };
    assignIfDefined("fullName", req.body.fullName);
    assignIfDefined("phone", req.body.phone);
    assignIfDefined("address", req.body.address);
    assignIfDefined("className", req.body.className);
    assignIfDefined("facultyGroup", req.body.facultyGroup);
    assignIfDefined("major", req.body.major);
    assignIfDefined("gender", req.body.gender);
    assignIfDefined("citizenId", req.body.citizenId);
    assignIfDefined("faculty", req.body.faculty);
    assignIfDefined("homeroomTeacher", req.body.homeroomTeacher);
    assignIfDefined("addressNative", req.body.addressNative);
    assignIfDefined("addressPermanent", req.body.addressPermanent);
    assignIfDefined("addressTemporary", req.body.addressTemporary);
    assignIfDefined("addressAbsent", req.body.addressAbsent);
    assignIfDefined("familyFatherName", req.body.familyFatherName);
    assignIfDefined("familyFatherPhone", req.body.familyFatherPhone);
    assignIfDefined("familyMotherName", req.body.familyMotherName);
    assignIfDefined("familyMotherPhone", req.body.familyMotherPhone);
    assignIfDefined("familyEmergencyPhone", req.body.familyEmergencyPhone);

    if (req.body.dateOfBirth !== undefined) {
      updates.dateOfBirth = req.body.dateOfBirth ? new Date(req.body.dateOfBirth) : null;
    }
    if (req.body.enrollmentDate !== undefined) {
      updates.enrollmentDate = req.body.enrollmentDate ? new Date(req.body.enrollmentDate) : null;
    }

    const isStudent = current.role === "user" || current.role === "student";
    if (isStudent && req.body.studentId !== undefined) {
      updates.studentId = String(req.body.studentId || "").trim();
    }

    const user = await User.findByIdAndUpdate(req.user._id, updates, {
      new: true,
      runValidators: true,
    })
      .select("-password")
      .lean();

    const profileComplete = isStudent ? isProfileComplete(user) : true;
    res.json({ ...user, profileComplete });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
