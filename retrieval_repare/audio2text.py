from audio_process import audio_controller
from obj_indices import bucket_parser, hash_generator

def voice_transcript(file_name, bucket, client, raw_bucket_folder, table):
    
    obj_id = hash_generator.hash_key()
    object_name = f"{raw_bucket_folder}/{obj_id}"
    transcript_obj = hash_generator.hash_key()

    raw_controller = audio_controller.raw_audio(file_name, bucket, client, object_name, content_type='audio/wav')

    mapper = bucket_parser.HashTable(
        size=16,
        bucket=bucket,
        key=f"{table}.json"
    )
    mapper.insert(obj_id, transcript_obj)
    raw_controller.pushing_to_bucket()
    meta = {
        "raw_id": obj_id,
        "text_id": transcript_obj,
            }
    return meta

