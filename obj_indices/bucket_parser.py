import json
import boto3
from botocore.exceptions import ClientError

s3 = boto3.client("s3")
class HashTable:
    def __init__(self, bucket, key, size=16):
        self.bucket = bucket
        self.key = key
        self.size = size
        self.table = [[] for _ in range(size)]

        self._load_if_exists()

    def _hash(self, key):
        # sum ASCII then modulo
        return sum(ord(c) for c in key) % self.size

    def _load_if_exists(self) -> None:
        try:
            resp = s3.get_object(Bucket=self.bucket, Key=self.key)
            self.table = json.loads(resp["Body"].read().decode("utf-8"))
        except ClientError as e:
            error_code = e.response["Error"]["Code"]
            if error_code in ("NoSuchKey", "404"):
                self._save()
            else:
                raise

    def _save(self) -> None:
        s3.put_object(
            Bucket=self.bucket,
            Key=self.key,
            Body=json.dumps(self.table, ensure_ascii=False).encode("utf-8"),
            ContentType="application/json"
        )

    def insert(self, k: str, v) -> None:
        idx = self._hash(k)

        for i, (key, _) in enumerate(self.table[idx]):
            if key == k:
                self.table[idx][i] = [k, v]
                self._save()
                return

        self.table[idx].append([k, v])
        self._save()

    def get(self, k: str):
        idx = self._hash(k)
        for key, value in self.table[idx]:
            if key == k:
                return value
        return None

    def delete(self, k: str) -> bool:
        idx = self._hash(k)
        original_len = len(self.table[idx])
        self.table[idx] = [item for item in self.table[idx] if item[0] != k]

        if len(self.table[idx]) != original_len:
            self._save()
            return True
        return False

    def update(self, k: str, v) -> bool:
        idx = self._hash(k)
        for i, (key, _) in enumerate(self.table[idx]):
            if key == k:
                self.table[idx][i] = [k, v]
                self._save()
                return True
        return False