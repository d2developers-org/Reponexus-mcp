import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { CodeGraph } from './CodeGraph';
import { WorkspaceSignal } from './signals/WorkspaceSignal';
import { QuerySignal } from './signals/QuerySignal';
import { ErrorSignal } from './signals/ErrorSignal';
import { DiffSignal } from './signals/DiffSignal';
import { SessionSignal } from './signals/SessionSignal';
import { TargetResolver } from './TargetResolver';
import { ActivationEngine } from './ActivationEngine';
import { LineResolver } from './LineResolver';
import { ContextAssembler } from './ContextAssembler';
import { Activation, ContextPlan, QueryInput, SAGEGraph } from './types';

export function executePlanPipeline(
  input: QueryInput,
  repoRoot: string = process.cwd()
): ContextPlan {
  const root = path.resolve(repoRoot);
  const graphPath = path.join(root, 'data', 'sage-graph.json');

  let graph: SAGEGraph;
  if (fs.existsSync(graphPath)) {
    graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
  } else {
    console.log('[SAGE] sage-graph.json not found. Building multi-resolution graph...');
    graph = CodeGraph.buildAndPersist(root, graphPath);
  }

  // 1. Collect signals
  const collectors = [
    new WorkspaceSignal(),
    new QuerySignal(),
    new ErrorSignal(),
    new DiffSignal(),
    new SessionSignal(),
  ];

  const allActivations: Activation[] = [];
  for (const collector of collectors) {
    allActivations.push(...collector.collect(input, graph));
  }

  // 2. Deterministic Target Resolution
  const targetResolution = TargetResolver.resolve(input, graph, allActivations);

  // 3. Spreading Max-Propagation Activation
  const activationEngine = new ActivationEngine();
  const activatedResults = activationEngine.activate(graph, allActivations, targetResolution);

  // 4. Exact Line Resolution
  const lineResolver = new LineResolver(root);
  const regions = lineResolver.resolve(activatedResults, input, graph);

  // 5. Context Assembly
  const assembler = new ContextAssembler(root);
  return assembler.assemble(input, targetResolution, regions, graph, allActivations);
}

function parseArgs(): { input: QueryInput; jsonOutput: boolean } {
  const args = process.argv.slice(2);
  let activeFile: string | undefined;
  let cursorLine: number | undefined;
  let openFiles: string[] | undefined;
  let errors: string | undefined;
  let diff: string | undefined;
  let jsonOutput = false;
  const queryParts: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--file' && i + 1 < args.length) {
      activeFile = args[++i];
    } else if (arg === '--cursor' && i + 1 < args.length) {
      cursorLine = parseInt(args[++i], 10);
    } else if (arg === '--open' && i + 1 < args.length) {
      openFiles = args[++i].split(',').map((s) => s.trim());
    } else if (arg === '--errors' && i + 1 < args.length) {
      errors = args[++i];
    } else if (arg === '--diff') {
      if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        diff = args[++i];
      } else {
        try {
          diff = execSync('git diff', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
        } catch {
          diff = undefined;
        }
      }
    } else if (arg === '--json') {
      jsonOutput = true;
    } else if (!arg.startsWith('--')) {
      queryParts.push(arg);
    }
  }

  return {
    input: {
      query: queryParts.join(' ').trim(),
      activeFile,
      cursorLine,
      openFiles,
      errors,
      diff,
    },
    jsonOutput,
  };
}

function main(): void {
  const { input, jsonOutput } = parseArgs();

  if (!input.query && !input.activeFile && !input.errors) {
    console.log('Usage: npm run plan -- "<query>" [--file <path>] [--cursor <line>] [--errors "<text>"] [--diff] [--json]');
    return;
  }

  const plan = executePlanPipeline(input);

  if (jsonOutput) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  // Formatted human-readable output
  console.log('\n======================================================');
  console.log('                 SAGE CONTEXT PLAN                    ');
  console.log('======================================================');
  console.log(`Query:     "${plan.query}"`);
  console.log(`Action:    ${plan.action.type.toUpperCase()} (confidence: ${(plan.action.confidence * 100).toFixed(0)}%)`);
  console.log(`Status:    ${plan.status.toUpperCase()}`);
  console.log(`Truncated: ${plan.truncated ? 'YES' : 'NO'}`);

  console.log('\n------------------------------------------------------');
  console.log('PRIMARY TARGET:');
  if (plan.target) {
    console.log(`  Name:       ${plan.target.name} (${plan.target.type})`);
    console.log(`  Location:   ${plan.target.filePath}:${plan.target.startLine}-${plan.target.endLine}`);
    console.log(`  Confidence: ${(plan.target.confidence * 100).toFixed(0)}% (Priority: P${plan.target.matchPriority})`);
    console.log('  Reasons:');
    for (const r of plan.target.reasons) {
      console.log(`    - ${r}`);
    }
  } else {
    console.log('  No specific primary target identified.');
  }

  console.log('\n------------------------------------------------------');
  console.log(`RESOLVED CODE REGIONS (${plan.regions.length}):`);
  for (const [idx, region] of plan.regions.entries()) {
    console.log(`  [${idx + 1}] ${region.filePath} : L${region.startLine}-L${region.endLine} (Score: ${region.activationScore.toFixed(2)})`);
    for (const r of region.reasons.slice(0, 2)) {
      console.log(`      * ${r}`);
    }
  }

  console.log('\n------------------------------------------------------');
  console.log('EXTRACTED CONTEXT CODE:');
  console.log(plan.code || '// [No code extracted]');

  console.log('\n------------------------------------------------------');
  console.log('SIGNAL SUMMARY:');
  for (const [src, count] of Object.entries(plan.signalSummary)) {
    console.log(`  - ${src}: ${count} activations`);
  }
  console.log('======================================================\n');
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error('[SAGE] Pipeline execution failed:', error);
    process.exitCode = 1;
  }
}

