/**
 * Lịch sinh viên — tổng hợp động từ hóa đơn, hợp đồng, gia hạn, khai báo bảo trì, kỳ đăng ký KTX.
 * ID sự kiện: {loại}_{ObjectId} (ObjectId 24 ký tự hex) — dùng cho GET /api/events/:id
 */
const mongoose = require("mongoose");
const Bill = require("../models/Bill");
const Contract = require("../models/Contract");
const ContractExtendRequest = require("../models/ContractExtendRequest");
const MaintenanceReport = require("../models/MaintenanceReport");
const RegistrationPeriod = require("../models/RegistrationPeriod");

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function parseRangeQuery(req) {
  let from = req.query.from ? new Date(String(req.query.from)) : new Date();
  let to = req.query.to ? new Date(String(req.query.to)) : new Date();
  if (Number.isNaN(from.getTime())) from = new Date();
  if (Number.isNaN(to.getTime())) to = new Date();
  if (from > to) {
    const t = from;
    from = to;
    to = t;
  }
  /** Mặc định: 3 tháng trước → 15 tháng sau (đủ cho lịch năm học) */
  if (!req.query.from && !req.query.to) {
    from = new Date();
    from.setMonth(from.getMonth() - 3);
    to = new Date();
    to.setMonth(to.getMonth() + 15);
  }
  return { from: startOfDay(from), to: endOfDay(to) };
}

/** Hai khoảng thời gian giao nhau (dùng lọc theo from/to query) */
function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart <= bEnd && aEnd >= bStart;
}

function eventBase(id, title, description, type, startDate, endDate, status, createdAt, extra = {}) {
  return {
    id,
    title,
    description,
    type,
    startDate: startDate.toISOString(),
    endDate: endOfDay(endDate).toISOString(),
    ...(status != null ? { status } : {}),
    createdAt: createdAt ? new Date(createdAt).toISOString() : undefined,
    ...extra,
  };
}

