class Edge:
    def __init__(self, source, edge_type, target):
        self.source = source
        self.type = edge_type
        self.target = target

    def __repr__(self):
        return f"{self.source} --{self.type}--> {self.target}"