from node import Node
from edge import Edge
from collections import deque

class Graph:

    def __init__(self):
        self.nodes = {}
        self.edges = []

    def add_node(self, node):
        self.nodes[node.id] = node

    def add_edge(self, edge):
        self.edges.append(edge)

    def show_nodes(self):
        print("\nNODES")

        for node in self.nodes.values():
            print(
                node.id,
                "|",
                node.type,
                "|",
                node.name
            )

    def show_edges(self):
        print("\nEDGES")

        for edge in self.edges:
            print(
                edge.source,
                "--",
                edge.type,
                "-->",
                edge.target
            )

    def bfs(self, start_id):

        visited = set()

        queue = deque([start_id])

        while queue:

            current = queue.popleft()

            if current in visited:
                continue

            visited.add(current)

            node = self.nodes[current]

            print(
                node.type,
                "→",
                node.name
            )

            for edge in self.edges:

                if edge.source == current:

                    if edge.target not in visited:
                        queue.append(edge.target)

    def dfs(self, start_id):

        visited = set()

        def traverse(node_id):

            if node_id in visited:
                return

            visited.add(node_id)

            node = self.nodes[node_id]

            print(
                node.type,
                "→",
                node.name
            )

            for edge in self.edges:

                if edge.source == node_id:
                    traverse(edge.target)

        traverse(start_id)