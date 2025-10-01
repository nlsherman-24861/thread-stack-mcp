/**
 * Performance benchmarks for thread-stack MCP operations
 */

import { describe, test, beforeAll, afterAll } from '@jest/globals';
import { tmpdir } from 'os';
import { join } from 'path';
import { rm } from 'fs/promises';
import { ZoneScanner } from '../scanner.js';
import { NoteParser } from '../parser.js';
import { PerfMonitor } from '../perf.js';
import { generateFixtures, FIXTURE_CONFIGS } from './fixtures.js';

const BENCHMARK_DIR = join(tmpdir(), 'thread-stack-benchmark');

describe('Performance Benchmarks', () => {
  let scanner: ZoneScanner;
  let perf: PerfMonitor;

  beforeAll(async () => {
    // Generate medium-sized test corpus
    await generateFixtures({
      basePath: BENCHMARK_DIR,
      ...FIXTURE_CONFIGS.medium
    });

    scanner = new ZoneScanner(BENCHMARK_DIR, new NoteParser());
    perf = new PerfMonitor();
  }, 60000); // 60s timeout for fixture generation

  afterAll(async () => {
    // Cleanup
    await rm(BENCHMARK_DIR, { recursive: true, force: true });

    // Print final report
    console.log('\n' + perf.report());
  });

  test('benchmark: scanZones (cold cache)', async () => {
    scanner.clearCache();

    await perf.timeAsync(
      'scanZones-cold',
      async () => {
        const notes = await scanner.scanZones(['notes', 'daily']);
        return notes;
      },
      { zones: ['notes', 'daily'] }
    );
  }, 30000);

  test('benchmark: scanZones (warm cache)', async () => {
    // Prime cache
    await scanner.scanZones(['notes', 'daily']);

    await perf.timeAsync(
      'scanZones-warm',
      async () => {
        const notes = await scanner.scanZones(['notes', 'daily']);
        return notes;
      },
      { zones: ['notes', 'daily'] }
    );
  }, 30000);

  test('benchmark: search with text query', async () => {
    scanner.clearCache();

    await perf.timeAsync(
      'search-text-query',
      async () => {
        const results = await scanner.search({
          query: 'implementation',
          zones: ['notes', 'daily'],
          limit: 20
        });
        return results;
      },
      { query: 'implementation' }
    );
  }, 30000);

  test('benchmark: search with tags only', async () => {
    scanner.clearCache();

    await perf.timeAsync(
      'search-tags-only',
      async () => {
        const results = await scanner.search({
          tags: ['project', 'design'],
          zones: ['notes', 'daily'],
          limit: 20
        });
        return results;
      },
      { tags: ['project', 'design'] }
    );
  }, 30000);

  test('benchmark: listByTags', async () => {
    scanner.clearCache();

    await perf.timeAsync(
      'listByTags',
      async () => {
        const results = await scanner.listByTags(
          ['architecture', 'design'],
          'any',
          'modified',
          ['notes', 'daily']
        );
        return results;
      },
      { tags: ['architecture', 'design'] }
    );
  }, 30000);

  test('benchmark: getAllTags', async () => {
    scanner.clearCache();

    await perf.timeAsync(
      'getAllTags',
      async () => {
        const tags = await scanner.getAllTags(['notes', 'daily']);
        return tags;
      }
    );
  }, 30000);

  test('benchmark: get actionable items', async () => {
    scanner.clearCache();

    await perf.timeAsync(
      'getActionableItems',
      async () => {
        const notes = await scanner.scanZones(['notes', 'daily']);
        const parser = new NoteParser();
        let actionables: any[] = [];

        for (const note of notes) {
          const noteActionables = parser.extractActionables(note);
          actionables.push(...noteActionables);
        }

        return actionables;
      }
    );
  }, 30000);

  test('benchmark: findRelated', async () => {
    scanner.clearCache();

    // First, get a note to use as reference
    const notes = await scanner.scanZones(['notes']);
    const referencePath = notes[0].path;

    await perf.timeAsync(
      'findRelated',
      async () => {
        const related = await scanner.findRelated(referencePath, 5, ['notes', 'daily']);
        return related;
      },
      { referencePath }
    );
  }, 30000);

  test('benchmark: loadNote (single, cold)', async () => {
    scanner.clearCache();
    const notes = await scanner.scanZones(['notes']);
    const targetPath = notes[50].path;
    const fullPath = join(BENCHMARK_DIR, targetPath);

    await perf.timeAsync(
      'loadNote-single-cold',
      async () => {
        const note = await scanner.loadNote(fullPath, false);
        return note;
      }
    );
  });

  test('benchmark: loadNote (single, warm)', async () => {
    const notes = await scanner.scanZones(['notes']);
    const targetPath = notes[50].path;
    const fullPath = join(BENCHMARK_DIR, targetPath);

    // Prime cache
    await scanner.loadNote(fullPath);

    await perf.timeAsync(
      'loadNote-single-warm',
      async () => {
        const note = await scanner.loadNote(fullPath, true);
        return note;
      }
    );
  });
});

describe('Scaling Benchmarks', () => {
  const sizes = ['small', 'medium'] as const;

  for (const size of sizes) {
    describe(`${size} corpus (${FIXTURE_CONFIGS[size].noteCount} notes)`, () => {
      let scanner: ZoneScanner;
      let perf: PerfMonitor;
      const testDir = join(tmpdir(), `thread-stack-benchmark-${size}`);

      beforeAll(async () => {
        await generateFixtures({
          basePath: testDir,
          ...FIXTURE_CONFIGS[size]
        });

        scanner = new ZoneScanner(testDir, new NoteParser());
        perf = new PerfMonitor();
      }, 120000);

      afterAll(async () => {
        await rm(testDir, { recursive: true, force: true });
        console.log(`\n=== ${size.toUpperCase()} CORPUS ===`);
        console.log(perf.report());
      });

      test(`scan all notes (${size})`, async () => {
        scanner.clearCache();

        await perf.timeAsync(
          `${size}-full-scan`,
          async () => {
            const notes = await scanner.scanZones(['notes', 'inbox', 'daily']);
            return notes;
          },
          { noteCount: FIXTURE_CONFIGS[size].noteCount }
        );
      }, 60000);

      test(`text search (${size})`, async () => {
        scanner.clearCache();

        await perf.timeAsync(
          `${size}-search`,
          async () => {
            const results = await scanner.search({
              query: 'implementation',
              limit: 20
            });
            return results;
          }
        );
      }, 60000);

      test(`get all tags (${size})`, async () => {
        scanner.clearCache();

        await perf.timeAsync(
          `${size}-getAllTags`,
          async () => {
            const tags = await scanner.getAllTags();
            return tags;
          }
        );
      }, 60000);
    });
  }
});
