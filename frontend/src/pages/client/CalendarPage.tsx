/**
 * Lịch của tôi — Bootstrap 5: lưới tháng + danh sách, lọc theo loại, chi tiết (GET /events/:id).
 * Nguồn dữ liệu: GET /my-schedule (backend tổng hợp hóa đơn, hợp đồng, gia hạn, bảo trì, kỳ đăng ký).
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import "bootstrap/dist/css/bootstrap.min.css";
import dayjs from "dayjs";
import "dayjs/locale/vi";
import { scheduleApi } from "../../api";
import { apiErrorMessage } from "../../utils/apiErrorMessage";
import type { MyScheduleResponse, ScheduleEvent, ScheduleEventDetail, ScheduleEventType } from "../../types";

dayjs.locale("vi");

const TYPE_LABEL: Record<ScheduleEventType, string> = {
  payment: "Thanh toán",
  contract: "Hợp đồng",
  maintenance: "Bảo trì",
  event: "Sự kiện KTX",
};

/** Màu theo spec: đỏ / xanh / cam / tím */
function typeBadgeClass(t: ScheduleEventType): string {
  if (t === "payment") return "text-bg-danger";
  if (t === "contract") return "text-bg-primary";
  if (t === "maintenance") return "text-bg-warning text-dark";
  return ""; // tím — Bootstrap không có sẵn
}

function typeBadgeStyle(t: ScheduleEventType): React.CSSProperties | undefined {
  if (t === "event") return { backgroundColor: "#6f42c1", color: "#fff" };
  return undefined;
}

function dayKey(d: dayjs.Dayjs): string {
  return d.format("YYYY-MM-DD");
}

function eventOnDay(ev: ScheduleEvent, d: dayjs.Dayjs): boolean {
  const key = dayKey(d);
  const s = dayjs(ev.startDate).format("YYYY-MM-DD");
  const e = dayjs(ev.endDate).format("YYYY-MM-DD");
  return key >= s && key <= e;
}

const WEEKDAYS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

