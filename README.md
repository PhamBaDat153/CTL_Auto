# Cổ Tiên Lộ Auto

Tiện ích Chrome tự nhấn phím / click chuột theo chuỗi hẹn giờ.

## Cài đặt

Mở `chrome://extensions`, bật **Developer mode**, chọn **Load unpacked** và trỏ tới thư mục này.
Sau khi cập nhật code, bấm nút ⟳ trên thẻ tiện ích rồi tải lại trang game.

## Sử dụng

- **Chuỗi thao tác**: thêm Phím / Chuột / Chờ, sắp xếp bằng ↑ ↓, nhân bản bằng ⧉. Bấm vào tiêu đề thẻ để thu gọn.
- **🎣 Câu cá**: thả câu → chờ cá cắn → Giật → kéo → nghỉ → lặp theo số mồi.
  Bước Giật và bước Kéo (kiểu "Giữ, nhả khi vùng khớp") nhận biết vùng đã chọn bằng:
  - **Chữ HTML trong vùng**: đọc chữ của trang trong vùng (không phân biệt dấu, hoa/thường), ~10 lần/giây.
  - **Hình khớp ảnh mẫu**: bấm 📷 rồi **Alt+S** trên trang đúng lúc để chụp mẫu; đặt ngưỡng % giống.
    Ảnh lấy thẳng từ canvas nếu đọc được, nếu không thì chụp tab (Chrome cho tối đa ~2 lần/giây).
  - (Chỉ bước Giật) **Hẹn giờ**: nhấn liên tục N giây — không khuyến khích, game ghi giật sớm làm cá bỏ đi.
  **Thả lại khi gặp vấn đề** (bước Giật): danh sách điều kiện kiểm tra lúc chờ cá cắn; khớp (bất kỳ / tất cả)
  thì bỏ lượt, nghỉ rồi bấm phím thả câu lại. Hết thời gian chờ mà cá không cắn cũng thả lại.
  Bước Kéo có thể có **nhiều điều kiện nhả dây** (bất kỳ / tất cả khớp thì nhả, không khớp thì giữ).
  Nút **Thử** chạy 30 giây không bấm gì; thanh trạng thái hiện kết quả từng điều kiện để chỉnh ngưỡng.
- Tab đang chọn là chế độ sẽ chạy khi bấm **Bắt đầu**.
- **Tùy chọn chung**: dao động thời gian ±%, tự dừng sau N phút.
- Mọi thay đổi được lưu tự động theo từng cấu hình.

Phím tắt trên trang: **Shift** chạy/dừng cấu hình đang chọn, **Esc** dừng, **Alt+S** chụp ảnh mẫu cho nút 📷 vừa bấm.

## Lưu ý

Luật công khai của Cổ Tiên Lộ chỉ cho phép auto click. Tính năng nhận diện chỉ nên dùng khi đã được admin xác nhận cho phép; giữ lại tin nhắn xác nhận đó.
