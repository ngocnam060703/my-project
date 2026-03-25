import React from "react";
import { Card, Typography, Row, Col } from "antd";

const { Paragraph, Text } = Typography;

const RULES = [
  "Ở đúng nơi quy định, chấp hành sự điều động về chỗ ở của Trưởng Ban QLKTX. Không được tự ý cơi tạo, sửa chữa, tháo gỡ các tài sản trong phòng ở. Tự bảo quản, giữ gìn tài sản tập thể và cá nhân. Thực hiện khẩu hiệu: “Ký túc xá là nhà- Sinh viên là chủ.”",
  "Không chuyển nhượng, cho thuê lại hợp đồng nội trú. Thực hiện tốt nội quy ra vào KTX. Thực hiện đúng quy định về tạm trú, tạm vắng, không được tiếp khách trong phòng khi chưa được phép của cán bộ phụ trách.",
  "Chấp hành nghiêm các quy định về trật tự, vệ sinh khu KTX. Hoàn thành tốt nhiệm vụ trực phòng, tầng theo nhiệm vụ phân công. Phòng phải thường xuyên sạch gọn, giường có tem ghi họ tên, lớp, khoa. Không làm ồn ào, mất trật tự trong KTX. Các hoạt động tập thể như: hội họp, ca hát, nhảy, múa phải đúng nơi, đúng giờ quy định của Ban QLKTX.",
  "Nghiêm cấm tảo hoặc tàng trữ, sử dụng các loại vũ khí, chất nổ, pháo nổ, chất gây cháy hoặc hoá chất độc hại, các chất kích thích: ma tuý và các chế phẩm của nó, các loại nước uống có nồng độ cồn từ 12 độ trở lên, các loại văn hóa phẩm đồi trụy, các tài liệu liên quan đến chiến tranh tâm lý của địch.",
  "Không gây gổ, đánh chửi nhau hoặc kích động đánh chửi nhau, không chủ mưu trộm cắp, ăn cắp, trấn lột hoặc đồng loã, bao che cho người trộm cắp, trấn lột. Không chứa chấp bao che hàng lậu hoặc tội phạm, không tham gia các hoạt động đánh bạc, số đề, mại dâm dưới bất kỳ hình thức nào hoặc có quan hệ nam nữ bất chính.",
  "Thực hiện tốt nếp sống văn minh sư phạm, không nói tục, chửi thề, không khạc nhổ bừa bãi. Không đổ nước, vứt rác hoặc ném các vật từ tầng trên xuống đất. Không viết bậy, vẽ bậy hoặc tự tiện viết, dán áp phích, quảng cáo. Không đốt bất hương, thờ cúng, không có các hoạt động mê tín dị đoan và các hoạt động tôn giáo trong KTX. Không được quay rổ, che chắn phòng ở, giường ngủ gây mất mỹ quan hoặc nhằm mục đích không lành mạnh.",
  "Không leo trèo ống nước, đường dây thu lôi, không ngồi chênh vênh trên các cửa sổ, ban công, không leo trèo từ phòng này sang phòng khác, tầng này sang tầng khác. Không có các hành vi gây mất an toàn.",
  "Không mua bán, đổi chác trong KTX (trừ những nơi được phép của nhà trường), không nấu ăn trong phòng ở. Tích cực tham gia giải quyết các trường hợp bất thường như: hoả hoạn, rủi ro,... xảy ra trong KTX.",
  "Có trách nhiệm đóng lệ phí KTX đầy đủ và đúng hạn. Sinh viên không muốn ở nội trú phải có đơn và Ban sẽ giải quyết hai lần trong năm (Cuối mỗi học kỳ). Khi được giải quyết ngoại trú phải có trách nhiệm bàn giao đầy đủ chỗ ở và tài sản, nếu làm hỏng, mất phải có trách nhiệm đền bù theo giá thị trường. Thời gian sinh viên ở KTX được tính theo kế hoạch công tác của trường. Ngoài thời gian trên, sinh viên muốn ở KTX phải đăng kí và ở theo sự bố trí của Ban đồng thời phải nộp lệ phí theo quy định.",
  "Tất cả Sinh viên trường ĐH Hà Nội và mọi người đến KTX đều phải thực hiện tốt những quy định trên. Đơn vị và cá nhân có thành tích được nhà trường biểu dương, khen thưởng, nếu vi phạm thì tuỳ mức độ sẽ bị xử lý theo quy định về công tác sinh viên nội trú của Trường ĐH Hà Nội .",
];

const RegulationsPage: React.FC = () => (
  <div style={{ maxWidth: 1120, margin: "0 auto" }}>
    <Card style={{ borderRadius: 0 }}>
      <div style={{ fontFamily: "Times New Roman, serif", color: "#111", fontSize: 16 }}>
        <Row>
          <Col span={12} style={{ textAlign: "center" }}>
            <Text style={{ fontSize: 16 }}>BỘ GIÁO DỤC VÀ ĐÀO TẠO</Text>
            <br />
            <Text style={{ fontSize: 18, fontWeight: 700, textDecoration: "underline" }}>TRƯỜNG ĐH HÀ NỘI </Text>
          </Col>
          <Col span={12} style={{ textAlign: "center" }}>
            <Text style={{ fontSize: 16, fontWeight: 700 }}>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</Text>
            <br />
            <Text style={{ fontSize: 18, fontWeight: 700, textDecoration: "underline" }}>Độc lập- Tự do- Hạnh phúc</Text>
          </Col>
        </Row>

        <div style={{ marginTop: 20, textAlign: "center", lineHeight: 1.25 }}>
          <Text style={{ fontSize: 22, fontWeight: 700 }}>NỘI QUY</Text>
          <br />
          <Text style={{ fontSize: 24, fontWeight: 700 }}>KTX SINH VIÊN TRƯỜNG ĐH HÀ NỘI </Text>
          <br />
          <Text style={{ fontSize: 18, fontStyle: "italic", fontWeight: 700 }}>
            ( Ban hành theo quyết định số: 19/ QĐ-KTX ngày 01- 9- 2011
          </Text>
          <br />
          <Text style={{ fontSize: 18, fontStyle: "italic", fontWeight: 700 }}>của Hiệu trưởng Trường ĐH Hà Nội  )</Text>
        </div>

        <Paragraph style={{ marginTop: 14, marginBottom: 10, textIndent: 24, lineHeight: 1.4, fontSize: 16 }}>
          Người học tại trường ĐH Hà Nội khi có đơn được xét vào ở nội trú phải kí thỏa thuận thuê chỗ ở nội trú và phải thực hiện đầy đủ những quy định sau:
        </Paragraph>

        {RULES.map((rule, idx) => (
          <Paragraph key={idx} style={{ margin: "5px 0", lineHeight: 1.4, fontSize: 16 }}>
            <Text style={{ fontSize: 16, fontWeight: 700, textDecoration: "underline" }}>{`Điều ${idx + 1}`}</Text>
            <Text style={{ fontSize: 16 }}>{`: ${rule}`}</Text>
          </Paragraph>
        ))}

        <div style={{ textAlign: "center", marginTop: 20, lineHeight: 1.2 }}>
          <Text style={{ fontSize: 20, fontWeight: 700 }}>HIỆU TRƯỞNG</Text>
          <br />
          <Text style={{ fontSize: 16, fontStyle: "italic", fontWeight: 700 }}>( Đã ký )</Text>
        </div>
      </div>
    </Card>
  </div>
);

export default RegulationsPage;
