class Node:
    def __init__(self, node_id, node_type, name, file=None):
        self.id = node_id
        self.type = node_type
        self.name = name
        self.file = file

    def __repr__(self):
        return f"{self.type}: {self.name}"