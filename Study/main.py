"""Document scheme used by this graph parser

Relationships created in the graph:
- FILE --CONTAINS--> CLASS
- FILE --CONTAINS--> FUNCTION
- CLASS --CONTAINS--> METHOD
- FILE --IMPORTS--> FILE
- METHOD/FUNCTION --CALLS--> METHOD/FUNCTION

This file scans TypeScript source code and turns it into a dependency graph so we can
understand which files, classes, methods, and functions are related to one another.
"""

from pathlib import Path
import re
import json

from node import Node
from edge import Edge
from graph import Graph


TS_KEYWORDS = {
    "if",
    "for",
    "while",
    "switch",
    "catch",
    "return",
    "new",
    "typeof",
    "function",
    "class",
}


def sanitize(value: str) -> str:
    return re.sub(r"[^a-z0-9_]+", "_", value.lower()).strip("_")


def to_file_node_id(path: Path) -> str:
    # Example: auth.ts -> file_auth
    return f"file_{sanitize(path.stem)}"


def to_class_node_id(path: Path, class_name: str) -> str:
    return f"class_{sanitize(path.stem)}_{sanitize(class_name)}"


def to_method_node_id(path: Path, class_name: str, method_name: str) -> str:
    return f"method_{sanitize(path.stem)}_{sanitize(class_name)}_{sanitize(method_name)}"


def to_function_node_id(path: Path, function_name: str) -> str:
    return f"function_{sanitize(path.stem)}_{sanitize(function_name)}"


def parse_import_paths(file_text: str) -> list[str]:
    # Matches: import ... from "./token.ts"
    pattern = r'import\s+.*?\s+from\s+[\'"](.+?)[\'"]'
    return re.findall(pattern, file_text)


def parse_named_imports(file_text: str) -> list[tuple[str, str]]:
    imports: list[tuple[str, str]] = []
    pattern = r'import\s*{\s*([^}]+)\s*}\s*from\s+[\'"](.+?)[\'"]'

    for symbols_chunk, import_path in re.findall(pattern, file_text):
        symbols = [part.strip() for part in symbols_chunk.split(",") if part.strip()]

        for symbol in symbols:
            if " as " in symbol:
                _, local_name = [piece.strip() for piece in symbol.split(" as ", 1)]
            else:
                local_name = symbol

            imports.append((local_name, import_path))

    return imports


def find_matching_brace(text: str, open_brace_index: int) -> int:
    depth = 0

    for index in range(open_brace_index, len(text)):
        char = text[index]

        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1

            if depth == 0:
                return index

    return -1


def parse_classes(file_text: str) -> list[dict]:
    classes: list[dict] = []
    class_pattern = r'class\s+([A-Za-z_]\w*)\s*{'

    for match in re.finditer(class_pattern, file_text):
        class_name = match.group(1)
        open_brace_index = match.end() - 1
        close_brace_index = find_matching_brace(file_text, open_brace_index)

        if close_brace_index == -1:
            continue

        body = file_text[open_brace_index + 1:close_brace_index]
        classes.append(
            {
                "name": class_name,
                "body": body,
            }
        )

    return classes


def parse_methods(class_body: str) -> list[dict]:
    methods: list[dict] = []
    method_pattern = r'([A-Za-z_]\w*)\s*\([^)]*\)\s*{'

    for match in re.finditer(method_pattern, class_body):
        method_name = match.group(1)

        if method_name in TS_KEYWORDS:
            continue

        open_brace_index = match.end() - 1
        close_brace_index = find_matching_brace(class_body, open_brace_index)

        if close_brace_index == -1:
            continue

        body = class_body[open_brace_index + 1:close_brace_index]
        methods.append(
            {
                "name": method_name,
                "body": body,
            }
        )

    return methods


def parse_top_level_functions(file_text: str) -> list[dict]:
    functions: list[dict] = []
    pattern = r'(?:export\s+)?function\s+([A-Za-z_]\w*)\s*\([^)]*\)\s*{'

    for match in re.finditer(pattern, file_text):
        function_name = match.group(1)
        open_brace_index = match.end() - 1
        close_brace_index = find_matching_brace(file_text, open_brace_index)

        if close_brace_index == -1:
            continue

        body = file_text[open_brace_index + 1:close_brace_index]
        functions.append(
            {
                "name": function_name,
                "body": body,
            }
        )

    return functions


def parse_calls(block_text: str) -> list[str]:
    calls = re.findall(r'\b([A-Za-z_]\w*)\s*\(', block_text)
    return [call for call in calls if call not in TS_KEYWORDS]


def resolve_import_file(current_file: Path, import_path: str) -> Path | None:
    # Only handle local imports like ./x or ../x
    if not import_path.startswith("."):
        return None

    target = (current_file.parent / import_path).resolve()

    # If extension missing, try .ts
    if target.suffix == "":
        target = target.with_suffix(".ts")

    return target


