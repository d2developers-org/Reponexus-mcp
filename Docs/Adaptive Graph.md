Adaptive Graph-Based Context Planning for Large Language Models in Software Engineering
Abstract
Large Language Models (LLMs) have become an essential part of modern software development by assisting developers with code generation, debugging, refactoring, and documentation. However, one of the biggest limitations of current AI coding assistants is their dependence on large amounts of source code context. When developers request modifications, existing systems often retrieve entire files or large portions of a repository before generating a response. This increases token consumption, computational cost, response latency, and sometimes reduces the accuracy of generated code due to unnecessary context.
This project proposes Adaptive Graph-Based Context Planning (AGCP), an intelligent context orchestration system that builds a semantic knowledge graph of a software repository and dynamically selects only the minimal code required to complete a user's request. Instead of allowing the LLM to search through the project, AGCP performs deterministic code analysis using Abstract Syntax Trees (ASTs), symbol indexing, dependency graphs, call graphs, and import relationships. Based on the user's intent, the system identifies affected components, expands only the necessary dependencies, and constructs an optimized context package for the LLM.
The proposed architecture significantly reduces token usage while preserving edit accuracy. It also improves scalability for enterprise-scale repositories and provides a reusable code intelligence layer that can integrate with any Model Context Protocol (MCP)-compatible LLM.
________________________________________
Problem Statement
Current AI coding assistants face several challenges when working with large software repositories:
•	They frequently retrieve more code than necessary.
•	Token consumption increases rapidly with repository size.
•	The LLM spends part of its reasoning budget discovering relationships instead of solving the user's request.
•	Context windows become saturated with unrelated code.
•	Large prompts increase latency and API costs.
These limitations become increasingly significant in enterprise repositories containing thousands of files and millions of lines of code.
________________________________________
Proposed Solution
Adaptive Graph-Based Context Planning introduces a deterministic code intelligence layer between the user and the LLM.
Instead of directly sending repository files to the LLM, the system first analyzes the repository and constructs a semantic graph representing:
•	Files
•	Classes
•	Functions
•	Components
•	Interfaces
•	Variables
•	Imports
•	Exports
•	API Endpoints
•	Database Models
•	Call Relationships
•	Dependency Relationships
When a user submits a request, the system performs graph traversal to determine the smallest possible set of code required for the modification.
Only this optimized context package is forwarded to the LLM.
________________________________________
System Architecture
                User Query
                     │
                     ▼
            Intent Understanding
                     │
                     ▼
       Adaptive Context Planner
                     │
                     ▼
         Semantic Code Graph Engine
        ┌───────────────────────────────┐
        │ 		AST Parser              	       │
        │ 		Symbol Index            	       │
        │ 		Call Graph              	       │
        │ 		Dependency Graph        	       │
        │ 		Import Graph                          │
        │ 		Reference Analyzer      	       │
        └────────────────────────────-───┘
                     │
                     ▼
        Minimal Context Generator
                     │
                     ▼
                    LLM
                     │
                     ▼
             Patch Generation
                     │
                     ▼
             Validation Engine
________________________________________
Workflow
Step 1 – Repository Analysis
The repository is parsed using AST-based analysis.
The parser extracts:
•	Functions
•	Classes
•	Variables
•	Components
•	Imports
•	Exports
________________________________________
Step 2 – Graph Construction
The extracted symbols become graph nodes.
Relationships become graph edges.
Example:
Login.tsx
     │ imports
     ▼
AuthService

AuthService
     │ calls
     ▼
verifyToken()

verifyToken()
     │ reads
     ▼
Database
________________________________________
Step 3 – Intent Analysis
The user's request is analyzed.
Example:
"Replace JWT authentication with Clerk."
The planner identifies:
•	JWT module
•	Authentication middleware
•	Login API
•	User context
•	Protected routes
________________________________________
Step 4 – Adaptive Context Expansion
Instead of loading every related file, the planner gradually expands only the required dependencies until sufficient context is obtained.
________________________________________
Step 5 – Context Optimization
Only the required:
•	Functions
•	Types
•	Interfaces
•	Imports
•	Dependencies
are packaged for the LLM.
This dramatically reduces unnecessary tokens.
________________________________________
Step 6 – Code Generation
The optimized context is sent to the LLM.
The LLM focuses only on solving the requested task instead of searching the repository.
________________________________________
Step 7 – Validation
Generated code is validated through:
•	Compilation
•	Static analysis
•	Unit tests
•	Build verification
Only validation errors are returned to the LLM if further refinement is needed.
________________________________________
Key Features
•	Semantic repository understanding
•	Graph-based dependency analysis
•	Dynamic context expansion
•	Token-aware context optimization
•	Language-independent architecture
•	Incremental repository indexing
•	MCP-compatible tool interface
•	Validation before code application
________________________________________
Expected Benefits
•	Significant reduction in LLM token usage
•	Lower API costs
•	Faster response generation
•	Higher code modification accuracy
•	Better scalability for large repositories
•	Reduced context-window saturation
•	Improved developer productivity
________________________________________
Novelty
Many existing coding assistants employ repository indexing, symbol search, and context retrieval. However, most of these mechanisms are proprietary or tightly integrated into specific products.
This project proposes an open, MCP-compatible architecture where a dedicated context planning engine performs deterministic code analysis and graph traversal before invoking an LLM. The emphasis is on adaptive context planning rather than relying on the LLM to discover repository structure through large prompts.
________________________________________
Future Scope
Future enhancements may include:
•	Multi-language repository support
•	Distributed graph indexing for enterprise repositories
•	Learning-based context ranking
•	Automated refactoring recommendations
•	Multi-agent collaboration
•	IDE integration
•	Cross-repository dependency analysis
•	Fine-tuned context planning models
________________________________________
Technologies
•	Model Context Protocol (MCP)
•	Tree-sitter / ts-morph
•	Language Server Protocol (LSP)
•	Graph Database (Neo4j, KuzuDB, or FalkorDB)
•	Node.js / TypeScript
•	Vector search (optional)
•	Git integration
•	Large Language Models (GPT, Claude, Gemini, etc.)
________________________________________
Purpose of the Project
The primary purpose of Adaptive Graph-Based Context Planning is to create an intelligent middleware layer between software repositories and Large Language Models. Instead of allowing the LLM to search through entire projects, the system automatically identifies, analyzes, and retrieves only the code necessary to satisfy the user's request. This approach reduces token consumption, lowers inference costs, improves response speed, and increases the accuracy of AI-assisted software development while remaining compatible with any MCP-enabled coding assistant or LLM.
