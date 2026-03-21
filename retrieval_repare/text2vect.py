from vectors_controller import vectors
import boto3
import os
from dotenv import load_dotenv
from botocore.exceptions import ClientError

load_dotenv(".env")

s3 = boto3.client("s3")
text_bucket_folder = os.getenv("TEXT_BUCKET_FOLDER")
bucket = os.getenv("BUCKET_NAME")

def get_text(text_id): 
    key = f"{text_bucket_folder}/{text_id}.json"
    try:
        resp = s3.get_object(Bucket=bucket, Key=key)
        return resp["Body"].read().decode("utf-8")
    except ClientError as e:
        print("S3 error:", e)
        raise

def vect_push(raw_id, text_id):
    text = get_text(text_id)
    vectors.ingest_document(raw_id, text_id, text)