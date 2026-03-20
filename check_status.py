import time
import boto3
from botocore.exceptions import ClientError

REGION = "ap-southeast-1"
JOB_NAME = "voice-e618f72d7ce8aebfbf195018b3ba4b95a67c0c197454bc7f49b1bab01825cf44"

transcribe = boto3.client("transcribe", region_name=REGION)

def wait_for_transcription(job_name: str, interval_seconds: int = 10, timeout_seconds: int = 3600):
    start = time.time()

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

if __name__ == "__main__":
    uri = wait_for_transcription(JOB_NAME)
    print("Done:", uri)