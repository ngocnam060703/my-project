import React from "react";
import {
  Button,
  Card,
  Descriptions,
  Empty,
  Grid,
  Space,
  Table,
  Tabs,
  Tag,
} from "antd";
import {
  BookOutlined,
  FileTextOutlined,
  HomeOutlined,
  IdcardOutlined,
  LoginOutlined,
  LogoutOutlined,
  PhoneOutlined,
  SwapOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import PriorityPolicyCard from "./PriorityPolicyCard";
import UserContractsTable from "./UserContractsTable";
import type { AdminUserDetailResponse, Bill, Contract, Room, StayHistoryRow, User, Violation } from "../../../types";
import {
  contractBedCode,
  contractBedComposite,
  contractBedEquipment,
  formatParentLine,
  formatStayHistoryDateVi,
  inferFacultyGroupFromMajor,
  occupancyOperationalBadgeLarge,
  residencyStayStatusDisplay,
  slotPriceVnd,
  violationSeverityLabel,
} from "./studentProfileDetailUtils";
import type { Bed } from "../../../types";
import { joinResidenceAddressPlain } from "../../../utils/addressDisplay";
import { PRIORITY_OPTIONS } from "../../../utils/priorityDisplay";

export type StudentProfileDetailSectionsProps = {
  detailPayload: AdminUserDetailResponse;
  student: User;
  majorOptions: Array<{ _id: string; code?: string; name: string; faculty?: string; isActive?: boolean }>;
  ensureBedLoading: boolean;
  onEnsureBed: () => void;
  onQuickCheckIn: () => void;
  onQuickCheckout: () => void;
  onOpenRoom: (roomId: string) => void;
  onOpenContract: (contractId: string) => void;
  onOpenTransfer: (roomId: string, contractId: string) => void;
};

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10, fontWeight: 600, fontSize: 15, color: "#111827" }}>{children}</div>
  );
}

function ProfileTabPanel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "#f0fdfa",
        borderRadius: 12,
        padding: "16px 20px",
        border: "1px solid #99f6e4",
      }}
    >
      {children}
    </div>
  );
}

const profileTabDescProps = {
  column: 1 as const,
  size: "small" as const,
  styles: {
    label: { color: "#6b7280", fontWeight: 600, width: "38%" },
    content: { fontWeight: 500, color: "#111827" },
  },
};

