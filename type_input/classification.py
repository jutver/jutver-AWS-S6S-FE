import re
from model_controller.model_caller import get_model_response

def clean_label(text):
    text = text.lower().strip()

    if "request" in text:
        return "request"
    if "question" in text:
        return "question"
    return "false"

def rule_classify(text):
    text_lower = text.lower().strip()

    score_request = 0
    score_question = 0

    request_patterns = [
        (r"(tóm tắt|summary)", 3),
        (r"(nêu (các )?ý chính)", 3),
        (r"(liệt kê|list)", 2),
        (r"(phân tích|giải thích|mô tả|trình bày|so sánh)", 2),
        (r"(hướng dẫn|chỉ cách|cách làm)", 2),
        (r"(giúp|dùm|hộ|cho tôi|cho mình)", 2),
        (r"(check|review|update|gửi|fix|xử lý)", 2),
        (r"^(thông tin|chi tiết|danh sách|báo cáo|data)", 2),
        (r"(báo cáo (này|đó))", 1),
        (r"(tài liệu (này|đó))", 1),
    ]

    question_patterns = [
        (r"\?", 3),
        (r"\b(ai|gì|bao nhiêu|mấy|khi nào|ở đâu|tại sao|làm sao)\b", 3),
        (r"(deadline|thời hạn).*(khi nào|bao giờ|là)", 3),
        (r"(ai phụ trách|ai làm|ai xử lý)", 3),
        (r"(đã xong chưa|xong chưa|tình trạng|status)", 2),
        (r"(phải không|đúng không)", 2),
    ]

    specific_patterns = [
        r"(dự án|project)\s+\w+",
        r"(khách hàng|client)\s+\w+",
        r"(file|báo cáo|report|tài liệu|doc)",
        r"\d{1,2}/\d{1,2}",
        r"\d{4}",
        r"(ngày|tháng|năm|hôm nay|hôm qua|tuần này|tháng này)",
        r"(v\d+)",
        r"(id\s*\d+)",
        r"\d+",
        r"\b[A-Z][a-z]+\b",
    ]

    for pattern, score in request_patterns:
        if re.search(pattern, text_lower):
            score_request += score

    for pattern, score in question_patterns:
        if re.search(pattern, text_lower):
            score_question += score

    has_specific = any(re.search(p, text_lower) for p in specific_patterns)

    if score_request >= score_question and score_request >= 2:
        return {
            "label": "request",
            "score": score_request,
            "is_detailed": has_specific
        }

    if score_question > score_request and score_question >= 2:
        return {
            "label": "question",
            "score": score_question,
            "is_detailed": has_specific
        }

    return {
        "label": "unknown",
        "score": 0,
        "is_detailed": False
    }

def build_prompt(text):
    return [
        {
            "role": "system",
            "content": (
                "You are an intent classification system.\n"
                "Classify Vietnamese text into EXACTLY ONE label.\n\n"

                "Labels:\n"
                "- request: user asks for an action (summarize, list, explain, provide info)\n"
                "- question: user asks a direct question (who, what, when, where, why, how)\n"
                "- false: not a request or question\n\n"

                "Important distinctions:\n"
                "- 'tóm tắt báo cáo' → request\n"
                "- 'cho tôi thông tin' → request\n"
                "- 'ai là trưởng dự án' → question\n"
                "- 'deadline khi nào' → question\n\n"

                "Rules:\n"
                "1. Return ONLY one word: request, question, or false\n"
                "2. No explanation\n"
                "3. No punctuation\n"
                "4. If unclear → return false\n"
            )
        },
        {
            "role": "user",
            "content": (
                "Examples:\n"
                "Input: tóm tắt báo cáo\n"
                "Output: request\n\n"

                "Input: thông tin dự án A\n"
                "Output: request\n\n"

                "Input: deadline dự án A là khi nào\n"
                "Output: question\n\n"

                "Input: ai là trưởng dự án A\n"
                "Output: question\n\n"

                "Input: ok rồi\n"
                "Output: false\n\n"

                f"Input: {text}\n"
                "Output:"
            )
        }
    ]

def llm_classify(text):
    messages = build_prompt(text)
    response = get_model_response(messages)

    return clean_label(response)

def classify(text, call_llm=True):
    rule = rule_classify(text)

    if rule["score"] >= 3:
        if rule["label"] in ["question", "request"]:
            return "detailed" if rule["is_detailed"] else "question"

    if call_llm:
        llm_label = llm_classify(text)

        if llm_label in ["question", "request"]:
            return "detailed" if rule["is_detailed"] else "question"

    return "false"