import { Activation, QueryAction, QueryInput, SAGEGraph, SAGENode, SignalSource } from '../types';
import { SignalCollector } from './SignalCollector';
import { splitKeywords } from '../CodeGraph';

const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and',
  'any', 'are', 'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below',
  'between', 'both', 'but', 'by', 'can', 'could', 'did', 'do', 'does', 'doing',
  'down', 'during', 'each', 'few', 'for', 'from', 'further', 'had', 'has', 'have',
  'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his', 'how',
  'i', 'if', 'in', 'into', 'is', 'it', 'its', 'itself', 'just', 'me', 'more',
  'most', 'my', 'myself', 'no', 'nor', 'not', 'now', 'of', 'off', 'on', 'once',
  'only', 'or', 'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over', 'own',
  'same', 'she', 'should', 'so', 'some', 'such', 'than', 'that', 'the', 'their',
  'theirs', 'them', 'themselves', 'then', 'there', 'these', 'they', 'this', 'those',
  'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was', 'we', 'were',
  'what', 'when', 'where', 'which', 'while', 'who', 'whom', 'why', 'with', 'would',
  'you', 'your', 'yours', 'yourself', 'yourselves', 'please', 'can', 'cant', 'cannot'
]);

const GENERIC_DEV_WORDS = new Set([
  'fix', 'broken', 'work', 'working', 'works', 'something', 'please', 'resolve',
  'issue', 'problem', 'code', 'thing', 'file', 'function', 'method', 'class',
  'check', 'fail', 'failing', 'crash', 'run', 'test', 'help', 'app', 'bug',
  'doesnt', 'does', 'not', 'make', 'give', 'get', 'see', 'look', 'find',
  'node', 'item', 'key', 'value', 'data', 'text', 'name', 'obj', 'object',
  'arg', 'args', 'param', 'params', 'result', 'res', 'req', 'err', 'line', 'lines'
]);

export class QuerySignal implements SignalCollector {
  public readonly source: SignalSource = 'query';

