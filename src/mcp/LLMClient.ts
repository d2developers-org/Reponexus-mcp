import Groq from "groq-sdk";
import dotenv from "dotenv";

// Ensure env variables are loaded
dotenv.config();

export class LLMClient {
  private groq: Groq;
  private model: string;

  constructor(model: string = "llama-3.3-70b-versatile") {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error("GROQ_API_KEY is missing from environment variables");
    }
    this.groq = new Groq({ apiKey });
    this.model = model;
  }

  /**
   * Generates a unified diff using the Groq API.
   * Can be extended later to support streaming if needed.
   */
  public async generatePatch(systemPrompt: string, userPrompt: string): Promise<string> {
    try {
      const completion = await this.groq.chat.completions.create({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        model: this.model,
        temperature: 0.1, // Low temperature for precise, deterministic code generation
      });

      const responseText = completion.choices[0]?.message?.content || "";
      
      // Basic cleanup: if LLM wrapped in markdown diff block, strip it
      return this.cleanMarkdownDiff(responseText);
    } catch (error) {
      console.error("LLM Error generating patch:", error);
      throw new Error("Failed to generate patch from LLM.");
    }
  }

  private cleanMarkdownDiff(rawText: string): string {
    let cleanText = rawText.trim();
    if (cleanText.startsWith("```diff")) {
      cleanText = cleanText.substring(7);
    } else if (cleanText.startsWith("```")) {
      cleanText = cleanText.substring(3);
    }
    
    if (cleanText.endsWith("```")) {
      cleanText = cleanText.substring(0, cleanText.length - 3);
    }
    
    return cleanText.trim();
  }
}