const StudentProfileDetailSections: React.FC<StudentProfileDetailSectionsProps> = ({
  detailPayload,
  student: du,
  majorOptions,
  ensureBedLoading,
  onEnsureBed,
  onQuickCheckIn,
  onQuickCheckout,
  onOpenRoom,
  onOpenContract,
  onOpenTransfer,
}) => {
  const screens = Grid.useBreakpoint();
  const currentContract = detailPayload.currentContract as Contract | null;
  const currentRoom = detailPayload.currentRoom;
  const facultyGroup = du?.facultyGroup || inferFacultyGroupFromMajor(du?.major, majorOptions) || "—";
  const priorityLabel =
    PRIORITY_OPTIONS.find((item) => item.value === (du?.priorityType || "normal"))?.label || "Bình thường";
  const residenceAddressMerged = joinResidenceAddressPlain(du?.addressPermanent, du?.addressTemporary);

  const tabLabel = (icon: React.ReactNode, text: string) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span style={{ color: "#0d9488", fontSize: 15, display: "flex" }}>{icon}</span>
      <span style={{ fontWeight: 600 }}>{text}</span>
    </span>
  );

  return (
    <>
      <Card
        size="small"
        title={<span style={{ fontWeight: 600 }}>Chi tiết hồ sơ sinh viên</span>}
        style={{ borderRadius: 12, marginBottom: 8 }}
        styles={{ body: { paddingTop: 8 } }}
      >
        <Tabs
          defaultActiveKey="basic"
          tabPosition={screens.md ? "left" : "top"}
          size="middle"
          items={[
            {
              key: "basic",
              label: tabLabel(<IdcardOutlined />, "Thông tin cơ bản"),
              children: (
                <ProfileTabPanel>
                  <Descriptions {...profileTabDescProps}>
                    <Descriptions.Item label="MSSV">{du?.studentId || "—"}</Descriptions.Item>
                    <Descriptions.Item label="Ngày sinh">
                      {du?.dateOfBirth ? dayjs(du.dateOfBirth).format("DD/MM/YYYY") : "—"}
                    </Descriptions.Item>
                    <Descriptions.Item label="Giới tính">{du?.gender || "—"}</Descriptions.Item>
                    <Descriptions.Item label="Quê quán / địa chỉ liên hệ">
                      <span className="user-detail-long-text">{du?.address || "—"}</span>
                    </Descriptions.Item>
                    <Descriptions.Item label="CCCD / CMND">{du?.citizenId || "—"}</Descriptions.Item>
                    <Descriptions.Item label="Dân tộc">{du?.ethnicity || "—"}</Descriptions.Item>
                  </Descriptions>
                </ProfileTabPanel>
              ),
            },
            {
              key: "edu",
              label: tabLabel(<BookOutlined />, "Học vấn"),
              children: (
                <ProfileTabPanel>
                  <Descriptions {...profileTabDescProps}>
                    <Descriptions.Item label="Lớp">{du?.className || "—"}</Descriptions.Item>
                    <Descriptions.Item label="Khoa/nhóm ngành">{facultyGroup}</Descriptions.Item>
                    <Descriptions.Item label="Ngành">{du?.major || "—"}</Descriptions.Item>
                    <Descriptions.Item label="Khóa">{du?.faculty || "—"}</Descriptions.Item>
                    <Descriptions.Item label="Ngày nhập học">
                      {du?.enrollmentDate ? dayjs(du.enrollmentDate).format("DD/MM/YYYY") : "—"}
                    </Descriptions.Item>
                    <Descriptions.Item label="GVCN">{du?.homeroomTeacher || "—"}</Descriptions.Item>
                  </Descriptions>
                </ProfileTabPanel>
              ),
            },
            {
              key: "contact",
              label: tabLabel(<PhoneOutlined />, "Liên hệ"),
              children: (
                <ProfileTabPanel>
                  <Descriptions {...profileTabDescProps}>
                    <Descriptions.Item label="Số điện thoại">{du?.phone || "—"}</Descriptions.Item>
                    <Descriptions.Item label="Email">{du?.email || "—"}</Descriptions.Item>
                  </Descriptions>
                </ProfileTabPanel>
              ),
            },
            {
              key: "extended",
              label: tabLabel(<IdcardOutlined />, "Hồ sơ mở rộng"),
              children: (
                <ProfileTabPanel>
                  <Descriptions {...profileTabDescProps}>
                    <Descriptions.Item label="Quê quán">{du?.addressNative || "—"}</Descriptions.Item>
                    <Descriptions.Item label="Địa chỉ thường trú - tạm trú">
                      <span className="user-detail-long-text" style={{ whiteSpace: "pre-line" }}>
                        {residenceAddressMerged}
                      </span>
                    </Descriptions.Item>
                    <Descriptions.Item label="Diện ưu tiên">{priorityLabel}</Descriptions.Item>
                    <Descriptions.Item label="Phụ huynh (cha)">
                      {formatParentLine(du?.familyFatherName, du?.familyFatherPhone)}
                    </Descriptions.Item>
                    <Descriptions.Item label="Phụ huynh (mẹ)">
                      {formatParentLine(du?.familyMotherName, du?.familyMotherPhone)}
                    </Descriptions.Item>
                    <Descriptions.Item label="SĐT liên hệ khẩn cấp">{du?.familyEmergencyPhone || "—"}</Descriptions.Item>
                  </Descriptions>
                  <div style={{ marginTop: 12 }}>
                    <PriorityPolicyCard priorityType={du?.priorityType} priorityProofUrl={du?.priorityProofUrl} />
                  </div>
                </ProfileTabPanel>
              ),
            },
            {
              key: "room",
              label: tabLabel(<HomeOutlined />, "Nơi ở hiện tại"),
              children: (
                <ProfileTabPanel>
                  <Descriptions {...profileTabDescProps}>
                    <Descriptions.Item label="Phòng đang ở">
                      {currentRoom && typeof currentRoom === "object" ? (
                        <Space orientation="vertical" size={2}>
                          <span>
                            Phòng <strong>{currentRoom.roomNumber}</strong>
                            {typeof currentRoom.area === "object" && currentRoom.area ? (
                              <span>
                                {" "}
                                — Khu <strong>{currentRoom.area.name}</strong>
                              </span>
                            ) : null}
                          </span>
                          <span style={{ color: "#6b7280", fontSize: 12 }}>
                            Sức chứa: <strong>{currentRoom.capacity ?? "—"}</strong>
                            {" · "}Đang ở: <strong>{currentRoom.currentOccupancy ?? "—"}</strong>
                          </span>
                        </Space>
                      ) : (
                        "—"
                      )}
                    </Descriptions.Item>
                    <Descriptions.Item label="Giường được phân">
                      {currentContract ? contractBedCode(currentContract) : "—"}
                    </Descriptions.Item>
                    <Descriptions.Item label="Mã slot (phòng–giường)">
                      {currentContract ? contractBedComposite(currentContract) : "—"}
                    </Descriptions.Item>
                    <Descriptions.Item label="Trạng thái giường">
                      {currentContract ? contractBedEquipment(currentContract) : "—"}
                    </Descriptions.Item>
                    <Descriptions.Item label="Giá slot / tháng">
                      {currentRoom && typeof currentRoom === "object"
                        ? `${slotPriceVnd(currentRoom).toLocaleString("vi-VN")}đ`
                        : "—"}
                    </Descriptions.Item>
                    <Descriptions.Item label="Ngày check-in thực tế">
                      {(() => {
                        const b = currentContract?.bed;
                        const cin = b && typeof b === "object" ? (b as Bed).checkInAt : null;
                        return cin ? dayjs(cin).format("DD/MM/YYYY HH:mm") : "—";
                      })()}
                    </Descriptions.Item>
                    <Descriptions.Item label="Trạng thái cư trú">
                      {(() => {
                        const meta = occupancyOperationalBadgeLarge(
                          detailPayload.residencyOperationalStatus,
                          detailPayload.stayHistory?.length || 0,
                        );
                        if (!meta) return detailPayload.residencyOperationalStatus || "—";
                        return (
                          <span
                            style={{
                              display: "inline-block",
                              padding: "6px 12px",
                              borderRadius: 8,
                              fontWeight: 600,
                              background: meta.bg,
                              border: `1px solid ${meta.border}`,
                            }}
                          >
                            {meta.text}
                          </span>
                        );
                      })()}
                    </Descriptions.Item>
                  </Descriptions>
                </ProfileTabPanel>
              ),
            },
          ]}
        />
      </Card>

      <div className="user-detail-section">
        <SectionTitle>Thao tác nhanh</SectionTitle>
        <Space wrap>
          <Button
            icon={<HomeOutlined />}
            disabled={!currentRoom || typeof currentRoom !== "object"}
            onClick={() => {
              const room = currentRoom as Room | null;
              if (!room?._id) return;
              onOpenRoom(room._id);
            }}
          >
            Xem phòng
          </Button>
          <Button
            icon={<FileTextOutlined />}
            disabled={!currentContract?._id}
            onClick={() => {
              const id = String(currentContract?._id || "");
              if (!id) return;
              onOpenContract(id);
            }}
          >
            Xem hợp đồng
          </Button>
          <Button
            type="primary"
            icon={<LoginOutlined />}
            disabled={
              detailPayload.residencyOperationalStatus !== "assigned_pending_checkin" ||
              !currentRoom ||
              typeof currentRoom !== "object" ||
              !currentContract?.bed ||
              typeof currentContract.bed !== "object"
            }
            onClick={onQuickCheckIn}
          >
            Check-in
          </Button>
          <Button
            danger
            icon={<LogoutOutlined />}
            disabled={
              detailPayload.residencyOperationalStatus !== "checked_in_staying" ||
              !currentContract?.bed ||
              typeof currentContract.bed !== "object"
            }
            onClick={onQuickCheckout}
          >
            Check-out
          </Button>
          <Button
            icon={<SwapOutlined />}
            disabled={
              !(currentRoom && typeof currentRoom === "object") ||
              !currentContract?._id ||
              !currentContract?.bed ||
              typeof currentContract.bed !== "object" ||
              !["assigned_pending_checkin", "checked_in_staying"].includes(
                String(detailPayload.residencyOperationalStatus || ""),
              )
            }
            onClick={() => {
              const room = currentRoom as Room;
              const cid = String(currentContract?._id || "");
              onOpenTransfer(room._id, cid);
            }}
          >
            Chuyển giường
          </Button>
        </Space>
      </div>

      <div className="user-detail-section" style={{ marginTop: 20 }}>
        <SectionTitle>Hợp đồng KTX</SectionTitle>
        <UserContractsTable
          contracts={detailPayload.contracts || []}
          overdueBills={detailPayload.financialSummary?.unpaidBills}
        />
        <Space wrap style={{ marginTop: 12 }}>
          {currentContract && ["active", "pending_payment"].includes(String(currentContract.status)) ? (
            <Button type="primary" loading={ensureBedLoading} onClick={onEnsureBed}>
              Gán giường / đồng bộ giường
            </Button>
          ) : null}
        </Space>
      </div>

      <div className="user-detail-section" style={{ marginTop: 20 }}>
        <SectionTitle>Lịch sử cư trú</SectionTitle>
        <p style={{ margin: "0 0 12px 0", color: "#6b7280", fontSize: 13 }}>
          Một dòng một hợp đồng; check-in/out theo BedHistory. Chưa check-out → «—».
        </p>
        <div className="user-detail-table-wrap">
          <Table<StayHistoryRow>
            size="small"
            rowKey={(r) => String(r.contractId)}
            pagination={false}
            scroll={{ x: 1320 }}
            dataSource={detailPayload.stayHistory || []}
            locale={{
              emptyText: "Chưa có lịch sử — sinh viên chưa có hợp đồng hoặc chưa ghi nhận slot.",
            }}
            columns={[
              {
                title: "Sinh viên",
                key: "studentName",
                width: 150,
                ellipsis: true,
                fixed: "left",
                render: (_: unknown, r: StayHistoryRow) => r.studentName || du?.fullName || "—",
              },
              {
                title: "MSSV",
                key: "studentId",
                width: 100,
                ellipsis: true,
                render: (_: unknown, r: StayHistoryRow) => r.studentId || du?.studentId || "—",
              },
              {
                title: "Khu",
                dataIndex: "areaName",
                key: "areaName",
                width: 130,
                ellipsis: true,
                render: (v?: string) => v || "—",
              },
              {
                title: "Phòng",
                dataIndex: "roomNumber",
                key: "roomNumber",
                width: 88,
                render: (v?: string) => v || "—",
              },
              {
                title: "Giường / Slot",
                dataIndex: "bedSlotDisplay",
                key: "slot",
                width: 110,
                ellipsis: true,
                render: (_: unknown, r: StayHistoryRow) => r.bedSlotDisplay || r.bedCode || "—",
              },
              {
                title: "Ngày check-in",
                key: "checkInAt",
                width: 118,
                render: (_: unknown, r: StayHistoryRow) => formatStayHistoryDateVi(r.checkInAt ?? null),
              },
              {
                title: "Ngày check-out",
                key: "checkOutAt",
                width: 118,
                render: (_: unknown, r: StayHistoryRow) => formatStayHistoryDateVi(r.checkOutAt ?? null),
              },
              {
                title: "Trạng thái cư trú",
                key: "staySt",
                width: 150,
                render: (_: unknown, r: StayHistoryRow) => {
                  const m = residencyStayStatusDisplay(r.residencyStayStatus);
                  return (
                    <Tag color={m.color} style={{ fontWeight: 600 }}>
                      {m.emoji ? `${m.emoji} ` : ""}
                      {m.text}
                    </Tag>
                  );
                },
              },
              {
                title: "Hợp đồng",
                dataIndex: "contractNumber",
                key: "contractNumber",
                width: 140,
                ellipsis: true,
                render: (v?: string) => v || "—",
              },
              {
                title: "Ghi chú",
                dataIndex: "note",
                key: "note",
                ellipsis: true,
                render: (v?: string) => v || "—",
              },
            ]}
          />
        </div>
      </div>

      <div className="user-detail-section" style={{ marginTop: 20 }}>
        <SectionTitle>Công nợ & hóa đơn</SectionTitle>
        {detailPayload.financialSummary ? (
          <>
            <div
              style={{
                marginBottom: 8,
                color: "#6b7280",
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                alignItems: "center",
              }}
            >
              <span>
                Tổng còn nợ:{" "}
                <strong style={{ color: "#b45309" }}>
                  {(detailPayload.financialSummary.debtTotal || 0).toLocaleString("vi-VN")}đ
                </strong>
                {" · "}
                Chưa thanh toán: <strong>{detailPayload.financialSummary.unpaidCount ?? 0}</strong> hóa đơn
              </span>
              {(detailPayload.financialSummary.unpaidBills || []).some((x) => String(x.status) === "overdue") ? (
                <Tag color="red" icon={<WarningOutlined />} style={{ fontWeight: 600 }}>
                  Có hóa đơn quá hạn
                </Tag>
              ) : null}
            </div>
            <Table<Bill>
              size="small"
              rowKey="_id"
              pagination={false}
              dataSource={detailPayload.financialSummary.unpaidBills || []}
              locale={{ emptyText: "Không có hóa đơn chưa thanh toán" }}
              columns={[
                {
                  title: "Tháng",
                  key: "period",
                  render: (_: unknown, b: Bill) => `${String(b.month).padStart(2, "0")}/${b.year}`,
                },
                {
                  title: "Tổng tiền",
                  dataIndex: "total",
                  render: (v: number) => `${Number(v || 0).toLocaleString("vi-VN")}đ`,
                },
                {
                  title: "Hạn TT",
                  dataIndex: "dueDate",
                  render: (d: string) => (d ? dayjs(d).format("DD/MM/YYYY") : "—"),
                },
                {
                  title: "Trạng thái",
                  dataIndex: "status",
                  render: (s: string) =>
                    String(s) === "overdue" ? (
                      <Tag color="red" icon={<WarningOutlined />} style={{ fontWeight: 600 }}>
                        Quá hạn
                      </Tag>
                    ) : (
                      <Tag color={s === "paid" ? "green" : s === "pending" || s === "unpaid" ? "orange" : "default"}>
                        {s === "paid"
                          ? "Đã thanh toán"
                          : s === "unpaid"
                            ? "Chưa TT"
                            : s === "pending"
                              ? "Chờ TT"
                              : s}
                      </Tag>
                    ),
                },
              ]}
            />
          </>
        ) : (
          <Empty description="Không có dữ liệu công nợ" />
        )}
      </div>

      <div className="user-detail-section" style={{ marginTop: 20 }}>
        <SectionTitle>Lịch sử vi phạm (gần đây)</SectionTitle>
        {detailPayload.violationsRecent && detailPayload.violationsRecent.length > 0 ? (
          <Table<Violation>
            size="small"
            rowKey="_id"
            pagination={false}
            dataSource={detailPayload.violationsRecent}
            columns={[
              {
                title: "Ngày",
                dataIndex: "createdAt",
                render: (d?: string) => (d ? dayjs(d).format("DD/MM/YYYY") : "—"),
              },
              {
                title: "Vi phạm",
                key: "rule",
                render: (_: unknown, r: Violation) => r.ruleName || r.description || "—",
              },
              {
                title: "Mức độ",
                dataIndex: "severity",
                render: (s: string) => {
                  const meta = violationSeverityLabel(s);
                  return <Tag color={meta.color}>{meta.text}</Tag>;
                },
              },
            ]}
          />
        ) : (
          <Empty description="Chưa có vi phạm ghi nhận" />
        )}
      </div>

    </>
  );
};

export default StudentProfileDetailSections;
