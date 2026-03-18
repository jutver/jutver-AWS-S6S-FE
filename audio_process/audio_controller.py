import boto3
import logging
from botocore.exceptions import ClientError
from dotenv import load_dotenv
import os
import process_percent

load_dotenv(dotenv_path= '.env')
DEBUG = os.getenv("DEBUG")

class raw_audio():
    def __init__(self, file_name, bucket, client, object_name=None, content_type='audio/mpeg', ):
        self.file_name = file_name
        self.bucket = bucket
        self.object_name = object_name
        self.content_type = content_type
        self.client = boto3.client(f'{client}')

    def pushing_to_bucket(self):
        if self.object_name is None:
            object_name = self.file_name
        else:
            object_name = self.object_name
        # Initialize the S3 client
        try:
            # ExtraArgs allows you to set metadata like ContentType
            # This is useful so browsers play the audio instead of downloading it
            callback = process_percent.ProgressPercentage(self.file_name)
            self.client.upload_file(
                self.file_name, 
                self.bucket, 
                self.object_name,
                Callback = callback,
                ExtraArgs={'ContentType': self.content_type}
            )
            if DEBUG is True:
                print(f"\nSuccessfully uploaded {self.file_name} to {self.bucket}/{self.object_name}")
        except ClientError as e:
            if DEBUG is True:
                logging.error(e)
            return False
        
    def download_raw_audio(self, path = "raw_audio"):
        try:
            callback = process_percent.ProgressPercentage(self.file_name)
            self.client.download_file(self.bucket, self.object_name, f"{path}/{self.file_name}", Callback = callback)
            return True
        except ClientError as e:
            if DEBUG is True:
                logging.error(e)
            return False


if __name__ == "__main__":
    audio = raw_audio('filtered_signal.wav', 'rawvoice',"s3", 'raw_audio/filtered_signal.wav')
    audio.pushing_to_bucket()