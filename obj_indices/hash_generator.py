import hashlib
import uuid

def get_id():
    file_id = str(uuid.uuid4())
    return file_id

def hash_key():
    key = hashlib.sha256(get_id().encode("utf-8")).hexdigest()
    return key
