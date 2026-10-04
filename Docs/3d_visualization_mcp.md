# 3D Visual Graph in MCP Server

This document explains how to create a 3D visual graph from the architecture JSON data (`output.json`) and how to serve it through an MCP (Model Context Protocol) server.

## 1. The Building Blocks (Nodes and Edges)
*   **Nodes (The dots/spheres):** Items like files (e.g., `sample.ts`) and symbols (e.g., `AuthService`, `login`) become distinct 3D objects in space. You can color-code them by type.
*   **Edges (The lines/links):** Relationships (like `IMPORTS`, `CONTAINS`, `CALLS`) connect these nodes.

## 2. The 3D Layout (Force-Directed Graph)
A **Force-Directed Graph algorithm** creates a cohesive 3D structure.
*   Nodes act as repelling magnets, and links act as physical springs.
*   Connected items pull each other close, while unrelated ones push away, creating a floating constellation of the codebase architecture.

## 3. Animation and Interactivity
*   **Floating/Settling:** As the physics engine calculates the layout, nodes animate and bounce until finding their resting spots.
*   **Camera Controls:** Users can pan, zoom, and rotate the entire 3D structure.
*   **Hover Effects:** Highlighting a specific node dims others and illuminates its direct connections.

---

## Integrating with an MCP Server

An MCP server is fundamentally a "backend" that provides data, tools, and context to an MCP Client (like an AI IDE, Claude Desktop, or custom chat interface) and does not have a frontend UI. 

To let a user see and interact with a 3D graph, here are three main architectures:

### Option 1: Returning a Webpage Link (Recommended)
Your MCP server runs alongside a lightweight web server (like Express.js) hosting the visualization page.
*   **How it works:** An MCP Tool generates the data and returns a simple text response to the AI: *"Graph generated! View it here: http://localhost:3000/graph"*.
*   **User Experience:** The AI replies with a clickable link. The user clicks it, their web browser opens, and they see the 3D graph.

### Option 2: Returning an HTML "Artifact" (If Client Supports It)
For advanced clients that support rendering HTML/UI components directly inside the chat window (like Anthropic's Artifacts).
*   **How it works:** The MCP tool returns a massive string of HTML, CSS, and JavaScript (which includes the Three.js library and the JSON data injected into it).
*   **User Experience:** The AI client takes that HTML string and renders it as an interactive web-view directly inside the chat interface.

### Option 3: Client-Side Rendering (Custom Client)
If you are building your *own* custom MCP Client (your own chat app or IDE extension).
*   **How it works:** You build the 3D rendering logic into your front-end Client app using tools like `3d-force-graph`.
*   **User Experience:** Your MCP server simply exposes `output.json` as an MCP Resource. The custom client detects this data and natively pops open a 3D graph window in your app's UI.
