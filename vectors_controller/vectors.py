import boto3
from dotenv import load_dotenv
import os
from . import chunking, embedding_convert
from concurrent.futures import ThreadPoolExecutor

load_dotenv(".env")

VECTOR_BUCKET = os.getenv("VECTOR_BUCKET")
INDEX_NAME = os.getenv("INDEX_NAME")
REGION = os.getenv("REGION")

s3vectors = boto3.client("s3vectors", region_name=REGION)

def ingest_document(raw_id, text_id, text: str):
    raw_id = str(raw_id)
    text_id = str(text_id)

    chunks = chunking.split_chunks(text)
    embeddings = embedding_convert.embed_texts(chunks)

    if len(chunks) != len(embeddings):
        raise ValueError(
            f"chunks ({len(chunks)}) != embeddings ({len(embeddings)})"
        )

    batch = []
    responses = []
    total = 0

    for i, (chunk, emb) in enumerate(zip(chunks, embeddings), start=1):
        batch.append({
            "key": f"{raw_id}-chunk-{i}",
            "data": {"float32": [float(x) for x in emb]},
            "metadata": {
                "raw_id": raw_id,
                "text_id": text_id,
                "chunk_no": str(i),
                "source_text": chunk
            }
        })

        if len(batch) == 500:
            responses.append(
                s3vectors.put_vectors(
                    vectorBucketName=VECTOR_BUCKET,
                    indexName=INDEX_NAME,
                    vectors=batch
                )
            )
            total += len(batch)
            batch = []

    if batch:
        responses.append(
            s3vectors.put_vectors(
                vectorBucketName=VECTOR_BUCKET,
                indexName=INDEX_NAME,
                vectors=batch
            )
        )
        total += len(batch)

    return {
        "inserted_vectors": total,
        "batches": len(responses),
        "responses": responses
    }


def search_comprehensive( question: str, raw_id, text_id=None, top_k: int = 30, final_k: int = 15, distance_threshold: float = 0.7,) -> dict:

    raw_id = str(raw_id)
    filters = [{"raw_id": {"$eq": raw_id}}]
    if text_id is not None:
        filters.append({"text_id": {"$eq": str(text_id)}})

    hyde_prompt = f"Hãy viết một đoạn văn ngắn trả lời câu hỏi sau:\n{question}"
    vecs = embedding_convert.embed_texts([question, hyde_prompt])
    query_vec, hyde_vec = vecs[0], vecs[1]

    def _query(vec):
        return s3vectors.query_vectors(
            vectorBucketName=VECTOR_BUCKET,
            indexName=INDEX_NAME,
            queryVector={"float32": vec},
            topK=top_k,
            returnDistance=True,
            returnMetadata=True,
            filter={"$and": filters},
        )

    with ThreadPoolExecutor(max_workers=2) as pool:
        f1 = pool.submit(_query, query_vec)
        f2 = pool.submit(_query, hyde_vec)
        raw1 = f1.result()
        raw2 = f2.result()

    base_response = raw1

    res1 = raw1.get("vectors", [])
    res2 = raw2.get("vectors", [])

    K = 60
    scores: dict[str, float] = {}
    items: dict[str, dict] = {}

    for rank, item in enumerate(res1):
        cid = item.get("key") or item.get("id")
        scores[cid] = scores.get(cid, 0) + 1 / (K + rank)
        items[cid] = item

    for rank, item in enumerate(res2):
        cid = item.get("key") or item.get("id")
        scores[cid] = scores.get(cid, 0) + 1 / (K + rank)
        items.setdefault(cid, item)

    ranked_vectors = [
        items[cid]
        for cid, score in sorted(scores.items(), key=lambda x: -x[1])
        if items[cid].get("distance", 1.0) <= distance_threshold
    ][:final_k]

    return {
        **base_response,
        "vectors": ranked_vectors,
    }

def search_with_filter(question: str, raw_id, text_id, top_k: int = 3):
        
        raw_id = str(raw_id)
        filters = [{"raw_id": {"$eq": raw_id}}]
        if text_id is not None:
            filters.append({"text_id": {"$eq": str(text_id)}})
        query_vec = embedding_convert.embed_texts([question])[0]
        return s3vectors.query_vectors(
            vectorBucketName=VECTOR_BUCKET,
            indexName=INDEX_NAME,
            queryVector={"float32": query_vec},
            topK=top_k,
            returnDistance=True,
            returnMetadata=True,
            filter={"$and": filters},
        )


def search_no_filter(question: str, top_k: int = 3):
        query_vec = embedding_convert.embed_texts([question])[0]
        return s3vectors.query_vectors(
            vectorBucketName=VECTOR_BUCKET,
            indexName=INDEX_NAME,
            queryVector={"float32": query_vec},
            topK=top_k,
            returnDistance=True,
            returnMetadata=True,
        )

