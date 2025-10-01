#!/usr/bin/env node
/**
 * Standalone benchmark runner
 *
 * Usage:
 *   npm run benchmark             # Run all benchmarks
 *   npm run benchmark -- --size=small
 *   npm run benchmark -- --size=large --operation=search
 */

import { tmpdir } from 'os';
import { join } from 'path';
import { rm } from 'fs/promises';
import { ZoneScanner } from '../src/scanner.js';
import { NoteParser } from '../src/parser.js';
import { PerfMonitor } from '../src/perf.js';
import { generateFixtures, FIXTURE_CONFIGS, FixtureConfig } from '../src/__tests__/fixtures.js';

interface BenchmarkOptions {
  size: 'small' | 'medium' | 'large' | 'xlarge';
  operation?: 'scan' | 'search' | 'tags' | 'actionables' | 'all';
  iterations?: number;
}

function parseArgs(): BenchmarkOptions {
  const args = process.argv.slice(2);
  const options: BenchmarkOptions = {
    size: 'medium',
    operation: 'all',
    iterations: 1
  };

  for (const arg of args) {
    if (arg.startsWith('--size=')) {
      options.size = arg.split('=')[1] as any;
    } else if (arg.startsWith('--operation=')) {
      options.operation = arg.split('=')[1] as any;
    } else if (arg.startsWith('--iterations=')) {
      options.iterations = parseInt(arg.split('=')[1], 10);
    }
  }

  return options;
}

async function runBenchmark(
  scanner: ZoneScanner,
  perf: PerfMonitor,
  operation: string,
  config: FixtureConfig
): Promise<void> {
  const parser = new NoteParser();

  switch (operation) {
    case 'scan':
      console.log('\n📊 Benchmarking: Full zone scan (cold cache)');
      scanner.clearCache();
      await perf.timeAsync('scanZones', async () => {
        const notes = await scanner.scanZones(['notes', 'inbox', 'daily']);
        console.log(`  → Loaded ${notes.length} notes`);
        return notes;
      });
      break;

    case 'search':
      console.log('\n🔍 Benchmarking: Text search');
      scanner.clearCache();
      await perf.timeAsync('search-text', async () => {
        const results = await scanner.search({
          query: 'implementation',
          limit: 20
        });
        console.log(`  → Found ${results.length} matches`);
        return results;
      });
      break;

    case 'tags':
      console.log('\n🏷️  Benchmarking: Tag operations');
      scanner.clearCache();

      await perf.timeAsync('getAllTags', async () => {
        const tags = await scanner.getAllTags(['notes', 'daily']);
        console.log(`  → Found ${tags.size} unique tags`);
        return tags;
      });

      scanner.clearCache();
      await perf.timeAsync('listByTags', async () => {
        const results = await scanner.listByTags(
          ['project', 'design'],
          'any',
          'modified'
        );
        console.log(`  → Found ${results.length} notes`);
        return results;
      });
      break;

    case 'actionables':
      console.log('\n✅ Benchmarking: Actionable extraction');
      scanner.clearCache();
      await perf.timeAsync('extractActionables', async () => {
        const notes = await scanner.scanZones(['notes', 'daily']);
        let actionables: any[] = [];

        for (const note of notes) {
          const noteActionables = parser.extractActionables(note);
          actionables.push(...noteActionables);
        }

        console.log(`  → Found ${actionables.length} actionables`);
        return actionables;
      });
      break;
  }
}

async function main() {
  const options = parseArgs();

  console.log('🚀 Thread-Stack MCP Benchmark Runner');
  console.log('====================================');
  console.log(`Size: ${options.size} (${FIXTURE_CONFIGS[options.size].noteCount} notes)`);
  console.log(`Operation: ${options.operation}`);
  console.log(`Iterations: ${options.iterations}`);

  const testDir = join(tmpdir(), `thread-stack-benchmark-${Date.now()}`);
  const perf = new PerfMonitor();

  try {
    // Generate fixtures
    console.log('\n📝 Generating test fixtures...');
    await generateFixtures({
      basePath: testDir,
      ...FIXTURE_CONFIGS[options.size]
    });

    const scanner = new ZoneScanner(testDir, new NoteParser());

    // Run benchmarks
    const operations = options.operation === 'all'
      ? ['scan', 'search', 'tags', 'actionables']
      : [options.operation!];

    for (let i = 0; i < options.iterations!; i++) {
      if (options.iterations! > 1) {
        console.log(`\n=== Iteration ${i + 1}/${options.iterations} ===`);
      }

      for (const op of operations) {
        await runBenchmark(scanner, perf, op, FIXTURE_CONFIGS[options.size]);
      }
    }

    // Print report
    console.log('\n' + perf.report());

    // Export JSON report
    const jsonPath = join(process.cwd(), `benchmark-${options.size}-${Date.now()}.json`);
    const fs = await import('fs/promises');
    await fs.writeFile(jsonPath, perf.toJSON(), 'utf-8');
    console.log(`📊 Detailed results saved to: ${jsonPath}`);

  } finally {
    // Cleanup
    console.log('\n🧹 Cleaning up test fixtures...');
    await rm(testDir, { recursive: true, force: true });
  }
}

main().catch(err => {
  console.error('❌ Benchmark failed:', err);
  process.exit(1);
});
