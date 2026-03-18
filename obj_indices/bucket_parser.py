
class HashTable:
    def __init__(self, size=16):
        self.size = size
        self.table = [[] for _ in range(size)]

    def _hash(self, key):
        # sum ASCII then modulo
        return sum(ord(c) for c in key) % self.size

    def insert(self, key, value):
        index = self._hash(key)
        bucket = self.table[index]

        for i, (k, v) in enumerate(bucket):
            if k == key:
                bucket[i] = (key, value)
                return

        bucket.append((key, value))

    def get(self, key):
        index = self._hash(key)
        bucket = self.table[index]

        for k, v in bucket:
            if k == key:
                return v
        return None

    def delete(self, key):
        index = self._hash(key)
        bucket = self.table[index]

        for i, (k, v) in enumerate(bucket):
            if k == key:
                del bucket[i]
                print(f"Delete: key='{key}' index={index}")
                return True

        print(f"Cannot delete: key='{key}' key not exits")
        return False

    def display(self):
        print("\nHash Table:")
        for i, bucket in enumerate(self.table):
            print(f"Index {i}: {bucket}")

if __name__ == "__main__":
    ht = HashTable(size=8)

    ht.insert("apple", 12)
    ht.insert("banana", 7)
    ht.insert("cat", 20)
    ht.insert("dog", 15)

    ht.display()

    ht.get("apple")
    ht.get("cat")
    ht.get("orange")

    ht.delete("banana")
    ht.display()