async function buildEventsForUser(userId, range) {
  const uid = new mongoose.Types.ObjectId(String(userId));
  const { from, to } = range;

  const [bills, contracts, extendReqs, maintenance, periods] = await Promise.all([
    Bill.find({ user: uid })
      .populate("room", "roomNumber area")
      .populate("contract", "contractNumber")
      .lean(),
    Contract.find({ user: uid }).populate("room", "roomNumber area").lean(),
    ContractExtendRequest.find({ user: uid }).populate("contract", "contractNumber room").lean(),
    MaintenanceReport.find({ user: uid }).populate("room", "roomNumber area").lean(),
    RegistrationPeriod.find({ isActive: true }).sort({ startDate: 1 }).lean(),
  ]);

  const events = [];

  for (const b of bills) {
    const due = b.dueDate ? new Date(b.dueDate) : null;
    if (!due) continue;
    const s = startOfDay(due);
    const e = startOfDay(due);
    if (!rangesOverlap(s, e, from, to)) continue;
    const roomNum = b.room?.roomNumber || "";
    const title =
      b.billType === "penalty" ? `Hạn thanh toán phạt vi phạm` : `Hạn thanh toán hóa đơn tháng ${b.month}/${b.year}`;
    const desc = [
      roomNum ? `Phòng ${roomNum}` : "",
      `Tổng: ${(b.total || 0).toLocaleString("vi-VN")}đ`,
      b.status === "overdue" ? "Trạng thái: quá hạn" : `Trạng thái: ${b.status}`,
    ]
      .filter(Boolean)
      .join(" · ");
    events.push(
      eventBase(`bill_${b._id}`, title, desc, "payment", s, e, b.status, b.createdAt, {
        ref: { kind: "bill", refId: String(b._id) },
      })
    );
  }

  for (const c of contracts) {
    const start = c.startDate ? startOfDay(new Date(c.startDate)) : null;
    const end = c.endDate ? startOfDay(new Date(c.endDate)) : null;
    const roomNum = c.room?.roomNumber || "";
    const cn = c.contractNumber || "";

    if (start && rangesOverlap(start, start, from, to)) {
      events.push(
        eventBase(
          `contract_start_${c._id}`,
          `Bắt đầu hợp đồng${roomNum ? ` — Phòng ${roomNum}` : ""}`,
          `Hợp đồng ${cn}. Trạng thái: ${c.status}.`,
          "contract",
          start,
          start,
          c.status,
          c.createdAt,
          { ref: { kind: "contract", refId: String(c._id) } }
        )
      );
    }
    if (end && rangesOverlap(end, end, from, to)) {
      events.push(
        eventBase(
          `contract_end_${c._id}`,
          `Hết hạn hợp đồng${roomNum ? ` — Phòng ${roomNum}` : ""}`,
          `Hợp đồng ${cn}. Kết thúc ${end.toLocaleDateString("vi-VN")}. Trạng thái: ${c.status}.`,
          "contract",
          end,
          end,
          c.status,
          c.createdAt,
          { ref: { kind: "contract", refId: String(c._id) } }
        )
      );
    }
  }

  for (const r of extendReqs) {
    const created = r.createdAt ? startOfDay(new Date(r.createdAt)) : null;
    if (created && rangesOverlap(created, created, from, to)) {
      events.push(
        eventBase(
          `extend_${r._id}`,
          `Yêu cầu gia hạn hợp đồng (${r.months} tháng)`,
          `Trạng thái: ${r.status}. ${r.note ? `Ghi chú: ${r.note}` : ""}`,
          "contract",
          created,
          created,
          r.status,
          r.createdAt,
          { ref: { kind: "extend", refId: String(r._id) } }
        )
      );
    }
    if (r.status === "approved" && r.appliedEndDate) {
      const applied = startOfDay(new Date(r.appliedEndDate));
      if (rangesOverlap(applied, applied, from, to)) {
        events.push(
          eventBase(
            `extend_applied_${r._id}`,
            `Ngày kết thúc sau gia hạn (đã duyệt)`,
            `Hợp đồng liên quan đã được gia hạn. Kết thúc mới: ${applied.toLocaleDateString("vi-VN")}.`,
            "contract",
            applied,
            applied,
            "approved",
            r.reviewedAt || r.updatedAt,
            { ref: { kind: "extend", refId: String(r._id) } }
          )
        );
      }
    }
  }

  for (const m of maintenance) {
    const s = m.createdAt ? startOfDay(new Date(m.createdAt)) : null;
    if (!s) continue;
    const typeLabel = { electricity: "Điện", water: "Nước", equipment: "Thiết bị", other: "Khác" }[m.incidentType] || m.incidentType;
    const roomNum = m.room?.roomNumber || "";
    /** Kéo dài tới ngày cập nhật cuối nếu đã xử lý — minh bạo “cửa sổ” bảo trì */
    const endRaw = m.status === "resolved" && m.updatedAt ? new Date(m.updatedAt) : s;
    const e = endOfDay(endRaw < s ? s : endRaw);
    if (!rangesOverlap(s, e, from, to)) continue;
    events.push(
      eventBase(
        `maintenance_${m._id}`,
        `Khai báo / bảo trì — ${typeLabel}`,
        [m.description || "", roomNum ? `Phòng ${roomNum}` : "", `Trạng thái: ${m.status}`].filter(Boolean).join(" · "),
        "maintenance",
        s,
        e,
        m.status,
        m.createdAt,
        { ref: { kind: "maintenance", refId: String(m._id) } }
      )
    );
  }

  for (const p of periods) {
    const s = p.startDate ? startOfDay(new Date(p.startDate)) : null;
    const e = p.endDate ? endOfDay(new Date(p.endDate)) : null;
    if (!s || !e) continue;
    if (!rangesOverlap(s, e, from, to)) continue;
    events.push(
      eventBase(
        `period_${p._id}`,
        `Kỳ đăng ký / sự kiện KTX: ${p.name}`,
        p.note || "Thông tin kỳ đăng ký chỗ ở tập trung.",
        "event",
        s,
        e,
        p.isActive ? "active" : "inactive",
        p.createdAt,
        { ref: { kind: "period", refId: String(p._id) } }
      )
    );
  }

  events.sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
  return events;
}