const CalendarPage: React.FC = () => {
  const [cursorMonth, setCursorMonth] = useState(() => dayjs().startOf("month"));
  const [view, setView] = useState<"month" | "list">("month");
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<Record<ScheduleEventType, boolean>>({
    payment: true,
    contract: true,
    maintenance: true,
    event: true,
  });

  const [dayModal, setDayModal] = useState<dayjs.Dayjs | null>(null);
  const [detailModal, setDetailModal] = useState<ScheduleEvent | null>(null);
  const [detailBody, setDetailBody] = useState<ScheduleEventDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const filtered = useMemo(
    () => events.filter((e) => filter[e.type as ScheduleEventType] !== false),
    [events, filter]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const from = cursorMonth.startOf("month").format("YYYY-MM-DD");
      const to = cursorMonth.endOf("month").format("YYYY-MM-DD");
      const { data } = await scheduleApi.getMy({ from, to });
      const body = data as MyScheduleResponse;
      setEvents(Array.isArray(body.events) ? body.events : []);
    } catch (e) {
      setErr(apiErrorMessage(e));
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [cursorMonth]);

  useEffect(() => {
    void load();
  }, [load]);

  const openEvent = async (ev: ScheduleEvent) => {
    setDetailModal(ev);
    setDetailBody(null);
    setDetailLoading(true);
    try {
      const { data } = await scheduleApi.getEvent(ev.id);
      setDetailBody(data as ScheduleEventDetail);
    } catch (e) {
      setErr(apiErrorMessage(e));
      setDetailModal(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const gridDays = useMemo(() => {
    const start = cursorMonth.startOf("month");
    const pad = start.day(); // 0 = CN
    const gridStart = start.subtract(pad, "day");
    return Array.from({ length: 42 }, (_, i) => gridStart.add(i, "day"));
  }, [cursorMonth]);

  const listSorted = useMemo(
    () => [...filtered].sort((a, b) => dayjs(a.startDate).valueOf() - dayjs(b.startDate).valueOf()),
    [filtered]
  );

  return (
    <div className="container pb-5" style={{ maxWidth: 1100 }}>
      <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
        <div>
          <h4 className="mb-1">Lịch của tôi</h4>
          <p className="text-muted small mb-0">
            Hạn thanh toán, hợp đồng, gia hạn, khai báo bảo trì và các kỳ đăng ký KTX — dữ liệu được tổng hợp tự động.
          </p>
        </div>
        <div className="btn-group">
          <button type="button" className={`btn btn-sm ${view === "month" ? "btn-primary" : "btn-outline-primary"}`} onClick={() => setView("month")}>
            Tháng
          </button>
          <button type="button" className={`btn btn-sm ${view === "list" ? "btn-primary" : "btn-outline-primary"}`} onClick={() => setView("list")}>
            Danh sách
          </button>
        </div>
      </div>

      {err && <div className="alert alert-danger py-2">{err}</div>}

      <div className="card shadow-sm mb-3">
        <div className="card-body py-2">
          <div className="small fw-semibold text-muted mb-2">Lọc theo loại</div>
          <div className="d-flex flex-wrap gap-2">
            {(Object.keys(TYPE_LABEL) as ScheduleEventType[]).map((t) => (
              <label key={t} className="form-check form-check-inline small mb-0">
                <input
                  className="form-check-input"
                  type="checkbox"
                  checked={filter[t]}
                  onChange={() => setFilter((f) => ({ ...f, [t]: !f[t] }))}
                />
                <span className="form-check-label">{TYPE_LABEL[t]}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
        <div className="btn-group">
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setCursorMonth((m) => m.subtract(1, "month"))}>
            « Trước
          </button>
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setCursorMonth(dayjs().startOf("month"))}>
            Hôm nay
          </button>
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setCursorMonth((m) => m.add(1, "month"))}>
            Sau »
          </button>
        </div>
        <h5 className="mb-0 text-capitalize">{cursorMonth.format("MMMM [năm] YYYY")}</h5>
      </div>

      {loading ? (
        <div className="text-center py-5">
          <div className="spinner-border text-primary" />
        </div>
      ) : view === "list" ? (
        <div className="card shadow-sm">
          <div className="card-header bg-white fw-semibold">Sự kiện trong tháng</div>
          <div className="table-responsive">
            <table className="table table-sm table-hover mb-0 align-middle">
              <thead className="table-light">
                <tr>
                  <th>Ngày bắt đầu</th>
                  <th>Ngày kết thúc</th>
                  <th>Loại</th>
                  <th>Tiêu đề</th>
                  <th className="text-end">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {listSorted.map((ev) => (
                  <tr key={ev.id}>
                    <td className="text-nowrap small">{dayjs(ev.startDate).format("DD/MM/YYYY HH:mm")}</td>
                    <td className="text-nowrap small">{dayjs(ev.endDate).format("DD/MM/YYYY HH:mm")}</td>
                    <td>
                      <span className={`badge ${typeBadgeClass(ev.type)}`} style={typeBadgeStyle(ev.type)}>
                        {TYPE_LABEL[ev.type]}
                      </span>
                    </td>
                    <td>{ev.title}</td>
                    <td className="text-end">
                      <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => void openEvent(ev)}>
                        Chi tiết
                      </button>
                    </td>
                  </tr>
                ))}
                {listSorted.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center text-muted py-4">
                      Không có sự kiện trong tháng (hoặc đã lọc hết).
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card shadow-sm">
          <div className="card-body p-2">
            <div className="row g-0 text-center small fw-semibold text-muted border-bottom py-1 mx-0">
              {WEEKDAYS.map((w) => (
                <div key={w} className="col">
                  {w}
                </div>
              ))}
            </div>
            {Array.from({ length: 6 }, (_, row) => (
              <div key={row} className="row g-0">
                {gridDays.slice(row * 7, row * 7 + 7).map((d) => {
                const inMonth = d.month() === cursorMonth.month();
                const dayEvents = filtered.filter((ev) => eventOnDay(ev, d));
                const isToday = d.isSame(dayjs(), "day");
                return (
                  <div key={d.toISOString()} className="col border p-1" style={{ minHeight: 108 }}>
                    <button
                      type="button"
                      className={`btn btn-sm p-0 mb-1 ${inMonth ? "text-dark" : "text-muted"} ${isToday ? "fw-bold text-primary" : ""}`}
                      style={{ lineHeight: 1.2, fontSize: 13 }}
                      onClick={() => setDayModal(d)}
                    >
                      {d.date()}
                    </button>
                    <div className="d-flex flex-column gap-1">
                      {dayEvents.slice(0, 3).map((ev) => (
                        <button
                          key={ev.id}
                          type="button"
                          className={`badge text-start text-truncate w-100 border-0 ${typeBadgeClass(ev.type)}`}
                          style={{ ...typeBadgeStyle(ev.type), fontSize: 10, cursor: "pointer" }}
                          title={`${ev.title}\n${ev.description || ""}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            void openEvent(ev);
                          }}
                        >
                          {ev.title}
                        </button>
                      ))}
                      {dayEvents.length > 3 && (
                        <button type="button" className="btn btn-link btn-sm p-0" style={{ fontSize: 11 }} onClick={() => setDayModal(d)}>
                          +{dayEvents.length - 3} sự kiện
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              </div>
            ))}
          </div>
        </div>
      )}

      {dayModal && (
        <div className="modal fade show d-block" tabIndex={-1} style={{ background: "rgba(0,0,0,0.45)" }}>
          <div className="modal-dialog modal-dialog-scrollable">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Sự kiện — {dayModal.format("DD/MM/YYYY")}</h5>
                <button type="button" className="btn-close" aria-label="Đóng" onClick={() => setDayModal(null)} />
              </div>
              <div className="modal-body">
                {filtered.filter((ev) => eventOnDay(ev, dayModal)).length === 0 ? (
                  <p className="text-muted small mb-0">Không có sự kiện nào.</p>
                ) : (
                  <ul className="list-group list-group-flush">
                    {filtered
                      .filter((ev) => eventOnDay(ev, dayModal))
                      .map((ev) => (
                        <li key={ev.id} className="list-group-item d-flex justify-content-between align-items-start gap-2">
                          <div>
                            <span className={`badge me-1 ${typeBadgeClass(ev.type)}`} style={typeBadgeStyle(ev.type)}>
                              {TYPE_LABEL[ev.type]}
                            </span>
                            <span className="small fw-semibold">{ev.title}</span>
                            <div className="small text-muted">{ev.description}</div>
                          </div>
                          <button type="button" className="btn btn-sm btn-outline-primary shrink-0" onClick={() => void openEvent(ev)}>
                            Chi tiết
                          </button>
                        </li>
                      ))}
                  </ul>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setDayModal(null)}>
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {(detailModal || detailLoading) && (
        <div className="modal fade show d-block" tabIndex={-1} style={{ background: "rgba(0,0,0,0.45)" }}>
          <div className="modal-dialog modal-dialog-scrollable modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">{detailLoading && detailModal ? detailModal.title : "Chi tiết sự kiện"}</h5>
                <button
                  type="button"
                  className="btn-close"
                  aria-label="Đóng"
                  onClick={() => {
                    setDetailModal(null);
                    setDetailBody(null);
                  }}
                />
              </div>
              <div className="modal-body">
                {detailLoading && (
                  <div className="text-center py-4">
                    <div className="spinner-border spinner-border-sm text-primary" />
                  </div>
                )}
                {!detailLoading && detailBody && (
                  <div className="small">
                    <p>
                      <span className={`badge ${typeBadgeClass(detailBody.type)}`} style={typeBadgeStyle(detailBody.type)}>
                        {TYPE_LABEL[detailBody.type]}
                      </span>
                    </p>
                    <h6>{detailBody.title}</h6>
                    <p className="text-muted">{detailBody.description}</p>
                    <p>
                      <strong>Bắt đầu:</strong> {dayjs(detailBody.startDate).format("DD/MM/YYYY HH:mm")}
                      <br />
                      <strong>Kết thúc:</strong> {dayjs(detailBody.endDate).format("DD/MM/YYYY HH:mm")}
                    </p>
                    {detailBody.status && (
                      <p>
                        <strong>Trạng thái:</strong> {detailBody.status}
                      </p>
                    )}
                    {detailBody.images && detailBody.images.length > 0 && (
                      <div className="d-flex flex-wrap gap-1 mb-2">
                        {detailBody.images.map((src, i) => (
                          <a key={i} href={src} target="_blank" rel="noopener noreferrer" className="border rounded" style={{ width: 80, height: 80 }}>
                            <img src={src} alt="" className="w-100 h-100 object-fit-cover rounded" style={{ objectFit: "cover" }} />
                          </a>
                        ))}
                      </div>
                    )}
                    {detailBody.raw && (
                      <details className="mt-2">
                        <summary className="small text-muted">Dữ liệu gốc (JSON)</summary>
                        <pre className="small bg-light p-2 rounded mt-1 mb-0" style={{ maxHeight: 240, overflow: "auto" }}>
                          {JSON.stringify(detailBody.raw, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setDetailModal(null);
                    setDetailBody(null);
                  }}
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CalendarPage;
