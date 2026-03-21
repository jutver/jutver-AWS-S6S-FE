from enum import Enum
from dataclasses import dataclass
import json, re
from vectors_controller import vectors
from model_controller import model_caller

class QuestionType(str, Enum):
    FACTUAL       = "factual"        # hỏi 1 thông tin cụ thể
    COMPREHENSIVE = "comprehensive"  # liệt kê / so sánh nhiều ý
    DEAD          = "dead"           # chào hỏi, lịch sử hội thoại
    OFF_TOPIC     = "off_topic"      # ngoài phạm vi tài liệu

class RetrievalStrategy(str, Enum):
    NONE          = "none"           # không cần retrieval
    FAST          = "fast"           # search_with_filter — 1 query, top_k nhỏ
    COMPREHENSIVE = "comprehensive"  # search_comprehensive — HyDE + RRF

@dataclass
class ClassifyResult:
    question_type:      QuestionType
    retrieval_strategy: RetrievalStrategy
    confidence:         float   # 0.0 - 1.0
    reason:             str

_SYSTEM_PROMPT = """Bạn là bộ phân loại câu hỏi cho hệ thống RAG tài liệu.

NGUYÊN TẮC QUAN TRỌNG: khi nghi ngờ giữa fast và comprehensive, LUÔN chọn comprehensive.

Loại câu hỏi và chiến lược:

[factual → fast]
Đặc điểm: hỏi MỘT thông tin duy nhất, có thể trả lời bằng 1 đoạn văn ngắn.
Ví dụ đúng:
  - "lãi suất vay là bao nhiêu?"
  - "điều khoản 5 quy định gì?"
  - "phí quản lý tài khoản là bao nhiêu?"
Ví dụ SAI (trông giống factual nhưng thực ra là comprehensive):
  - "các loại phí là gì?" → có chữ "các" → comprehensive
  - "quy trình gồm những bước nào?" → có chữ "những" → comprehensive
  - "hợp đồng quy định gì về thanh toán?" → chủ đề rộng → comprehensive

[comprehensive → comprehensive]  
Đặc điểm: cần tổng hợp NHIỀU đoạn văn từ nhiều nơi trong tài liệu.
Dấu hiệu nhận biết (chỉ cần 1 trong các dấu hiệu sau):
  - Có từ: "tất cả", "các", "những", "liệt kê", "tóm tắt", "so sánh", "toàn bộ", "đầy đủ", "chi tiết", "giải thích"
  - Hỏi về quy trình / điều kiện / trường hợp (thường có nhiều bước hoặc nhiều nhánh)
  - Câu hỏi mở không rõ phạm vi: "hợp đồng nói gì về X?", "có những quy định gì về Y?"
  - Chủ đề bao quát: quyền lợi, nghĩa vụ, điều kiện, thủ tục, chính sách

[dead → none]
Đặc điểm: không liên quan tài liệu, không cần tra cứu.
Ví dụ: "xin chào", "cảm ơn", "bạn vừa nói gì?", "ý bạn là gì?"

[off_topic → none]
Đặc điểm: hoàn toàn ngoài phạm vi tài liệu.
Ví dụ: "thời tiết hôm nay?", "giá vàng là bao nhiêu?"

Trả về JSON hợp lệ, không giải thích thêm:
{
  "question_type": "<factual|comprehensive|dead|off_topic>",
  "retrieval_strategy": "<none|fast|comprehensive>",
  "confidence": <0.0 đến 1.0>,
  "reason": "<1 câu giải thích>"
}"""


def classify_question(question: str) -> ClassifyResult:
    messages = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {"role": "user",   "content": question},
    ]

    try:
        resp = model_caller.get_model_response(messages)
        match = re.search(r'\{.*?\}', resp, re.DOTALL)
        data = json.loads(match.group())

        result = ClassifyResult(
            question_type=QuestionType(data["question_type"]),
            retrieval_strategy=RetrievalStrategy(data["retrieval_strategy"]),
            confidence=float(data["confidence"]),
            reason=data.get("reason", ""),
        )

        if result.confidence < 0.65 and result.retrieval_strategy == RetrievalStrategy.FAST:
            result.retrieval_strategy = RetrievalStrategy.COMPREHENSIVE
            result.reason += " [upgraded: low confidence]"

        return result

    except Exception:
        return ClassifyResult(
            question_type=QuestionType.COMPREHENSIVE,
            retrieval_strategy=RetrievalStrategy.COMPREHENSIVE,
            confidence=0.5,
            reason="parse error, fallback to comprehensive",
        )

def route_and_search(question: str, raw_id, text_id=None) -> dict | None:
    clf = classify_question(question)

    match clf.retrieval_strategy:
        case RetrievalStrategy.NONE:
            return None

        case RetrievalStrategy.FAST:
            return vectors.search_with_filter(
                question, raw_id, text_id,
                top_k=5,
            )

        case RetrievalStrategy.COMPREHENSIVE:
            return vectors.search_comprehensive(
                question, raw_id, text_id,
                top_k=30,
                final_k=15,
            )