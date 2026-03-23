const User = require("../models/User");
const jwt = require("jsonwebtoken");
const { validationResult } = require("express-validator");
const { isProfileComplete } = require("../utils/profileComplete");
const { findUserByEmailFlexible } = require("../utils/findUserByEmail");

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
    const { email, password, fullName, phone, studentId } = body;
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const existingUser = await findUserByEmailFlexible(User, normalizedEmail);
    if (existingUser) {
      return res.status(400).json({ message: "Email đã tồn tại" });
    }
    const user = await User.create({
      email: normalizedEmail,
      password,
      fullName,
      phone,
      studentId,
      role: "user",
    });
    const token = generateToken(user._id);
    res.status(201).json({
      user: {
        id: String(user._id),
        _id: String(user._id),
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        phone: user.phone ?? "",
        studentId: user.studentId ?? "",
      },
      token,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
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
      phone: user.phone != null ? String(user.phone) : "",
      studentId: user.studentId != null ? String(user.studentId) : "",
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
    const profileComplete = req.user.role === "user" ? isProfileComplete(user) : true;
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
    assignIfDefined("major", req.body.major);
    assignIfDefined("gender", req.body.gender);
    assignIfDefined("citizenId", req.body.citizenId);

    if (req.body.dateOfBirth !== undefined) {
      updates.dateOfBirth = req.body.dateOfBirth ? new Date(req.body.dateOfBirth) : null;
    }

    if (current.role === "user" && req.body.studentId !== undefined) {
      updates.studentId = String(req.body.studentId || "").trim();
    }

    const user = await User.findByIdAndUpdate(req.user._id, updates, {
      new: true,
      runValidators: true,
    })
      .select("-password")
      .lean();

    const profileComplete = current.role === "user" ? isProfileComplete(user) : true;
    res.json({ ...user, profileComplete });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