def build_graph_from_project(project_dir: Path) -> Graph:
    graph = Graph()

    ts_files = list(project_dir.rglob("*.ts"))
    node_id_by_path = {}
    top_level_function_nodes: dict[Path, dict[str, str]] = {}
    class_method_nodes: dict[Path, dict[str, str]] = {}
    callable_bodies: list[dict] = []
    edge_set: set[tuple[str, str, str]] = set()

    # This helper prevents duplicate edges.
    # Without this, the same relationship could be added many times when the same file or call is encountered repeatedly.
    def add_edge_once(source: str, edge_type: str, target: str) -> None:
        edge_key = (source, edge_type, target)
        if edge_key not in edge_set:
            graph.add_edge(Edge(source, edge_type, target))
            edge_set.add(edge_key)

    # 1) Add FILE nodes
    # A file is the top-level node in the graph.
    # Example: auth.ts -> FILE node "file_auth"
    for f in ts_files:
        node_id = to_file_node_id(f)
        node_id_by_path[f.resolve()] = node_id
        graph.add_node(
            Node(
                node_id=node_id,
                node_type="FILE",
                name=f.name,
                file=str(f.relative_to(project_dir))
            )
        )

    # 2) Add CLASS, METHOD, FUNCTION nodes + CONTAINS edges
    # CONTAINS means the parent object contains the child object.
    # Example: FILE --CONTAINS--> CLASS and CLASS --CONTAINS--> METHOD
    for f in ts_files:
        file_path = f.resolve()
        src_id = node_id_by_path[file_path]
        text = f.read_text(encoding="utf-8")
        relative_file = str(f.relative_to(project_dir))

        top_level_function_nodes[file_path] = {}
        class_method_nodes[file_path] = {}

        for cls in parse_classes(text):
            class_node_id = to_class_node_id(f, cls["name"])
            graph.add_node(
                Node(
                    node_id=class_node_id,
                    node_type="CLASS",
                    name=cls["name"],
                    file=relative_file,
                )
            )
            add_edge_once(src_id, "CONTAINS", class_node_id)

            for method in parse_methods(cls["body"]):
                method_node_id = to_method_node_id(f, cls["name"], method["name"])
                graph.add_node(
                    Node(
                        node_id=method_node_id,
                        node_type="METHOD",
                        name=method["name"],
                        file=relative_file,
                    )
                )
                add_edge_once(class_node_id, "CONTAINS", method_node_id)

                class_method_nodes[file_path][method["name"]] = method_node_id
                callable_bodies.append(
                    {
                        "node_id": method_node_id,
                        "file_path": file_path,
                        "body": method["body"],
                    }
                )

        for function_item in parse_top_level_functions(text):
            function_node_id = to_function_node_id(f, function_item["name"])
            graph.add_node(
                Node(
                    node_id=function_node_id,
                    node_type="FUNCTION",
                    name=function_item["name"],
                    file=relative_file,
                )
            )
            add_edge_once(src_id, "CONTAINS", function_node_id)

            top_level_function_nodes[file_path][function_item["name"]] = function_node_id
            callable_bodies.append(
                {
                    "node_id": function_node_id,
                    "file_path": file_path,
                    "body": function_item["body"],
                }
            )

    # 3) Add IMPORTS edges and CALLS edges
    # IMPORTS means one file imports another file.
    # CALLS means a function or method calls another function or method.
    # Example: FILE --IMPORTS--> FILE and METHOD --CALLS--> FUNCTION
    for f in ts_files:
        file_path = f.resolve()
        src_id = node_id_by_path[file_path]
        text = f.read_text(encoding="utf-8")
        imported_symbol_targets: dict[str, str] = {}

        for imp in parse_import_paths(text):
            resolved = resolve_import_file(file_path, imp)
            if resolved is None:
                continue

            # Keep only imports that exist in the project folder
            if resolved in node_id_by_path:
                tgt_id = node_id_by_path[resolved]
                add_edge_once(src_id, "IMPORTS", tgt_id)

        for local_name, import_path in parse_named_imports(text):
            resolved = resolve_import_file(file_path, import_path)
            if resolved is None:
                continue

            if resolved in top_level_function_nodes:
                imported_target = top_level_function_nodes[resolved].get(local_name)
                if imported_target:
                    imported_symbol_targets[local_name] = imported_target

        local_targets: dict[str, str] = {}
        local_targets.update(top_level_function_nodes[file_path])
        local_targets.update(class_method_nodes[file_path])

        for callable_item in callable_bodies:
            if callable_item["file_path"] != file_path:
                continue

            source_node_id = callable_item["node_id"]
            calls = parse_calls(callable_item["body"])

            for call_name in calls:
                target_node_id = local_targets.get(call_name) or imported_symbol_targets.get(call_name)

                if target_node_id and target_node_id != source_node_id:
                    add_edge_once(source_node_id, "CALLS", target_node_id)

    return graph

import json

def graph_to_json(graph):
    nodes = []
    edges = []

    for node in graph.nodes.values():
        nodes.append({
            "id": node.id,
            "type": node.type,
            "name": node.name,
            "file": node.file
        })

    for edge in graph.edges:
        edges.append({
            "source": edge.source,
            "type": edge.type,
            "target": edge.target
        })

    return {
        "nodes": nodes,
        "edges": edges
    }


if __name__ == "__main__":
    project_dir = Path("project").resolve()
    graph = build_graph_from_project(project_dir)

    graph.show_nodes()
    graph.show_edges()

    # Choose start node from filename
    start_file = "auth.ts"
    start_id = f"file_{Path(start_file).stem.lower()}"

    print("\nBFS TRAVERSAL")
    graph.bfs(start_id)

    print("\nDFS TRAVERSAL")
    graph.dfs(start_id)

    result = graph_to_json(graph)
    print("\nDOCUMENT SCHEMA")
    print(json.dumps(result, indent=2))