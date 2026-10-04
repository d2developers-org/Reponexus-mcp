import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import { indexRepository } from './indexRepository';

test('indexes supported languages into the shared graph shape', () => {
  const repository = fs.mkdtempSync(path.join(os.tmpdir(), 'reponexus-indexer-'));
  const samples: Record<string, string> = {
    'app.js': `import { run } from './runner.js';
class Service { execute() { run(); } }
function helper(value) { return value; }`,
    'api.ts': `interface Item { id: number; }
export function build(item: Item) { return item; }`,
    'view.tsx': `export const View = () => <div />;`,
    'worker.py': `from os import path
class Worker:
    def execute(self, value):
        return clean(value)
def clean(value):
    return value`,
    'Worker.java': `import java.util.List;
class Worker {
  void run() { clean(); }
  void clean() {}
}`,
    'widget.cpp': `#include <vector>
class Widget {
public:
  void run() { clean(); }
  void clean() {}
};`,
    'main.go': `package main
import "fmt"
func run() { fmt.Println("ready") }`,
    'lib.rs': `use std::fmt;
struct Worker;
impl Worker { fn run(&self) { clean(); } }
fn clean() {}`,
  };

  try {
    for (const [file, source] of Object.entries(samples)) {
      fs.writeFileSync(path.join(repository, file), source, 'utf8');
    }

    const graph = indexRepository(repository);
    const names = new Set(graph.symbols.map((symbol) => symbol.name));
    const languages = new Set(
      graph.symbols
        .map((symbol) => symbol.language)
        .filter((language): language is NonNullable<typeof language> => Boolean(language)),
    );

    assert.equal(graph.files.length, 8);
    assert.equal(graph.files.includes('app.js'), true);
    assert.equal(names.has('Service'), true);
    assert.equal(names.has('Item'), true);
    assert.equal(names.has('Worker'), true);
    assert.equal(names.has('Widget'), true);
    assert.equal(names.has('run'), true);
    assert.deepEqual(
      [...languages].sort(),
      ['cpp', 'go', 'java', 'javascript', 'python', 'rust', 'typescript'],
    );
    assert.equal(graph.relationships.some((edge) => edge.relation === 'IMPORTS'), true);
    assert.equal(graph.relationships.some((edge) => edge.relation === 'CALLS'), true);
    const symbolIds = new Set(graph.symbols.map((symbol) => symbol.id));
    assert.equal(
      graph.relationships.every(
        (edge) => symbolIds.has(edge.fromId) && symbolIds.has(edge.toId),
      ),
      true,
    );
  } finally {
    fs.rmSync(repository, { recursive: true, force: true });
  }
});
