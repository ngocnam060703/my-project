import React, { useEffect, useMemo, useState } from "react";

export interface RoomSlotInfo {
  roomNumber: string;
  slotPrice: number;
  defaultServices: string[];
}

export interface ServiceRegistrationData {
  serviceId: string;
  serviceName: string;
  unitPrice: number;
  alreadyRegistered: number;
  isBilled: boolean;
  roomSlotInfo: RoomSlotInfo;
}

function formatMoney(value: number): string {
  return `${Math.round(value || 0).toLocaleString("vi-VN")}đ`;
}

function mockFetchServiceRegistrationData(): Promise<ServiceRegistrationData> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        serviceId: "personal-laundry",
        serviceName: "Giặt sấy cá nhân",
        unitPrice: 18000,
        alreadyRegistered: 4,
        isBilled: false,
        roomSlotInfo: {
          roomNumber: "A-302",
          slotPrice: 850000,
          defaultServices: ["Điện", "Nước", "Wifi"],
        },
      });
    }, 500);
  });
}

const PersonalServiceRegistration: React.FC = () => {
  const [data, setData] = useState<ServiceRegistrationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [newAmount, setNewAmount] = useState(0);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      const mock = await mockFetchServiceRegistrationData();
      if (!mounted) return;
      setData(mock);
      setLoading(false);
    };
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  const totalAmount = useMemo(() => {
    if (!data) return 0;
    return data.alreadyRegistered + newAmount;
  }, [data, newAmount]);

  const disabledByBilled = Boolean(data?.isBilled);
  const disableActions = disabledByBilled || submitting;

  const handleAddQuick = () => {
    if (disableActions) return;
    setNewAmount((prev) => Math.max(0, prev + 1));
  };

  const handleInputChange = (value: string) => {
    const parsed = Number(value);
    if (Number.isNaN(parsed)) {
      setNewAmount(0);
      return;
    }
    setNewAmount(Math.max(0, Math.floor(parsed)));
  };

  const handleSubmit = async () => {
    if (!data || disableActions || newAmount <= 0) return;
    setSubmitting(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 400));
      setData((prev) =>
        prev
          ? {
              ...prev,
              alreadyRegistered: prev.alreadyRegistered + newAmount,
            }
          : prev,
      );
      setNewAmount(0);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !data) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
        Đang tải dữ liệu đăng ký dịch vụ cá nhân...
      </div>
    );
  }

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
      {disabledByBilled && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          Tháng này đã chốt hóa đơn. Bạn không thể đăng ký thêm.
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <h3 className="text-base font-semibold text-slate-900">Thông tin phòng gốc</h3>
          <div className="space-y-2 text-sm text-slate-700">
            <p>
              <span className="text-slate-500">Phòng:</span> <strong>{data.roomSlotInfo.roomNumber}</strong>
            </p>
            <p>
              <span className="text-slate-500">Giá slot:</span> <strong>{formatMoney(data.roomSlotInfo.slotPrice)}</strong>
            </p>
            <div>
              <p className="text-slate-500">Dịch vụ mặc định:</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {data.roomSlotInfo.defaultServices.map((service) => (
                  <span key={service} className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">
                    {service}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="text-base font-semibold text-slate-900">Thao tác dịch vụ cá nhân</h3>
          <div className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
            Đã chốt đăng ký trước đó: {data.alreadyRegistered} lượt
          </div>
          <p className="text-sm text-slate-700">
            <span className="text-slate-500">Dịch vụ:</span> <strong>{data.serviceName}</strong> ({formatMoney(data.unitPrice)}/lượt)
          </p>

          <div className={`${disabledByBilled ? "pointer-events-none opacity-60" : ""} space-y-2`}>
            <label className="block text-sm font-medium text-slate-700" htmlFor="new-amount">
              Số lượt muốn đăng ký THÊM
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                id="new-amount"
                type="number"
                min={0}
                value={newAmount}
                onChange={(event) => handleInputChange(event.target.value)}
                className="w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-emerald-500 focus:ring-2"
                disabled={disableActions}
              />
              <button
                type="button"
                onClick={handleAddQuick}
                disabled={disableActions}
                className="rounded-lg border border-emerald-300 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                + Thêm 1 lượt
              </button>
            </div>
            <p className="text-sm text-slate-600">
              Dự toán tổng số lượt tháng này: {data.alreadyRegistered} + {newAmount} = <strong>{totalAmount}</strong> lượt
            </p>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={disableActions || newAmount <= 0}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Đang xử lý..." : "Xác nhận đăng ký thêm"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default PersonalServiceRegistration;
