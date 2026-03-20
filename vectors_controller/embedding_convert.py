import os
import numpy as np
from sentence_transformers import SentenceTransformer
from dotenv import load_dotenv

load_dotenv(".env")
MODEL_NAME = os.getenv("EMB_MODEL")
dim = int(os.getenv("EMB_DIM"))

model = SentenceTransformer(
    MODEL_NAME
)
def check_dim(dim):
    if dim:
        return dim
    print("Please type emb_dim in your .env")
    return

def embed_texts(texts):
    edim = model.get_sentence_embedding_dimension()
    mydim = check_dim(dim)
    if mydim != edim:
        print("dim mismatch, pls check emb model dim")
        return
    if isinstance(texts, str):
        texts = [texts]

    vectors = model.encode(texts, normalize_embeddings=True)
    return np.asarray(vectors, dtype=np.float32).tolist()

if __name__ == "__main__":
    emb = embed_texts("hahahahahaha")
    print(emb)