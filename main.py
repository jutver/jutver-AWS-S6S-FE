from dotenv import load_dotenv
import os
from vectors_controller import vectors
from retrieval_repare import audio2text, text2vect
import time

load_dotenv(".env")

file_name = "meeting.wav"

bucket = os.getenv("BUCKET_NAME")
client = os.getenv("CLIENT")
raw_bucket_folder = os.getenv("RAW_BUCKET_FOLDER")
table = os.getenv("TABLE_NAME")
mock_user_id = "user_456"



if __name__ == "__main__":
    meta = audio2text.voice_transcript(file_name, bucket, client, raw_bucket_folder, table)
    raw_id = meta["raw_id"]
    text_id = meta["text_id"]
    time.sleep(100)
    text2vect.vect_push(raw_id= raw_id, text_id= text_id)
    query = vectors.search_with_filter("Thư ký cần làm gì?", raw_id, text_id)
    print(vectors.pretty_results(query))

