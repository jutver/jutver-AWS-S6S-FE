import os
from litellm import completion
from dotenv import load_dotenv

load_dotenv(".env")

def get_model_response(message, api_key = os.getenv("API_KEY"), model = "gemini/gemini-flash-lite-latest"):
    resp = completion(
        model= model,
        messages= message,
        api_key= api_key,
    )
    print(resp.choices[0].message.content)



res = get_model_response([{"role": "user", "content": "Tóm tắt đoạn này thành 5 ý"}])