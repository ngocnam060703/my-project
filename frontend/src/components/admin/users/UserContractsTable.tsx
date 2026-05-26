import React, { useMemo } from "react";
import { Empty, Table, Tag, Tooltip } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import type { Bill, Contract, Bed } from "../../../types";
import {
  CONTRACT_STATUS_TAG_CLASS,
  contractStatusAntTagAdmin,
  contractStatusTagWrapStyle,
} from "../../../utils/contractStatusDisplay";

function contractAreaName(c: Contract): string {
  const r = c.room;
  if (!r || typeof r !== "object") return "—";
  const a = r.area;
  if (a && typeof a === "object" && "name" in a) return String((a as { name?: string }).name || "") || "—";
  return "—";
}

function contractBedCode(c: Contract): string {
  const b = c.bed;
  const r = c.room;
  if (!b || typeof b !== "object") return "—";
  const roomId = r && typeof r === "object" ? String(r._id || "") : "";
  const bedRoom = String((b as Bed).room || "");
  if (roomId && bedRoom && bedRoom !== roomId) return "—";
  return String((b as Bed).code || "") || "—";
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
        width: 120,
        render: (_: unknown, c) => {
          const r = typeof c.room === "object" ? c.room : null;
          if (!r || r.price == null) return "—";
          const slots = Math.max(1, Number(r.capacity) || 1);
          const full = Math.round(Number(r.price));
          const per = Math.round(full / slots);
          return (
            <Tooltip title={`Tổng ${full.toLocaleString("vi-VN")}đ/tháng · ${slots} chỗ · ${per.toLocaleString("vi-VN")}đ/chỗ/tháng`}>
              <div style={{ lineHeight: 1.4, whiteSpace: "normal" }}>
                <div>{full.toLocaleString("vi-VN")}đ/tháng</div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>
                  {per.toLocaleString("vi-VN")}đ/chỗ · {slots} chỗ
                </div>
              </div>
            </Tooltip>
          );
        },
      },
      {
        title: "Mã giường",
        key: "bedSlot",
        width: 96,
        ellipsis: true,
        render: (_: unknown, c) => contractBedCode(c),
      },
      {
        title: "Tình trạng giường thiết bị",
        key: "bedEq",
        width: 120,
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
        width: 118,
        render: (_: unknown, c) => {
          const { color, text } = contractStatusAntTagAdmin(c, overdueIds);
          return (
            <div style={{ maxWidth: "100%", whiteSpace: "normal" }}>
              <Tag color={color} className={CONTRACT_STATUS_TAG_CLASS} style={contractStatusTagWrapStyle}>
                {text}
              </Tag>
            </div>
          );
        },
      },
      {
        title: "Bắt đầu / Kết thúc",
        key: "period",
        width: 140,
        render: (_: unknown, c) => {
          const start = c.startDate ? dayjs(c.startDate).format("DD/MM/YYYY") : "—";
          const end = c.endDate ? dayjs(c.endDate).format("DD/MM/YYYY") : "—";
          return (
            <span style={{ whiteSpace: "nowrap" }}>
              {start}
              <br />
              {end}
            </span>
          );
        },
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