def pretty_results(resp):
    if not resp["vectors"]:
        return "Không tìm thấy kết quả phù hợp."

    lines = []
    for i, v in enumerate(resp["vectors"], 1):
        meta = v.get("metadata", {})
        lines.append(
            f"{i}. key={v.get('key')} | distance={v.get('distance')}\n"
            f"   text={meta.get('source_text')}\n"
        )
    return "\n".join(lines)


if __name__ == "__main__":
    text = """
Xin chào các anh chị trong nhóm marketing. Hôm nay chúng ta sẽ có buổi họp online do tình hình dịch bệnh hiện nay diễn biến khá phức tạp. Nội dung cuộc họp sẽ liên quan đến những dự án K hai của nhóm chúng ta. Tiếp đây, giám đốc sẽ phổ biến cụ thể với mọi người ạ. Cám ơn mọi người đã ờ tham gia đầy đủ ờ cuộc họp ngày hôm nay. Ba tháng vừa qua thì ờ tôi thấy là nhóm mình đã liên tục là không có đạt đạt target như là cái à Như cái báo cáo mà mình gửi cho mọi người ở trong à file á thì ờ trưởng phòng hãy cho tôi biết cái lý do. Dạ thưa giám đốc, theo báo cáo mà các trưởng nhóm nó gửi tới đa phần đối thủ của chúng ta rất mạnh á, họ treo banner các vị trí tốt và có chiến lược. Họ có chiến lược đưa ra rất hiệu quả rồi. ừ Tôi cảm thấy cái lý do mà các đối thủ á nó không có thỏa đáng, chẳng phải là trước đây mình vẫn làm rất là tốt, dù là các đối thủ là rất là đáng gờm hay sao? ờ Thư ký, em hãy đọc cho các bạn nghe cái những cái vấn đề mà mình tìm thấy ờ trong bảng báo cáo đi. Vâng, thưa mọi người sau khi đã xem qua bản báo cáo cũng như quan sát quá trình làm việc của bộ phận, giám đốc nhận thấy giám giám giám đốc nhận thấy là vấn đề lớn nhất dẫn đến việc không đạt chỉ tiêu đó là các chiến lược marketing đưa ra không hiệu quả. Lý do chính là các mảng nhỏ trong chiến lược đó đều không được hoàn thành tốt. Ví dụ như nhân viên nhận mảng thiết kế banner chẩn mảng, làm cho có khiến cho việc quảng cáo sản phẩm đến khách hàng bị thất bại. Các nhân viên thường xuyên đi trễ về sớm. Một số nhân viên thậm chí còn vắm mặt nhiều hơn mà không có lý do chính đáng. Có rất nhiều khách hàng đã phàn nàn về thái độ làm việc của nhân viên chúng ta, bao gồm cả dịch vụ, bao gồm cả giao dịch và chất lượng dịch vụ nói chung ạ. ờ Cảm ơn em. Vậy ờ các bạn có nghe rõ thư ký nói không ha? Điều đó có nghĩa là cái gì, nghĩa là sự thất bại của chúng ta đến không phải là từ ờ từ đối thủ mà là do sự chễn mãn trong công việc của chúng ta. ờ lý do ở trên á các anh chị có phát biểu gì không? Nếu như sai các anh chị có thể ờ phản bác lại và đưa ra ý kiến. Nếu như mà không có ai phản bác thì ờ mọi người có thể cho tôi biết là tại vì sao ờ có những sự trễ mãn trong công việc này không? Các anh chị có gặp ờ khó khăn gì trong công việc không? Thưa sếp, em nghĩ là công ty nên tăng lương cho nhân viên, bởi vì nếu như mà nhân do bất phản về lương nên nhân viên có sự chuyển mãn trong công việc. ờ Chị Tuyền cho cho tôi biết là chính sách lương của công ty đối với ờ bộ phận của ờ phòng marketing ta đi. Dạ lương khởi điểm là bắt đầu từ 12 đến 15 triệu bao gồm có lương thưởng nữa. Ừ đúng rồi đó. Mà cái với cái mức lương đó thì là không thấp so với lại tình hình ở thời điểm ờ chung ở các công ty hiện bây giờ thì ờ với giả sử tăng lương thì mọi người có bảo đảm được là cái hiệu quả công việc nó sẽ thay đổi ờ theo hướng tích cực trong ờ lâu dài hay không, thực sự là rất muốn lắng nghe cảm nghĩ của mọi người, vì sao mọi người thiếu động lực như vậy. ừ Dạ thưa sếp ờ em có ý kiến ạ. ờ dạ em thấy theo em thấy chính sách lương của công ty của chúng ta á thì em rất là hài lòng, nhưng mà á em không đồng tình với cái chính sách mà thưởng lương cho nhân viên ạ. ờ với cụ thể như là mọi cuối dự án á thì ờ tiền thưởng sẽ được chia đều cho tất cả các nhân viên thực hiện dự án đó nhưng mà ờ Đối điều đó là không công bằng ạ, tại vì đối với những cái ờ tại vì á là mức độ tham gia ờ tham gia cái dự án đó là của mọi người là đều khác nhau và em xin hết ạ. ừ đúng rồi đó sếp ơi, có khi em còn phải làm luôn cả phần của nhân viên khác, thậm chí nhiều khi chỉ vì phân việt của nhân viên đó mà kéo theo kết quả của dự án, khiến bao công suất của nhân viên còn lại đổ sông đổ biển, không đạt target, không có lương thưởng. Em xin hết ạ. ờ Lúc đầu á, đưa ra cái chính sách như vậy là vì muốn tạo cái sự công bằng cho các nhân viên, nghĩa là trong các dự án của mình á không phải là chỉ có các nhân viên tham gia không mà là có nhiều các bậc tham gia nên là mới chia điều như vậy á thì sẽ không vì cách các bậc khác nhau mà người này ít người kia nhiều. Nhưng mà nếu như mọi người cảm thấy cái chính sách đó không tốt vậy thì chúng ta sẽ chuyển sang cái chính sách là thưởng dựa cho cá nhân. ai làm tốt hơn thì người còn lại thì cái tiền thưởng sẽ cao hơn cái người ờ người kia. Mọi người thấy như thế nào? Dạ, giám đốc có thể làm rõ vấn đề này được không ạ? ờ nghĩa là cái mức phần thưởng á sẽ được chia theo cái số nhân viên tham gia dự án, ví dụ như dự án đó được ờ thực hiện bởi 3 nhân viên và cái mức lương thưởng mà công ty đưa ra cho dự án đó là 15% thì 15% đó sẽ được chia chia chia thành 3 phần nếu như mà cái mức độ làm việc và cái kết quả làm việc của 3 nhân viên đó là như nhau. Còn nếu như mà ba nhân viên đó ừ làm việc cái hiệu quả khác nhau á thì 15% đó sẽ chia thành 3 phần khác nhau. ờ dựa trên cái ờ năng suất mà người đó làm việc, em hiểu chưa? Dạ em hiểu rồi sếp, em cảm thấy chính sách này rất tốt ạ. ừ các bạn khác thì như thế nào ha? ừ Dạ tụi em cũng thấy vậy ạ. ừ Vậy à ờ trưởng phòng chị thấy chính sách này có thỏa đáng không? Cách có cần chỉnh sửa chỗ nào không? Dạ em thấy chính sách này được ạ, chính sách này tạo động lực cho mọi người cố gắng hơn đốc bếp thì ai làm việc càng tốt thì lưu thưởng cho càng nhiều và các nhân viên sẽ cố gắng thi vô hoàn thành công việc của mình hơn để đạt được thưởng cao. Thư ký em ghi nhận lại và cụ thể hóa nội dung nha. Dạ em đã ghi chép lại đầy đủ, bắt đầu công bố và áp dụng chính sách từ ngày mai ạ. ừm à dạ tốt lắm. ờ Còn ờ alo bạn ờ chuyên viên à digital có ở đây không ạ? Dạ có sếp. Ừ, ngoài ờ những vấn đề trong các bản báo cáo gần đây của mình thì nãy giờ bạn cũng đã nghe rồi đúng không? Thì ngoài những vấn đề trên á thì còn cái vấn đề nào mà dẫn đến sự thất bại của dự án không bạn? Dạ thưa sếp, cái chiết nhìn ờ tiếp thị khá là hiệu quả, có rất nhiều bình luận trên blog hoặc là chia sẻ trên Facebook, đa phần phản hồi trong số đó đều là rất là hay, rất là tích cực. Tuy nhiên à em nhận thấy là một số vấn đề nhỏ là các bài đăng chủ yếu sử dụng hình ảnh sẵn có trên à internet, em cảm thấy nếu chúng ta có thể dùng ảnh tự chụp, độc đáo và chuyên nghiệp toàn bộ chiến dịch có thể ờ hiệu quả hơn. Theo quan điểm của em thì em muốn ờ tiếp thị sản phẩm, dịch vụ của chúng ta ở theo hướng trực quan hóa hóa hơn, trực quan hóa hơn. Trước đây ờ em từng tiến hành à một số thử nghiệm khác nhau và nhận ra rằng dùng hình ảnh video tự tạo giúp lộc traffic tăng từ 10 đến 15% so với nội dung tập sẵn nó sẽ. Dạ, dạ thưa sếp, em là nhân viên đã thực hiện bản thiết kế baner vừa rồi, trước tiên em xin lỗi vì đã làm ảnh hưởng đến kết quả của toàn bộ dự án. em hoàn toàn không biết là bản member đó sẽ là được apply lên dự án mà chỉ nghĩ nó làm trình chiếu mẫu cho các nhân viên mới. Em chỉ biết về nhiệm vụ được giao chứ không biết về toàn bộ công việc nên đã dẫn đến kết quả trên. Em xin lỗi ạ. Thưa giám đốc em cũng có ý kiến về vấn đề này, em lựa chọn marketing, đam mê với nghề nhưng mỗi nhiệm vụ sau khi làm xong rồi phải thông qua cấp trên, khiến cho nhiều ý tưởng bị hạn chế, nhiều khi em không muốn phát h sáng tạo nữa mà chỉ cần làm theo khuôn một cấp trên là được. có chuyện đó thật sau chuyển phòng. Dạ, ừm thưa giám đốc, có ạ, em nghĩ là nên có sự giám sát đối với nhân viên thì có sai đâu chết. Nếu họ tự quyết định thì mọi việc sẽ không theo trình tự và đi ngược lại với cách thức mình trước đây thì phải làm sao bây giờ? Không, ờ chị làm vậy là không có được, cũng phải tùy trường hợp mà thực hiện giám sát hay là dân chủ. Đối với bộ phận marketing của mình á thì sự sáng tạo là được đánh giá cao và cần phát huy hơn bao giờ hết. Chúng ta không thể nào mà lập trình cách làm việc của nhân viên và ép họ đi theo một cái rập khuôn được mà để nên để họ tự chủ trong công việc. Có như vậy thì nhân viên mới cảm thấy có trách nhiệm hơn và có thể ờ tự phát huy hết những cái sáng tạo của mình tại vì chúng ta không thể nào biết được là khi mà để họ được tự chủ trong công việc như vậy thì cái sự sáng tạo của họ còn có thể tốt hơn như thế nào nữa và có cái chiến lược quảng cáo mới lạ thì mới có sự thu hút đến với khách hàng chứ. Dạ vâng, em hiểu rồi thưa sếp, xin lỗi mọi người về cách làm việc của mình khiến mọi người bất mãn tại vì bây giờ về sau trước khi thực hiện một dự án nào đó mình sẽ phổ biến là toàn bộ từ đầu tới đuôi dự án đó và các bạn sẽ biết được cụ thể công việc mình làm là như thế nào và sẽ ảnh hưởng đến việc của ai và việc quan trọng và quan trọng là công việc sẽ ảnh hưởng như thế nào đến công việc chung. Đương nhiên các bạn sẽ được lựa chọn đảm nhận mãn nào trong các dự án đó là cơ hội để các bạn phát huy tài năng và năng lực trước đây còn bị hạn chế, các bạn thấy làm gì có được không ạ? Nhờ được. Các bạn khác thì sao ha? Dạ được ạ, chính sách của trưởng phòng như vậy các bạn có thấy thỏa đáng chưa được sếp ơi Dạ được ạ. Cách này rất là hay, hi vọng là mọi người đều cố gắng hết sức là tại vì dù mảng nào trong cái dự án thì đều quan trọng hết và đều có liên kết với nhau. Nếu như mà bạn đầu làm sai thì sẽ dẫn đến các bạn ở mảng khác cũng sẽ không có thể hoàn thành tốt được cái phần việc đó. Bây giờ thì thư ký sẽ ờ thay tôi đề cập tới cái phần nội dung tiếp theo trong buổi họp ngày hôm nay. Dạ, thưa các anh chị, trong thời điểm dịch bệnh như hiện tại, sức khỏe và kinh tế là sự lo lắng lớn nhất đối với mỗi người. Do đó, tháng này các nhân viên vẫn được nhận lương đầy đủ, mặc dù mặc dù không đi làm hoặc đi làm ngày có ngày không. Ngoài ra, công ty sẽ gửi tặng nhân viên một phần quà nho nhỏ để chống dịch bao gồm 10 hộp khẩu trang và 5 chai nước rửa tay sát khuẩn. Đối với các nhân viên có thâm niên là có thâm niên làm việc trên 10 năm sẽ được hỗ trợ thêm 2 triệu₫ ạ. Trời, tôi cứ tưởng tháng này không có lương chứ ăn mì tôm qua ngày như vậy là quá tốt rồi. Dạ thực sự là quá tốt luôn chứ tôi thấy những công ty khác chỉ trả khoảng 50 đến 70% lương thôi, còn ờ ngoài ra thì có những doanh nghiệp
"""
    ingest_document("1", "2", text)
    resp = search_comprehensive("nhân viên digital đề xuất gì?", "1", "2")
    print(pretty_results(resp))