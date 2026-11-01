import * as fs from 'node:fs';
import * as path from 'node:path';
import { executePlanPipeline } from './planContext';
import { ContextPlan, QueryInput } from './types';

interface BenchmarkCase {
  id: string;
  category: string;
  description: string;
  input: QueryInput;
  expectedTarget: string | null;
  expectedFile: string | null;
  expectedStatus: string;
}

interface BenchmarkCaseResult {
  id: string;
  category: string;
  description: string;
  statusMatch: boolean;
  targetMatch: boolean;
  fileMatch: boolean;
  latencyMs: number;
  actualStatus: string;
  actualTarget: string | null;
  actualFile: string | null;
  codeLength: number;
  reasons: string[];
}

export function runBenchmark(repoRoot: string = process.cwd()): {
  summary: {
    totalCases: number;
    targetAccuracyPct: number;
    statusAccuracyPct: number;
    fileRecallPct: number;
    avgLatencyMs: number;
    avgContextChars: number;
    contextReductionPct: number;
  };
  results: BenchmarkCaseResult[];
} {
  const root = path.resolve(repoRoot);
  const benchmarkPath = path.join(root, 'data', 'benchmark.json');

  if (!fs.existsSync(benchmarkPath)) {
    throw new Error(`Benchmark file not found at: ${benchmarkPath}`);
  }

  const testCases: BenchmarkCase[] = JSON.parse(fs.readFileSync(benchmarkPath, 'utf8'));
  const results: BenchmarkCaseResult[] = [];

  // Approximate total repository source characters for context reduction calculation
  const totalRepoChars = 120000;

  let totalLatency = 0;
  let targetCorrect = 0;
  let statusCorrect = 0;
  let fileCorrect = 0;
  let totalCodeChars = 0;

  for (const tc of testCases) {
    const start = Date.now();
    const plan: ContextPlan = executePlanPipeline(tc.input, root);
    const latencyMs = Date.now() - start;
    totalLatency += latencyMs;

    const actualTarget = plan.target?.name ?? null;
    const actualFile = plan.target?.filePath ?? (plan.regions[0]?.filePath ?? null);

    // Target match
    const targetMatch =
      tc.expectedTarget === null
        ? actualTarget === null
        : actualTarget === tc.expectedTarget;
    if (targetMatch) targetCorrect++;

    // Status match
    const statusMatch = plan.status === tc.expectedStatus;
    if (statusMatch) statusCorrect++;

    // File match
    const fileMatch =
      tc.expectedFile === null
        ? actualFile === null
        : plan.regions.some((r) => r.filePath.includes(tc.expectedFile!)) || Boolean(actualFile && actualFile.includes(tc.expectedFile));
    if (fileMatch) fileCorrect++;

    const codeLength = plan.code ? plan.code.length : 0;
    totalCodeChars += codeLength;

    results.push({
      id: tc.id,
      category: tc.category,
      description: tc.description,
      statusMatch,
      targetMatch,
      fileMatch,
      latencyMs,
      actualStatus: plan.status,
      actualTarget,
      actualFile,
      codeLength,
      reasons: plan.target ? plan.target.reasons : [],
    });
  }

  const total = testCases.length;
  const avgCodeChars = Math.round(totalCodeChars / total);
  const contextReductionPct = Math.round(((totalRepoChars - avgCodeChars) / totalRepoChars) * 100);

  const summary = {
    totalCases: total,
    targetAccuracyPct: Math.round((targetCorrect / total) * 100),
    statusAccuracyPct: Math.round((statusCorrect / total) * 100),
    fileRecallPct: Math.round((fileCorrect / total) * 100),
    avgLatencyMs: Math.round(totalLatency / total),
    avgContextChars: avgCodeChars,
    contextReductionPct,
  };

  // Persist detailed results to data/benchmark-results.json
  const outPath = path.join(root, 'data', 'benchmark-results.json');
  fs.writeFileSync(outPath, JSON.stringify({ summary, results }, null, 2), 'utf8');

  return { summary, results };
}

function main(): void {
  console.log('\n======================================================');
  console.log('       SAGE BENCHMARK RETRIEVAL EVALUATION            ');
  console.log('======================================================\n');

  const { summary, results } = runBenchmark();

  console.log(`Evaluated ${summary.totalCases} benchmark test cases:\n`);

  console.log('Case ID                Category             Target   File     Status   Latency');
  console.log('--------------------------------------------------------------------------------');
  for (const r of results) {
    const tIcon = r.targetMatch ? '✔' : '✖';
    const fIcon = r.fileMatch ? '✔' : '✖';
    const sIcon = r.statusMatch ? '✔' : '✖';
    const id = r.id.padEnd(22);
    const cat = r.category.padEnd(20);
    console.log(`${id} ${cat} [${tIcon}]      [${fIcon}]      [${sIcon}]      ${r.latencyMs}ms`);
  }

  console.log('\n--------------------------------------------------------------------------------');
  console.log('BENCHMARK SUMMARY METRICS:');
  console.log(`  - Target Accuracy:          ${summary.targetAccuracyPct}%`);
  console.log(`  - File Retrieval Recall:    ${summary.fileRecallPct}%`);
  console.log(`  - Retrieval Status Accuracy: ${summary.statusAccuracyPct}%`);
  console.log(`  - Average Retrieval Latency: ${summary.avgLatencyMs} ms`);
  console.log(`  - Average Context Size:      ${summary.avgContextChars} characters`);
  console.log(`  - Context Token Reduction:   ${summary.contextReductionPct}% (vs sending full repo)`);
  console.log('======================================================\n');
  console.log(`Results saved to: data/benchmark-results.json\n`);

  if (summary.targetAccuracyPct < 90 || summary.statusAccuracyPct < 90) {
    console.error('Benchmark failed: target accuracy or status accuracy below 90% threshold.');
    process.exitCode = 1;
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error('[Benchmark Error]:', error);
    process.exitCode = 1;
  }
}
