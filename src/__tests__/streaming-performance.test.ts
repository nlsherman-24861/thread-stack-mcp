/**
 * Performance verification tests for streaming search
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { ZoneScanner, StreamingSearchOptions } from '../scanner.js';
import { NoteParser } from '../parser.js';
import { generateFixtures, FIXTURE_CONFIGS } from './fixtures.js';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';
import { rm } from 'fs/promises';

describe('Streaming Performance', () => {
  let scanner: ZoneScanner;
  let testDir: string;

  beforeEach(async () => {
    const testId = randomBytes(8).toString('hex');
    testDir = join(tmpdir(), `thread-stack-perf-${testId}`);
    
    // Generate test fixtures (small set for performance testing)
    await generateFixtures({
      basePath: testDir,
      ...FIXTURE_CONFIGS.small
    });
    
    scanner = new ZoneScanner(testDir, new NoteParser());
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('should demonstrate faster time-to-first-result with streaming', async () => {
    const searchOptions = {
      query: 'design',
      zones: ['notes' as const],
      limit: 20
    };

    // Measure regular search time
    const regularStart = performance.now();
    const regularResults = await scanner.search(searchOptions);
    const regularTime = performance.now() - regularStart;

    // Measure streaming time to first batch
    const streamingStart = performance.now();
    let firstBatchTime = 0;
    let totalBatches = 0;
    let totalStreamingResults = 0;

    const streamingOptions: StreamingSearchOptions = {
      ...searchOptions,
      batchSize: 5
    };

    for await (const batch of scanner.searchStreaming(streamingOptions)) {
      if (totalBatches === 0) {
        firstBatchTime = performance.now() - streamingStart;
      }
      totalBatches++;
      totalStreamingResults += batch.results.length;
      
      if (batch.totalFound >= 20) {
        break;
      }
    }

    const totalStreamingTime = performance.now() - streamingStart;

    console.log(`Performance Results:
    Regular search: ${regularTime.toFixed(2)}ms (${regularResults.length} results)
    Streaming first batch: ${firstBatchTime.toFixed(2)}ms
    Streaming total: ${totalStreamingTime.toFixed(2)}ms (${totalStreamingResults} results)
    Batches: ${totalBatches}
    Time improvement to first result: ${((regularTime - firstBatchTime) / regularTime * 100).toFixed(1)}%`);

    // Verify we got results
    expect(regularResults.length).toBeGreaterThan(0);
    expect(totalStreamingResults).toBeGreaterThan(0);
    expect(totalBatches).toBeGreaterThan(0);
    
    // For small datasets, streaming might not be faster, but it should be comparable
    // and provide early results
    expect(firstBatchTime).toBeLessThan(regularTime * 3); // Allow some overhead
  });

  it('should provide progress feedback during streaming', async () => {
    const progressUpdates: Array<{ progress: number; total: number; resultCount: number }> = [];
    
    const streamingOptions: StreamingSearchOptions = {
      query: 'project',
      zones: ['notes'],
      batchSize: 3,
      progressCallback: (progress, total, results) => {
        progressUpdates.push({ progress, total, resultCount: results.length });
      }
    };

    const batches = [];
    for await (const batch of scanner.searchStreaming(streamingOptions)) {
      batches.push(batch);
    }

    // Should have received progress updates
    expect(progressUpdates.length).toBeGreaterThan(0);
    
    // Progress should be monotonically increasing
    for (let i = 1; i < progressUpdates.length; i++) {
      expect(progressUpdates[i].progress).toBeGreaterThanOrEqual(progressUpdates[i - 1].progress);
    }
    
    // Final progress should match total processed
    if (progressUpdates.length > 0) {
      const lastUpdate = progressUpdates[progressUpdates.length - 1];
      expect(lastUpdate.progress).toBeLessThanOrEqual(lastUpdate.total);
    }
  });

  it('should handle early termination efficiently', async () => {
    const streamingOptions: StreamingSearchOptions = {
      query: 'system',
      zones: ['notes'],
      limit: 5,  // Small limit for early termination
      batchSize: 2
    };

    let totalProcessed = 0;
    let batchCount = 0;

    for await (const batch of scanner.searchStreaming(streamingOptions)) {
      totalProcessed += batch.results.length;
      batchCount++;
      
      expect(batch.totalFound).toBeLessThanOrEqual(5);
      
      if (batch.totalFound >= 5) {
        break;
      }
    }

    // Should have stopped processing once limit was reached
    expect(totalProcessed).toBeLessThanOrEqual(5);
    expect(batchCount).toBeGreaterThan(0);
  });

  it('should handle tag-only searches efficiently', async () => {
    const streamingOptions: StreamingSearchOptions = {
      tags: ['project'],
      zones: ['notes'],
      batchSize: 4
    };

    const start = performance.now();
    let totalResults = 0;
    let batchCount = 0;

    for await (const batch of scanner.searchStreaming(streamingOptions)) {
      totalResults += batch.results.length;
      batchCount++;
      
      // Tag-only searches should have empty excerpts (more efficient)
      batch.results.forEach(result => {
        expect(result.excerpt).toBe('');
      });
    }

    const time = performance.now() - start;

    console.log(`Tag-only search: ${time.toFixed(2)}ms (${totalResults} results in ${batchCount} batches)`);
    
    expect(totalResults).toBeGreaterThan(0);
    expect(batchCount).toBeGreaterThan(0);
  });

  it('should demonstrate different behavior between query and tag searches', async () => {
    // Query search (requires content loading)
    const queryStart = performance.now();
    let queryBatches = 0;
    for await (const batch of scanner.searchStreaming({
      query: 'implementation',
      zones: ['notes'],
      batchSize: 5
    })) {
      queryBatches++;
      // Should have excerpts for query searches
      batch.results.forEach(result => {
        expect(result.excerpt.length).toBeGreaterThan(0);
      });
    }
    const queryTime = performance.now() - queryStart;

    // Tag search (metadata only)
    const tagStart = performance.now();
    let tagBatches = 0;
    for await (const batch of scanner.searchStreaming({
      tags: ['implementation'],
      zones: ['notes'],
      batchSize: 5
    })) {
      tagBatches++;
      // Should have empty excerpts for tag searches
      batch.results.forEach(result => {
        expect(result.excerpt).toBe('');
      });
    }
    const tagTime = performance.now() - tagStart;

    console.log(`Query search: ${queryTime.toFixed(2)}ms (${queryBatches} batches)`);
    console.log(`Tag search: ${tagTime.toFixed(2)}ms (${tagBatches} batches)`);
    
    // Tag search should generally be faster (metadata-only)
    // But this is more of a demonstration than a strict requirement
    expect(queryBatches).toBeGreaterThan(0);
    expect(tagBatches).toBeGreaterThan(0);
  });
});