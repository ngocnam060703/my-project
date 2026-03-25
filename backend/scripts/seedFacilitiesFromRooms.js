require("dotenv").config();
const mongoose = require("mongoose");
const Room = require("../models/Room");
require("../models/Area");
const Facility = require("../models/Facility");
const FacilityLocation = require("../models/FacilityLocation");

function normalizeAmenityName(v) {
  return String(v || "").trim().replace(/\s+/g, " ");
}

function isWifiName(name) {
  return /^wi-?fi$/i.test(String(name || "").trim());
}

function toCode(name) {
  return (
    "FAC-" +
    String(name || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toUpperCase()
  );
}

function inferCategory(name) {
  const n = String(name || "").toLowerCase();
  if (/(đèn|quat|quạt|ổ điện|dieu hoa|điều hòa|máy lạnh)/i.test(n)) return "điện";
  if (/(giường|tủ|bàn|ghế|kệ)/i.test(n)) return "nội thất";
  if (/(cửa|cửa sổ|khóa)/i.test(n)) return "xây dựng";
  if (/(vòi nước|bồn cầu|lavabo|ống)/i.test(n)) return "nước";
  return "khác";
}

async function main() {
  const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/dormitory_db";
  await mongoose.connect(uri);

  const rooms = await Room.find({}).populate("area", "_id name");
  if (!rooms.length) {
    console.log("Không có phòng nào để seed CSVC.");
    process.exit(0);
  }

  let createdFacilities = 0;
  let updatedFacilities = 0;
  let createdLocations = 0;
  let updatedLocations = 0;
  let skippedWifi = 0;
  let skippedEmpty = 0;

  const totalByName = new Map();
  const perRoomByName = new Map(); // key: roomId|name -> quantity

  for (const room of rooms) {
    const amenities = Array.isArray(room.amenities) ? room.amenities : [];
    for (const raw of amenities) {
      const name = normalizeAmenityName(raw);
      if (!name) {
        skippedEmpty += 1;
        continue;
      }
      if (isWifiName(name)) {
        skippedWifi += 1;
        continue;
      }
      totalByName.set(name, (totalByName.get(name) || 0) + 1);
      const roomKey = `${room._id}|${name}`;
      perRoomByName.set(roomKey, (perRoomByName.get(roomKey) || 0) + 1);
    }
  }

  const facilityByName = new Map();
  for (const [name, total] of totalByName.entries()) {
    const code = toCode(name);
    const existed = await Facility.findOne({
      $or: [{ name }, { code }],
    });
    if (!existed) {
      const doc = await Facility.create({
        name,
        code,
        category: inferCategory(name),
        status: "active",
        quantityTotal: total,
      });
      facilityByName.set(name, doc);
      createdFacilities += 1;
    } else {
      existed.name = name;
      existed.code = existed.code || code;
      existed.category = existed.category || inferCategory(name);
      existed.quantityTotal = total;
      if (!["active", "broken", "repairing"].includes(existed.status)) existed.status = "active";
      await existed.save();
      facilityByName.set(name, existed);
      updatedFacilities += 1;
    }
  }

  for (const [k, quantity] of perRoomByName.entries()) {
    const [roomId, name] = k.split("|");
    const room = rooms.find((r) => String(r._id) === String(roomId));
    const facility = facilityByName.get(name);
    if (!room || !facility) continue;
    const areaId = room.area?._id || room.area;
    const floor = Number(room.floor || 1);

    const existed = await FacilityLocation.findOne({
      facility: facility._id,
      room: room._id,
    });
    if (!existed) {
      await FacilityLocation.create({
        facility: facility._id,
        area: areaId,
        floor,
        room: room._id,
        quantity,
      });
      createdLocations += 1;
    } else {
      existed.area = areaId;
      existed.floor = floor;
      existed.quantity = quantity;
      await existed.save();
      updatedLocations += 1;
    }
  }

  console.log("Seed CSVC từ tiện ích phòng hoàn tất:");
  console.log(`- Facilities tạo mới: ${createdFacilities}`);
  console.log(`- Facilities cập nhật: ${updatedFacilities}`);
  console.log(`- Location tạo mới: ${createdLocations}`);
  console.log(`- Location cập nhật: ${updatedLocations}`);
  console.log(`- Bỏ qua Wifi: ${skippedWifi}`);
  console.log(`- Bỏ qua rỗng: ${skippedEmpty}`);

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("Seed facilities failed:", err);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
