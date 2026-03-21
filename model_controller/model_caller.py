import os
from litellm import completion
from dotenv import load_dotenv

load_dotenv(".env")
api_key = os.getenv("API_KEY")
model = os.getenv("MODEL")

def get_model_response(message, api_key = api_key, model = model):
    resp = completion(
        model= model,
        messages= message,
        api_key= api_key,
    )
    return resp.choices[0].message.content



res = get_model_response([{"role": "user", "content": "Tóm tắt đoạn này thành 5 ý"}])