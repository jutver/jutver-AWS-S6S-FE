import json
import urllib.parse
import boto3
from botocore.exceptions import ClientError

transcribe = boto3.client("transcribe")
s3 = boto3.client("s3")

OUTPUT_BUCKET = "s3voice2text-bucket"
OUTPUT_PREFIX = "transcripts/"
HASH_TABLE_KEY = "hash_table.json"


def _hash(key, size=16):
    return sum(ord(c) for c in key) % size


def load_table(s3_client, bucket, key):
    try:
        resp = s3_client.get_object(Bucket=bucket, Key=key)
        return json.loads(resp["Body"].read().decode("utf-8"))
    except ClientError as e:
        print(f"Cannot load table s3://{bucket}/{key}: {e}")
        return None


def get_from_table(table, k: str):
    if not table:
        return None

    idx = _hash(k, len(table))
    for key, value in table[idx]:
        if key == k:
            return value
    return None


def find_job_name(table, s3_key: str):
    value = get_from_table(table, s3_key)
    if value:
        return value

    basename = s3_key.split("/")[-1]
    value = get_from_table(table, basename)
    if value:
        return value

    return None


def media_format_from_content_type(content_type: str):
    if not content_type:
        return None

    content_type = content_type.lower().strip()

    mapping = {
        "audio/wav": "wav",
        "audio/x-wav": "wav",
        "audio/wave": "wav",
        "audio/mpeg": "mp3",
        "audio/mp3": "mp3",
        "audio/flac": "flac",
        "audio/x-flac": "flac",
        "audio/mp4": "mp4",
        "audio/x-m4a": "m4a",
        "audio/m4a": "m4a",
        "audio/ogg": "ogg",
        "audio/webm": "webm",
        "audio/amr": "amr",
        "video/mp4": "mp4",
    }

    return mapping.get(content_type)


def lambda_handler(event, context):
    print("Lambda started")
    print(json.dumps(event))

    results = []

    try:
        first_bucket = event["Records"][0]["s3"]["bucket"]["name"]
    except Exception:
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "Invalid S3 event"})
        }

    table = load_table(s3, first_bucket, HASH_TABLE_KEY)
    if table is None:
        raise ValueError(f"Cannot load hash table from s3://{first_bucket}/{HASH_TABLE_KEY}")

    for record in event.get("Records", []):
        try:
            bucket = record["s3"]["bucket"]["name"]
            key = urllib.parse.unquote_plus(record["s3"]["object"]["key"])

            print(f"Processing: s3://{bucket}/{key}")

            if not key.startswith("raw_audio/"):
                print(f"Skip non-raw-audio file: s3://{bucket}/{key}")
                continue

            job_name = find_job_name(table, key)
            if not job_name:
                raise ValueError(f"Key not found in hash table: {key}")

            head = s3.head_object(Bucket=bucket, Key=key)
            content_type = head.get("ContentType", "")
            media_format = media_format_from_content_type(content_type)

            print(f"ContentType: {content_type}")
            print(f"MediaFormat: {media_format}")
            print(f"JobName: {job_name}")

            if not media_format:
                raise ValueError(f"Unsupported or missing ContentType for key: {key}")

            media_uri = f"s3://{bucket}/{key}"

            resp = transcribe.start_transcription_job(
                TranscriptionJobName=job_name,
                IdentifyLanguage=True,
                MediaFormat=media_format,
                Media={"MediaFileUri": media_uri},
                OutputBucketName=OUTPUT_BUCKET,
                OutputKey=f"{OUTPUT_PREFIX}{job_name}.json"
            )

            item = {
                "input_key": key,
                "job_name": job_name,
                "content_type": content_type,
                "media_format": media_format,
                "status": resp["TranscriptionJob"]["TranscriptionJobStatus"],
                "output_s3_uri": f"s3://{OUTPUT_BUCKET}/{OUTPUT_PREFIX}{job_name}.json"
            }
            print(json.dumps(item, ensure_ascii=False))
            results.append(item)

        except ClientError as e:
            err = {
                "input_key": record.get("s3", {}).get("object", {}).get("key"),
                "error": e.response.get("Error", {}).get("Code", "ClientError"),
                "message": e.response.get("Error", {}).get("Message", str(e)),
            }
            print(json.dumps(err, ensure_ascii=False))
            results.append(err)

        except Exception as e:
            err = {
                "input_key": record.get("s3", {}).get("object", {}).get("key"),
                "error": "UnhandledException",
                "message": str(e),
            }
            print(json.dumps(err, ensure_ascii=False))
            results.append(err)

    return {
        "statusCode": 200,
        "body": json.dumps(results, ensure_ascii=False)
    }