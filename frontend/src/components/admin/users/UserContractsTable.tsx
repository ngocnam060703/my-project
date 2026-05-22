import React, { useMemo } from "react";
import { Empty, Table, Tag, Tooltip } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import type { Bill, Contract, Bed } from "../../../types";

function contractAreaName(c: Contract): string {
  const r = c.room;
  if (!r || typeof r !== "object") return "—";
  const a = r.area;
  if (a && typeof a === "object" && "name" in a) return String((a as { name?: string }).name || "") || "—";
  return "—";
}

function contractBedCode(c: Contract): string {
  const b = c.bed;
  if (!b) return "—";
  if (typeof b === "object" && b !== null && "code" in b) return String((b as Bed).code || "") || "—";
  return "—";
}

function formatBedEquipmentVi(raw: string | undefined | null): string {
  const k = String(raw || "").trim().toLowerCase();
  if (!k) return "—";
  const map: Record<string, string> = {
    good: "Tốt",
    ok: "Tốt",
    excellent: "Tốt",
    maintenance: "Bảo trì",
    maintaining: "Bảo trì",
    repair: "Bảo trì",
    broken: "Hỏng",
    damaged: "Hỏng",
    bad: "Hỏng",
    poor: "Hỏng",
  };
  return map[k] || String(raw ?? "").trim();
}

function contractIdsWithOverdueBills(bills: Bill[] | undefined): Set<string> {
  const s = new Set<string>();
  for (const b of bills || []) {
    if (String(b.status) !== "overdue") continue;
    const c = b.contract;
    const id = c && typeof c === "object" && "_id" in c ? String((c as Contract)._id) : c ? String(c) : "";
    if (id) s.add(id);
  }
  return s;
}

function contractEnterpriseBadge(
  c: Pick<Contract, "status" | "endDate" | "_id">,
  overdueContractIds: Set<string>,
): { color: string; text: string } {
  const now = dayjs();
  const end = c.endDate ? dayjs(c.endDate) : null;
  if (overdueContractIds.has(String(c._id))) return { color: "red", text: "Quá hạn TT" };
  if (c.status === "active" && end && end.isBefore(now, "day")) return { color: "orange", text: "Hết hạn" };
  if (c.status === "active") return { color: "green", text: "Đang hiệu lực" };
  if (c.status === "pending_payment") return { color: "gold", text: "Chờ thanh toán" };
  if (c.status === "expired") return { color: "default", text: "Đã hết hạn" };
  if (c.status === "terminated") return { color: "default", text: "Đã chấm dứt" };
  return { color: "default", text: String(c.status || "—") };
}

export interface UserContractsTableProps {
  contracts: Contract[];
  overdueBills?: Bill[];
}

const UserContractsTable: React.FC<UserContractsTableProps> = ({ contracts, overdueBills }) => {
  const overdueIds = useMemo(() => contractIdsWithOverdueBills(overdueBills), [overdueBills]);

  const columns: ColumnsType<Contract> = useMemo(
    () => [
      {
        title: "Số HĐ",
        dataIndex: "contractNumber",
        key: "cn",
        width: 120,
        fixed: "left",
        ellipsis: true,
        render: (v: string) => v || "—",
      },
      {
        title: "Khu",
        key: "area",
        width: 120,
        ellipsis: true,
        render: (_: unknown, c) => contractAreaName(c),
      },
      {
        title: "Phòng",
        key: "room",
        width: 72,
        align: "center",
        render: (_: unknown, c) => (typeof c.room === "object" && c.room ? c.room.roomNumber : "—"),
      },
      {
        title: "Giá phòng",
        key: "roomFee",
        width: 130,
        render: (_: unknown, c) => {
          const r = typeof c.room === "object" ? c.room : null;
          if (!r || r.price == null) return "—";
          const slots = Math.max(1, Number(r.capacity) || 1);
          const full = Math.round(Number(r.price));
          const per = Math.round(full / slots);
          const text = `${full.toLocaleString("vi-VN")}đ · ${per.toLocaleString("vi-VN")}đ/slot`;
          return (
            <Tooltip title={`Tổng ${full.toLocaleString("vi-VN")}đ/th · ${slots} slot → ${per.toLocaleString("vi-VN")}đ/slot/th`}>
              <span style={{ whiteSpace: "nowrap" }}>{text}</span>
            </Tooltip>
          );
        },
      },
      {
        title: "Giường",
        key: "bedSlot",
        width: 88,
        ellipsis: true,
        render: (_: unknown, c) => contractBedCode(c),
      },
      {
        title: "TT giường",
        key: "bedEq",
        width: 96,
        ellipsis: true,
        render: (_: unknown, c) => {
          const b = c.bed;
          const raw = b && typeof b === "object" && "equipmentStatus" in b ? String((b as Bed).equipmentStatus || "") : "";
          return formatBedEquipmentVi(raw);
        },
      },
      {
        title: "Trạng thái",
        key: "st",
        width: 130,
        render: (_: unknown, c) => {
          const { color, text } = contractEnterpriseBadge(c, overdueIds);
          return (
            <Tag color={color} style={{ fontWeight: 600, margin: 0 }}>
              {text}
            </Tag>
          );
        },
      },
      {
        title: "Bắt đầu",
        dataIndex: "startDate",
        key: "sd",
        width: 100,
        render: (d: string) => (d ? dayjs(d).format("DD/MM/YY") : "—"),
      },
      {
        title: "Kết thúc",
        dataIndex: "endDate",
        key: "ed",
        width: 100,
        render: (d: string) => (d ? dayjs(d).format("DD/MM/YY") : "—"),
      },
    ],
    [overdueIds],
  );

  if (!contracts.length) {
    return <Empty description="Chưa có hợp đồng KTX" />;
  }

  return (
    <div className="user-detail-table-wrap">
      <Table<Contract>
        size="small"
        rowKey="_id"
        columns={columns}
        dataSource={contracts}
        pagination={false}
        scroll={{ x: 980 }}
        tableLayout="fixed"
      />
    </div>
  );
};

export default UserContractsTable;
