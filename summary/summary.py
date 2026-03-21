from model_controller.model_caller import get_model_response

def prompt_summary(text):
    return [
        {
            "role": "system",
            "content": (
                "Bạn là trợ lý chuyên ghi biên bản cuộc họp và quản lý công việc chuyên nghiệp. "
                "Bạn trình bày rõ ràng, logic, có cấu trúc và không suy diễn."
            )
        },
        {
            "role": "user",
            "content": f"""
Dưới đây là nội dung cuộc họp (có thể chứa lỗi từ speech-to-text).

NHIỆM VỤ:
- Hiểu nội dung và tự sửa lỗi nếu cần
- Chuyển thành BIÊN BẢN CUỘC HỌP chi tiết và chuyên nghiệp

YÊU CẦU:
- Không thêm thông tin ngoài nội dung
- Viết rõ ràng, dễ đọc
- Dùng markdown
- Các thông tin quan trọng phải được **in đậm**
- Không bỏ trống mục nào (nếu không có ghi "Chưa xác định")

FORMAT BẮT BUỘC:

## 1.Chủ đề cuộc họp
- Mô tả ngắn gọn chủ đề chính

## 2.Tổng quan
- Tóm tắt nội dung chính của cuộc họp

## 3.Nội dung thảo luận
- Trình bày theo từng topic:
    - **Topic 1**:
        - Nội dung:
        - Ý kiến / góp ý:
    - **Topic 2**:
        - Nội dung:
        - Ý kiến / góp ý:

## 4.Quyết định / Kết luận
- Các quyết định quan trọng đã được thống nhất

## 5.Công việc & Phân công
Liệt kê dạng bảng (markdown table):

| Công việc | Người phụ trách | Thời hạn | Trạng thái |
|----------|----------------|----------|------------|
| ...      | ...            | ...      | ...        |

## 6.Tiến trình hiện tại
- Mô tả tiến độ của các công việc (nếu có)
- Nếu không rõ → ghi "Chưa cập nhật"

## 7.Hành động tiếp theo
- Các bước cần thực hiện tiếp theo

NỘI DUNG CUỘC HỌP:
{text}
"""
        }
    ]

def get_summary(text):
    messages = prompt_summary(text)
    return get_model_response(messages)