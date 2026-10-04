export interface FileContext {
  filePath: string;
  code: string;
}

export class PromptBuilder {
  public static buildSystemPrompt(): string {
    return `You are an expert automated code modification agent.
Given a user request and context code snippets from the codebase, generate a precise UNIFIED DIFF patch.

RULES:
1. Output ONLY the unified diff block using standard \`--- a/file\` and \`+++ b/file\` syntax.
2. Include correct line numbers in hunk headers \`@@ -start,count +start,count @@\`.
3. Do not include markdown conversational filler outside of the diff block.
4. Ensure code formatting and indentation match the original source file exactly.`;
  }

  public static buildUserPrompt(query: string, contextFiles: FileContext[]): string {
    let contextStr = "Code Context:\n\n";
    
    for (const file of contextFiles) {
      contextStr += `File: ${file.filePath}\n`;
      contextStr += `\`\`\`\n${file.code}\n\`\`\`\n\n`;
    }

    return `User Query: ${query}\n\n${contextStr}\nPlease generate the unified diff patch to fulfill the user query.`;
  }
}
