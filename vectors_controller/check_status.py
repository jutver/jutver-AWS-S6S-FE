import time
import boto3
from botocore.exceptions import ClientError
from dotenv import load_dotenv
import os

load_dotenv(".env")


REGION = os.getenv("REGION")
transcribe = boto3.client("transcribe", region_name=REGION)

def wait_for_transcription(job_name: str, interval_seconds: int = 10, timeout_seconds: int = 3600):
    start = time.time()
    time.sleep(10)
    while True:
        if time.time() - start > timeout_seconds:
            raise TimeoutError(f"Timeout waiting for transcription job: {job_name}")

        try:
            resp = transcribe.get_transcription_job(
                TranscriptionJobName=job_name
            )
        except ClientError as e:
            raise RuntimeError(f"GetTranscriptionJob failed: {e}")

        job = resp["TranscriptionJob"]
        status = job["TranscriptionJobStatus"]
        print("Status:", status)

        if status == "COMPLETED":
            transcript_uri = job["Transcript"]["TranscriptFileUri"]
            print("Transcript URI:", transcript_uri)
            return transcript_uri

        if status == "FAILED":
            reason = job.get("FailureReason", "Unknown error")
            raise RuntimeError(f"Transcription failed: {reason}")

        time.sleep(interval_seconds)
