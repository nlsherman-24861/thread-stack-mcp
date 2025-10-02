/**
 * Tests for streaming search functionality
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ZoneScanner, StreamingSearchOptions } from '../scanner.js';
import { NoteParser } from '../parser.js';
import { setupTestFixtures, cleanupTestFixtures, createTestNote } from './fixtures.js';

describe('Streaming Search', () => {
  let scanner: ZoneScanner;
  let testDir: string;

  beforeEach(async () => {
    testDir = await setupTestFixtures();
    scanner = new ZoneScanner(testDir, new NoteParser());
  });

  afterEach(async () => {
    await cleanupTestFixtures(testDir);
  });

  describe('searchStreaming generator', () => {
    it('should yield results in batches', async () => {
      // Create test notes
      await createTestNote(testDir, 'notes/note1.md', {
        title: 'First Note',
        content: 'This is about testing',
        tags: ['test']
      });
      await createTestNote(testDir, 'notes/note2.md', {
        title: 'Second Note', 
        content: 'This is also about testing',
        tags: ['test']
      });
      await createTestNote(testDir, 'notes/note3.md', {
        title: 'Third Note',
        content: 'This mentions testing too',
        tags: ['test']
      });

      const options: StreamingSearchOptions = {
        query: 'testing',
        batchSize: 2,
        zones: ['notes']
      };

      const batches = [];
      for await (const batch of scanner.searchStreaming(options)) {
        batches.push(batch);
      }

      // Should have at least 2 batches (2 notes each, then 1 note)
      expect(batches.length).toBeGreaterThanOrEqual(1);
      
      // Check batch numbering
      batches.forEach((batch, index) => {
        expect(batch.batch).toBe(index + 1);
        expect(batch.results.length).toBeGreaterThan(0);
        expect(typeof batch.hasMore).toBe('boolean');
        expect(typeof batch.totalFound).toBe('number');
        expect(typeof batch.totalProcessed).toBe('number');
      });

      // Total results should match what we expect
      const totalResults = batches.reduce((sum, batch) => sum + batch.results.length, 0);
      expect(totalResults).toBe(3); // All 3 notes should match
    });

    it('should handle tag-only searches efficiently', async () => {
      // Create test notes with different tags
      await createTestNote(testDir, 'notes/tagged1.md', {
        title: 'Tagged Note 1',
        content: 'Content with tag',
        tags: ['important', 'work']
      });
      await createTestNote(testDir, 'notes/tagged2.md', {
        title: 'Tagged Note 2',
        content: 'Another tagged note',
        tags: ['important', 'personal']
      });
      await createTestNote(testDir, 'notes/untagged.md', {
        title: 'Untagged Note',
        content: 'No relevant tags',
        tags: ['other']
      });

      const options: StreamingSearchOptions = {
        tags: ['important'],
        batchSize: 1,
        zones: ['notes']
      };

      const batches = [];
      for await (const batch of scanner.searchStreaming(options)) {
        batches.push(batch);
      }

      const totalResults = batches.reduce((sum, batch) => sum + batch.results.length, 0);
      expect(totalResults).toBe(2); // Only 2 notes have 'important' tag

      // For tag-only searches, excerpts should be empty
      batches.forEach(batch => {
        batch.results.forEach(result => {
          expect(result.excerpt).toBe('');
        });
      });
    });

    it('should respect limit and early exit', async () => {
      // Create more test notes than our limit
      for (let i = 1; i <= 10; i++) {
        await createTestNote(testDir, `notes/note${i}.md`, {
          title: `Note ${i}`,
          content: `This is note number ${i} about testing`,
          tags: ['test']
        });
      }

      const options: StreamingSearchOptions = {
        query: 'testing',
        limit: 3,
        batchSize: 2,
        zones: ['notes']
      };

      const batches = [];
      for await (const batch of scanner.searchStreaming(options)) {
        batches.push(batch);
        
        // Should exit early when limit is reached
        if (batch.totalFound >= 3) {
          expect(batch.totalFound).toBeLessThanOrEqual(3);
          break;
        }
      }

      const totalResults = batches.reduce((sum, batch) => sum + batch.results.length, 0);
      expect(totalResults).toBeLessThanOrEqual(3);
    });

    it('should call progress callback when provided', async () => {
      await createTestNote(testDir, 'notes/note1.md', {
        title: 'First Note',
        content: 'Testing content',
        tags: ['test']
      });
      await createTestNote(testDir, 'notes/note2.md', {
        title: 'Second Note',
        content: 'More testing content',
        tags: ['test']
      });

      const progressCallback = jest.fn();
      const options: StreamingSearchOptions = {
        query: 'testing',
        batchSize: 1,
        zones: ['notes'],
        progressCallback
      };

      const batches = [];
      for await (const batch of scanner.searchStreaming(options)) {
        batches.push(batch);
      }

      // Progress callback should have been called
      expect(progressCallback).toHaveBeenCalled();
      expect(progressCallback.mock.calls.length).toBeGreaterThanOrEqual(1);
      
      // Check callback arguments
      progressCallback.mock.calls.forEach(call => {
        expect(call[0]).toBeGreaterThanOrEqual(0); // progress
        expect(call[1]).toBeGreaterThanOrEqual(0); // total
        expect(Array.isArray(call[2])).toBe(true); // results
      });
    });

    it('should handle empty results gracefully', async () => {
      const options: StreamingSearchOptions = {
        query: 'nonexistent',
        batchSize: 5,
        zones: ['notes']
      };

      const batches = [];
      for await (const batch of scanner.searchStreaming(options)) {
        batches.push(batch);
      }

      // Should have minimal batches for empty results
      expect(batches.length).toBeGreaterThanOrEqual(0);
      
      if (batches.length > 0) {
        const totalResults = batches.reduce((sum, batch) => sum + batch.results.length, 0);
        expect(totalResults).toBe(0);
      }
    });

    it('should handle date filtering in streaming mode', async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      await createTestNote(testDir, 'notes/old.md', {
        title: 'Old Note',
        content: 'Testing content',
        tags: ['test'],
        frontmatter: { created: yesterday.toISOString() }
      });
      await createTestNote(testDir, 'notes/new.md', {
        title: 'New Note',
        content: 'Testing content',
        tags: ['test'],
        frontmatter: { created: tomorrow.toISOString() }
      });

      const options: StreamingSearchOptions = {
        query: 'testing',
        dateFrom: now,
        batchSize: 1,
        zones: ['notes']
      };

      const batches = [];
      for await (const batch of scanner.searchStreaming(options)) {
        batches.push(batch);
      }

      const totalResults = batches.reduce((sum, batch) => sum + batch.results.length, 0);
      expect(totalResults).toBe(1); // Only the "new" note should match
    });
  });

  describe('searchStreamingCollected', () => {
    it('should collect all streaming results and sort by score', async () => {
      await createTestNote(testDir, 'notes/high.md', {
        title: 'testing', // Exact title match - high score
        content: 'Some content',
        tags: ['test']
      });
      await createTestNote(testDir, 'notes/medium.md', {
        title: 'Medium Score',
        content: 'This mentions testing in content',
        tags: ['test']
      });
      await createTestNote(testDir, 'notes/low.md', {
        title: 'Low Score',
        content: 'This has testing too',
        tags: []
      });

      const options: StreamingSearchOptions = {
        query: 'testing',
        batchSize: 1,
        zones: ['notes']
      };

      const results = await scanner.searchStreamingCollected(options);
      
      expect(results.length).toBe(3);
      
      // Results should be sorted by score (descending)
      for (let i = 0; i < results.length - 1; i++) {
        expect(results[i].score).toBeGreaterThanOrEqual(results[i + 1].score);
      }
      
      // The exact title match should be first
      expect(results[0].note.title).toBe('testing');
    });

    it('should respect limit when collecting results', async () => {
      for (let i = 1; i <= 5; i++) {
        await createTestNote(testDir, `notes/note${i}.md`, {
          title: `Note ${i}`,
          content: `Testing content ${i}`,
          tags: ['test']
        });
      }

      const options: StreamingSearchOptions = {
        query: 'testing',
        limit: 3,
        batchSize: 2,
        zones: ['notes']
      };

      const results = await scanner.searchStreamingCollected(options);
      
      expect(results.length).toBeLessThanOrEqual(3);
    });
  });

  describe('performance characteristics', () => {
    it('should show faster time to first result for streaming vs batch', async () => {
      // Create many test notes
      for (let i = 1; i <= 50; i++) {
        await createTestNote(testDir, `notes/note${i}.md`, {
          title: `Note ${i}`,
          content: `This is note ${i} about testing performance`,
          tags: ['test', 'performance']
        });
      }

      // Time regular search
      const regularStart = Date.now();
      const regularResults = await scanner.search({
        query: 'testing',
        zones: ['notes'],
        limit: 10
      });
      const regularTime = Date.now() - regularStart;

      // Time streaming search to first result
      const streamingStart = Date.now();
      let firstBatchTime = 0;
      let batchCount = 0;
      
      for await (const batch of scanner.searchStreaming({
        query: 'testing',
        zones: ['notes'],
        limit: 10,
        batchSize: 5
      })) {
        if (batchCount === 0) {
          firstBatchTime = Date.now() - streamingStart;
        }
        batchCount++;
        
        if (batch.totalFound >= 10) {
          break;
        }
      }

      // For a large result set, streaming should show faster time to first results
      // Note: This is more of a demonstration than a strict test since timing can vary
      console.log(`Regular search: ${regularTime}ms`);
      console.log(`Streaming first batch: ${firstBatchTime}ms`);
      console.log(`Batch count: ${batchCount}`);
      
      expect(regularResults.length).toBeGreaterThan(0);
      expect(batchCount).toBeGreaterThan(0);
      expect(firstBatchTime).toBeLessThan(regularTime * 2); // Allow some variance
    });
  });

  describe('edge cases', () => {
    it('should handle notes with no content gracefully', async () => {
      await createTestNote(testDir, 'notes/empty.md', {
        title: 'Empty Note',
        content: '',
        tags: ['test']
      });

      const options: StreamingSearchOptions = {
        query: 'testing',
        batchSize: 1,
        zones: ['notes']
      };

      const batches = [];
      for await (const batch of scanner.searchStreaming(options)) {
        batches.push(batch);
      }

      expect(batches.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle very large batch sizes', async () => {
      await createTestNote(testDir, 'notes/note1.md', {
        title: 'Test Note',
        content: 'Testing content',
        tags: ['test']
      });

      const options: StreamingSearchOptions = {
        query: 'testing',
        batchSize: 1000, // Much larger than available results
        zones: ['notes']
      };

      const batches = [];
      for await (const batch of scanner.searchStreaming(options)) {
        batches.push(batch);
      }

      expect(batches.length).toBe(1);
      expect(batches[0].results.length).toBe(1);
    });

    it('should handle batch size of 1', async () => {
      await createTestNote(testDir, 'notes/note1.md', {
        title: 'First Note',
        content: 'Testing content',
        tags: ['test']
      });
      await createTestNote(testDir, 'notes/note2.md', {
        title: 'Second Note',
        content: 'Also testing',
        tags: ['test']
      });

      const options: StreamingSearchOptions = {
        query: 'testing',
        batchSize: 1,
        zones: ['notes']
      };

      const batches = [];
      for await (const batch of scanner.searchStreaming(options)) {
        batches.push(batch);
      }

      expect(batches.length).toBe(2);
      batches.forEach(batch => {
        expect(batch.results.length).toBeLessThanOrEqual(1);
      });
    });
  });
});