  /**
   * Deterministically detect action intent from the query.
   */
  public static extractAction(query: string): { type: QueryAction; confidence: number } {
    const q = query.toLowerCase();

    if (/\b(fix|bug|broken|error|crash|fail|issue|problem|patch|resolve|not\s+working|doesnt\s+work|doesn't\s+work)\b/i.test(q)) {
      return { type: 'fix', confidence: 0.9 };
    }
    if (/\b(create|add|implement|new|introduce|build|write|generate)\b/i.test(q)) {
      return { type: 'create', confidence: 0.85 };
    }
    if (/\b(refactor|clean|simplify|decouple|reorganize|rename|extract)\b/i.test(q)) {
      return { type: 'refactor', confidence: 0.85 };
    }
    if (/\b(replace|swap|switch|change|modify|update|convert|migrate|edit)\b/i.test(q)) {
      return { type: 'modify', confidence: 0.8 };
    }
    if (/\b(explain|how|what|where|why|describe|inspect|find|locate|show|trace)\b/i.test(q)) {
      return { type: 'explain', confidence: 0.85 };
    }

    return { type: 'unknown', confidence: 0.3 };
  }

  public collect(input: QueryInput, graph: SAGEGraph): Activation[] {
    const activations: Activation[] = [];
    const query = input.query.trim();
    if (!query) return activations;

    const lowerQuery = query.toLowerCase();

    // 1. Check for qualified symbols (e.g., PaymentService.calculateTotalPrice)
    const qualifiedMatches = query.match(/\b([A-Za-z0-9_$]+)\.([A-Za-z0-9_$]+)\b/g) || [];
    for (const qf of qualifiedMatches) {
      const [parentPart, childPart] = qf.split('.');
      for (const node of graph.nodes) {
        if (node.level === 'symbol' && node.name.toLowerCase() === childPart.toLowerCase()) {
          // Check if parent matches
          const parentNode = node.parentId ? graph.nodes.find((n) => n.id === node.parentId) : undefined;
          if (parentNode && parentNode.name.toLowerCase() === parentPart.toLowerCase()) {
            activations.push({
              nodeId: node.id,
              score: 0.95,
              source: this.source,
              reason: `Exact qualified symbol match: ${qf}`,
            });
          }
        }
      }
    }

    // 2. Extract potential symbol identifiers and filenames
    const tokens = query.match(/[A-Za-z0-9_\-\.\/]+/g) || [];
    const uniqueTokens = new Set<string>();
    for (const t of tokens) {
      const clean = t.replace(/^[^\w]+|[^\w]+$/g, '');
      if (clean && clean.length > 1) {
        uniqueTokens.add(clean);
      }
    }

    // Check exact symbol and file name matches
    for (const token of uniqueTokens) {
      const lowerToken = token.toLowerCase();
      if (GENERIC_DEV_WORDS.has(lowerToken) || STOP_WORDS.has(lowerToken)) {
        continue;
      }
      const isFileLike = token.includes('.') || token.includes('/');

      for (const node of graph.nodes) {
        // Exact symbol name (prefer declared symbols over bare local variables)
        if (node.level === 'symbol' && node.type !== 'VARIABLE') {
          if (node.name === token) {
            activations.push({
              nodeId: node.id,
              score: 0.90,
              source: this.source,
              reason: `Exact symbol name match: '${token}'`,
            });
          } else if (node.name.toLowerCase() === lowerToken && token.length > 2) {
            activations.push({
              nodeId: node.id,
              score: 0.80,
              source: this.source,
              reason: `Case-insensitive symbol name match: '${token}'`,
            });
          }
        }

        // Exact file name / path
        if (node.level === 'file') {
          if (node.name === token || node.filePath === token || node.filePath.endsWith('/' + token)) {
            activations.push({
              nodeId: node.id,
              score: 0.85,
              source: this.source,
              reason: `Exact file name match: '${token}'`,
            });
          } else if (isFileLike && (node.filePath.endsWith(token) || node.filePath.toLowerCase().endsWith(lowerToken))) {
            activations.push({
              nodeId: node.id,
              score: 0.80,
              source: this.source,
              reason: `File path suffix match: '${token}'`,
            });
          }
        }
      }
    }

    // 3. Quoted error patterns or error matches
    const quotedStrings = query.match(/["'`]([^"'`]+)["'`]/g) || [];
    for (const qs of quotedStrings) {
      const cleanStr = qs.slice(1, -1).trim();
      if (cleanStr.length > 2) {
        const lowerStr = cleanStr.toLowerCase();
        for (const node of graph.nodes) {
          const matchPattern = node.annotation.errorPatterns.some(
            (ep) => ep.toLowerCase().includes(lowerStr) || lowerStr.includes(ep.toLowerCase())
          );
          if (matchPattern) {
            activations.push({
              nodeId: node.id,
              score: 0.90,
              source: this.source,
              reason: `Quoted error pattern match: "${cleanStr}"`,
            });
          }
        }
      }
    }

    // 4. Identifier & keyword matching
    const queryKeywords = splitKeywords(query).filter((k) => !STOP_WORDS.has(k) && k.length > 2);
    const domainKeywords = queryKeywords.filter((k) => !GENERIC_DEV_WORDS.has(k));

    for (const node of graph.nodes) {
      let domainMatched = 0;
      let genericMatched = 0;

      for (const kw of queryKeywords) {
        const isDomain = !GENERIC_DEV_WORDS.has(kw);
        if (node.annotation.identifiers.some((id) => id.toLowerCase() === kw)) {
          if (isDomain) domainMatched += 2;
          else genericMatched += 1;
        } else if (node.annotation.keywords.includes(kw)) {
          if (isDomain) domainMatched += 1;
          else genericMatched += 1;
        }
      }

      if (domainMatched > 0) {
        const score = Math.min(0.70, 0.35 + domainMatched * 0.1);
        activations.push({
          nodeId: node.id,
          score,
          source: this.source,
          reason: `Matched ${domainMatched} domain identifier tokens`,
        });
      } else if (genericMatched > 0) {
        activations.push({
          nodeId: node.id,
          score: 0.20,
          source: this.source,
          reason: `Matched ${genericMatched} generic keywords`,
        });
      }

      // Check behavior tags
      for (const tag of node.annotation.behaviorTags) {
        if (lowerQuery.includes(tag)) {
          activations.push({
            nodeId: node.id,
            score: 0.40,
            source: this.source,
            reason: `Behavior tag match: '${tag}'`,
          });
        }
      }
    }

    return activations;
  }
}
