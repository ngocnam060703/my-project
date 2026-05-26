import React, { useMemo } from "react";
import { Tabs } from "antd";
import { useSearchParams } from "react-router-dom";
import AreasPage from "./AreasPage";
import RoomsPage from "./RoomsPage";

type TabKey = "areas" | "rooms";

const AreasRoomsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (searchParams.get("tab") === "rooms" ? "rooms" : "areas") as TabKey;

  const items = useMemo(
    () => [
      { key: "areas", label: "Khu", children: <AreasPage /> },
      { key: "rooms", label: "Phòng", children: <RoomsPage /> },
    ],
    []
  );

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: "0 0 8px 0", fontSize: 22 }}>Quản lý khu & phòng</h2>
        <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>
          Quản lý thông tin khu (zone) và danh sách phòng trong cùng một màn hình
        </p>
      </div>

      <Tabs
        activeKey={tab}
        items={items}
        destroyOnHidden
        onChange={(k) => setSearchParams({ tab: k })}
      />
    </div>
  );
};

export default AreasRoomsPage;

