from transformers import pipeline
import re

corrector = pipeline(
    "text2text-generation",
    model="bmd1905/vietnamese-correction"
)

def pre_clean(text):
    text = re.sub(r"\b(ờ|ừ|à)\b", "", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()

def repair_text(text):
    text = pre_clean(text)
    result = corrector(text, max_length=512)
    return result[0]["generated_text"]