exports.getMySchedule = async (req, res) => {
  try {
    if (req.user.role !== "user") return res.status(403).json({ message: "Chỉ sinh viên" });
    const range = parseRangeQuery(req);
    const events = await buildEventsForUser(req.user._id, range);
    res.json({
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      events,
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

/** extend_applied phải đứng trước extend để regex không nhầm prefix */
const EVENT_ID_RE = /^(bill|contract_start|contract_end|extend_applied|extend|maintenance|period)_([a-f0-9]{24})$/i;

async function loadEventDetail(userId, id) {
  const m = String(id).match(EVENT_ID_RE);
  if (!m) return { error: 400, message: "Mã sự kiện không hợp lệ" };
  const [, kind, oid] = m;
  if (!mongoose.isValidObjectId(oid)) return { error: 400, message: "id không hợp lệ" };
  const uid = new mongoose.Types.ObjectId(String(userId));

  if (kind === "bill") {
    const doc = await Bill.findOne({ _id: oid, user: uid }).populate("room").populate("contract").lean();
    if (!doc) return { error: 404, message: "Không tìm thấy" };
    const roomNum = doc.room?.roomNumber || "";
    const title =
      doc.billType === "penalty" ? `Hạn thanh toán phạt vi phạm` : `Hạn thanh toán hóa đơn tháng ${doc.month}/${doc.year}`;
    const desc = [roomNum ? `Phòng ${roomNum}` : "", `Tổng: ${(doc.total || 0).toLocaleString("vi-VN")}đ`, `Trạng thái: ${doc.status}`]
      .filter(Boolean)
      .join(" · ");
    const due = startOfDay(new Date(doc.dueDate));
    return { event: { ...eventBase(`bill_${oid}`, title, desc, "payment", due, due, doc.status, doc.createdAt), raw: doc } };
  }
  if (kind === "contract_start" || kind === "contract_end") {
    const doc = await Contract.findOne({ _id: oid, user: uid }).populate("room").lean();
    if (!doc) return { error: 404, message: "Không tìm thấy" };
    const isEnd = kind === "contract_end";
    const d = isEnd ? doc.endDate : doc.startDate;
    const day = startOfDay(new Date(d));
    const title = isEnd ? `Hết hạn hợp đồng` : `Bắt đầu hợp đồng`;
    const desc = `Số HĐ: ${doc.contractNumber || ""} · Phòng: ${doc.room?.roomNumber || ""}`;
    return {
      event: {
        ...eventBase(`${kind}_${oid}`, title, desc, "contract", day, day, doc.status, doc.createdAt),
        raw: doc,
      },
    };
  }
  if (kind === "extend" || kind === "extend_applied") {
    const doc = await ContractExtendRequest.findOne({ _id: oid, user: uid }).populate("contract").lean();
    if (!doc) return { error: 404, message: "Không tìm thấy" };
    const isApplied = kind === "extend_applied";
    const day = isApplied && doc.appliedEndDate ? startOfDay(new Date(doc.appliedEndDate)) : startOfDay(new Date(doc.createdAt));
    const title = isApplied ? "Ngày kết thúc sau gia hạn (đã duyệt)" : `Yêu cầu gia hạn hợp đồng (${doc.months} tháng)`;
    const desc = isApplied
      ? `Ngày kết thúc mới được áp dụng. Trạng thái yêu cầu: ${doc.status}.`
      : `Đã gửi yêu cầu gia hạn ${doc.months} tháng. Trạng thái: ${doc.status}. ${doc.note ? `Ghi chú: ${doc.note}` : ""}`.trim();
    return {
      event: {
        ...eventBase(`${kind}_${oid}`, title, desc, "contract", day, day, doc.status, doc.createdAt),
        raw: doc,
      },
    };
  }
  if (kind === "maintenance") {
    const doc = await MaintenanceReport.findOne({ _id: oid, user: uid }).populate("room").lean();
    if (!doc) return { error: 404, message: "Không tìm thấy" };
    const s = startOfDay(new Date(doc.createdAt));
    const endRaw = doc.status === "resolved" && doc.updatedAt ? new Date(doc.updatedAt) : s;
    const e = endOfDay(endRaw < s ? s : endRaw);
    return {
      event: {
        ...eventBase(
          `maintenance_${oid}`,
          "Khai báo bảo trì",
          doc.description || "",
          "maintenance",
          s,
          e,
          doc.status,
          doc.createdAt,
          { images: doc.images || [] }
        ),
        raw: doc,
      },
    };
  }
  if (kind === "period") {
    const doc = await RegistrationPeriod.findById(oid).lean();
    if (!doc) return { error: 404, message: "Không tìm thấy" };
    const s = startOfDay(new Date(doc.startDate));
    const e = endOfDay(new Date(doc.endDate));
    return {
      event: {
        ...eventBase(`period_${oid}`, doc.name, doc.note || "", "event", s, e, doc.isActive ? "active" : "inactive", doc.createdAt),
        raw: doc,
      },
    };
  }
  return { error: 400, message: "Loại sự kiện không hỗ trợ" };
}

exports.getEventById = async (req, res) => {
  try {
    if (req.user.role !== "user") return res.status(403).json({ message: "Chỉ sinh viên" });
    const { id } = req.params;
    const decoded = decodeURIComponent(String(id || ""));
    const out = await loadEventDetail(req.user._id, decoded);
    if (out.error) return res.status(out.error).json({ message: out.message });
    res.json(out.event);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};
