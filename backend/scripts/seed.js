require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../models/User");
const Area = require("../models/Area");
const Room = require("../models/Room");

const seed = async () => {
  await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/dormitory_db");
  await User.deleteMany({});
  await Area.deleteMany({});
  await Room.deleteMany({});

  const admin = await User.create({
    email: "admin@ktx.vn",
    password: "123456",
    fullName: "Quản trị viên",
    role: "admin",
  });

  const manager = await User.create({
    email: "manager@ktx.vn",
    password: "123456",
    fullName: "Quản lý khu A",
    role: "manager",
  });

  await User.create({
    email: "sv@ktx.vn",
    password: "123456",
    fullName: "Nguyễn Văn An",
    studentId: "SV001",
    className: "11DHTH1",
    major: "Công nghệ thông tin",
    gender: "Nam",
    dateOfBirth: new Date("2002-04-24"),
    phone: "0387079343",
    address: "Bến Tre",
    citizenId: "0123456789",
    role: "user",
  });

  /** Tài khoản chưa đủ hồ sơ — dùng để thử chỉnh sửa trang profile */
  await User.create({
    email: "incomplete@ktx.vn",
    password: "123456",
    fullName: "Trần Thị Chưa Cập Nhật",
    role: "user",
  });

  const areaA = await Area.create({ name: "Khu A", description: "Khu nam", manager: manager._id });
  const areaB = await Area.create({ name: "Khu B", description: "Khu nữ" });

  await Room.create([
    // Khu A (tầng 1-2)
    {
      roomNumber: "101",
      area: areaA._id,
      capacity: 4,
      currentOccupancy: 4,
      price: 1200000,
      floor: 1,
      status: "full",
      amenities: ["Wi-Fi", "Bàn học", "Giường tầng", "Tủ cá nhân"],
      description: "Phòng 4 người, đầy chỗ.",
    },
    {
      roomNumber: "102",
      area: areaA._id,
      capacity: 4,
      currentOccupancy: 1,
      price: 1200000,
      floor: 1,
      status: "available",
      amenities: ["Wi-Fi", "Bàn học", "Quạt trần", "Tủ cá nhân"],
      description: "Phòng thoáng, còn trống.",
    },
    {
      roomNumber: "103",
      area: areaA._id,
      capacity: 4,
      currentOccupancy: 0,
      price: 1250000,
      floor: 1,
      status: "available",
      amenities: ["Wi-Fi", "Giường tầng", "Tủ cá nhân", "Bàn học"],
      description: "Phòng mới, trang bị đầy đủ.",
    },
    {
      roomNumber: "104",
      area: areaA._id,
      capacity: 3,
      currentOccupancy: 0,
      price: 1350000,
      floor: 1,
      status: "available",
      amenities: ["Wi-Fi", "Bàn học", "Tủ cá nhân"],
      description: "Phòng 3 người, tối ưu cho học tập.",
    },
    {
      roomNumber: "105",
      area: areaA._id,
      capacity: 4,
      currentOccupancy: 2,
      price: 1250000,
      floor: 1,
      status: "available",
      amenities: ["Wi-Fi", "Bàn học", "Quạt trần", "Tủ cá nhân"],
      description: "Còn trống một phần.",
    },
    {
      roomNumber: "201",
      area: areaA._id,
      capacity: 4,
      currentOccupancy: 0,
      price: 1350000,
      floor: 2,
      status: "available",
      amenities: ["Wi-Fi", "Giường tầng", "Bàn học", "Tủ cá nhân"],
      description: "Phòng tầng 2, yên tĩnh.",
    },
    {
      roomNumber: "202",
      area: areaA._id,
      capacity: 4,
      currentOccupancy: 3,
      price: 1400000,
      floor: 2,
      status: "available",
      amenities: ["Wi-Fi", "Bàn học", "Quạt trần", "Tủ cá nhân"],
      description: "Gần cầu thang, thuận tiện di chuyển.",
    },
    {
      roomNumber: "203",
      area: areaA._id,
      capacity: 4,
      currentOccupancy: 4,
      price: 1400000,
      floor: 2,
      status: "full",
      amenities: ["Wi-Fi", "Giường tầng", "Bàn học", "Tủ cá nhân"],
      description: "Phòng đã đầy chỗ.",
    },

    // Khu B (tầng 3-4)
    {
      roomNumber: "301",
      area: areaB._id,
      capacity: 4,
      currentOccupancy: 0,
      price: 1450000,
      floor: 3,
      status: "available",
      amenities: ["Wi-Fi", "Bàn học", "Giường tầng", "Tủ cá nhân"],
      description: "Thoáng mát, view đẹp.",
    },
    {
      roomNumber: "302",
      area: areaB._id,
      capacity: 4,
      currentOccupancy: 4,
      price: 1450000,
      floor: 3,
      status: "full",
      amenities: ["Wi-Fi", "Bàn học", "Quạt trần", "Tủ cá nhân"],
      description: "Phòng đã đầy chỗ.",
    },
    {
      roomNumber: "303",
      area: areaB._id,
      capacity: 4,
      currentOccupancy: 2,
      price: 1500000,
      floor: 3,
      status: "available",
      amenities: ["Wi-Fi", "Bàn học", "Giường tầng", "Tủ cá nhân"],
      description: "Còn trống một phần.",
    },
    {
      roomNumber: "304",
      area: areaB._id,
      capacity: 3,
      currentOccupancy: 0,
      price: 1600000,
      floor: 3,
      status: "available",
      amenities: ["Wi-Fi", "Bàn học", "Tủ cá nhân"],
      description: "Phòng 3 người, phù hợp học nhóm.",
    },
    {
      roomNumber: "401",
      area: areaB._id,
      capacity: 4,
      currentOccupancy: 1,
      price: 1700000,
      floor: 4,
      status: "maintenance",
      amenities: ["Wi-Fi", "Bàn học", "Tủ cá nhân"],
      description: "Đang bảo trì thiết bị (một số ngày).",
    },
    {
      roomNumber: "402",
      area: areaB._id,
      capacity: 4,
      currentOccupancy: 0,
      price: 1750000,
      floor: 4,
      status: "available",
      amenities: ["Wi-Fi", "Giường tầng", "Bàn học", "Tủ cá nhân"],
      description: "Phòng tầng cao, rất ít bụi.",
    },
  ]);

  console.log(
    "Seed done!\nAdmin: admin@ktx.vn / 123456\nManager: manager@ktx.vn / 123456\nSinh viên (hồ sơ đầy đủ): sv@ktx.vn / 123456\nSinh viên (hồ sơ chưa đủ): incomplete@ktx.vn / 123456"
  );
  process.exit(0);
};
seed().catch(console.error);
