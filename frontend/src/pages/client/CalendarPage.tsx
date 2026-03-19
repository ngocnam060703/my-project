import React, { useState, useEffect } from "react";
import { Calendar, Card, List, Tag } from "antd";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import { contractsApi, billsApi } from "../../api";
import type { Contract, Bill } from "../../types";

const CalendarPage: React.FC = () => {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);

  useEffect(() => {
    contractsApi.getMy().then((r) => setContracts(r.data)).catch(() => {});
    billsApi.getMy().then((r) => setBills(r.data)).catch(() => {});
  }, []);

  const dateCellRender = (value: Dayjs) => {
    const dateStr = value.format("YYYY-MM-DD");
    const contractEnds = contracts.filter((c) => dayjs(c.endDate).format("YYYY-MM-DD") === dateStr);
    const billDue = bills.filter((b) => dayjs(b.dueDate).format("YYYY-MM-DD") === dateStr);
    return (
      <div>
        {contractEnds.map((c) => (
          <Tag key={c._id} color="orange">HĐ hết hạn: {(c.room as { roomNumber?: string })?.roomNumber}</Tag>
        ))}
        {billDue.map((b) => (
          <Tag key={b._id} color="blue">Hạn đóng tiền: {(b.room as { roomNumber?: string })?.roomNumber}</Tag>
        ))}
      </div>
    );
  };

  return (
    <div>
      <h2 style={{ marginBottom: 24 }}>Lịch của tôi</h2>
      <Card>
        <Calendar fullscreen={false} cellRender={dateCellRender} />
      </Card>
      <Card title="Sắp tới" style={{ marginTop: 24 }}>
        <List
          dataSource={[
            ...contracts.filter((c) => dayjs(c.endDate).isAfter(dayjs())).map((c) => ({ type: "contract" as const, ...c })),
            ...bills.filter((b) => b.status === "pending" && dayjs(b.dueDate).isAfter(dayjs())).map((b) => ({ type: "bill" as const, ...b })),
          ].sort((a, b) => {
            const dA = a.type === "contract" ? (a as Contract).endDate : (a as Bill).dueDate;
            const dB = b.type === "contract" ? (b as Contract).endDate : (b as Bill).dueDate;
            return dayjs(dA).valueOf() - dayjs(dB).valueOf();
          }).slice(0, 10)}
          renderItem={(item) => (
            <List.Item>
              {item.type === "contract" ? (
                <><Tag color="orange">HĐ</Tag> Phòng {(item as Contract).room?.roomNumber} - Hết hạn: {dayjs((item as Contract).endDate).format("DD/MM/YYYY")}</>
              ) : (
                <><Tag color="blue">HĐơn</Tag> Tháng {(item as Bill).month}/{(item as Bill).year} - Hạn: {dayjs((item as Bill).dueDate).format("DD/MM/YYYY")}</>
              )}
            </List.Item>
          )}
        />
      </Card>
    </div>
  );
};

export default CalendarPage;
