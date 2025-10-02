/**
 * Tests for IndexManager
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { IndexManager, MetadataIndex } from '../index-manager.js';
import { NoteParser } from '../parser.js';
import { mkdir, writeFile, rm, readFile } from 'fs/promises';
import { join } from 'path';

describe('IndexManager', () => {
  let tempDir: string;
  let indexManager: IndexManager;
  let parser: NoteParser;

  beforeEach(async () => {
    // Create temporary directory
    tempDir = join(__dirname, '..', '..', 'test-temp', Math.random().toString(36).substring(7));
    await mkdir(tempDir, { recursive: true });

    parser = new NoteParser();
    indexManager = new IndexManager(tempDir, parser);

    // Create test directory structure
    await mkdir(join(tempDir, 'notes'), { recursive: true });
    await mkdir(join(tempDir, 'daily'), { recursive: true });
    await mkdir(join(tempDir, 'inbox', 'quick'), { recursive: true });
    await mkdir(join(tempDir, 'maps'), { recursive: true });
  });

  afterEach(async () => {
    // Clean up temp directory
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  test('creates empty index when none exists', async () => {
    const index = await indexManager.load();
    
    expect(index).toEqual({
      version: 1,
      lastUpdated: expect.any(String),
      notes: [],
      tags: {}
    });
  });

  test('loads existing index from disk', async () => {
    const testIndex: MetadataIndex = {
      version: 1,
      lastUpdated: '2025-01-01T00:00:00.000Z',
      notes: [{
        path: 'notes/test.md',
        title: 'Test Note',
        tags: ['test'],
        created: new Date('2025-01-01'),
        modified: new Date('2025-01-01'),
        wordCount: 10,
        hasActionables: false,
        linkedIssues: [],
        linkedNotes: [],
        mtime: 1704067200000
      }],
      tags: { test: 1 }
    };

    // Write index to disk
    const indexPath = join(tempDir, '.thread-stack-index.json');
    await writeFile(indexPath, JSON.stringify(testIndex), 'utf-8');

    const loadedIndex = await indexManager.load();
    
    expect(loadedIndex.version).toBe(1);
    expect(loadedIndex.notes).toHaveLength(1);
    expect(loadedIndex.notes[0].title).toBe('Test Note');
    expect(loadedIndex.notes[0].created).toBeInstanceOf(Date);
  });

  test('rebuilds index from file system', async () => {
    // Create test files
    await writeFile(join(tempDir, 'scratch.md'), '# Scratchpad\n\nTest content', 'utf-8');
    await writeFile(join(tempDir, 'notes', 'test-note.md'), '# Test Note\n\nContent #test', 'utf-8');
    await writeFile(join(tempDir, 'daily', '2025-01-01.md'), '# January 1, 2025\n\n## 10:00\n\nDaily entry', 'utf-8');

    await indexManager.rebuild();
    
    const index = await indexManager.load();
    
    expect(index.notes).toHaveLength(3);
    expect(index.notes.some(n => n.path.includes('scratch.md'))).toBe(true);
    expect(index.notes.some(n => n.path.includes('test-note.md'))).toBe(true);
    expect(index.notes.some(n => n.path.includes('2025-01-01.md'))).toBe(true);
    expect(index.tags.test).toBe(1);
  });

  test('detects stale index', async () => {
    // Create and rebuild index
    await writeFile(join(tempDir, 'notes', 'old-note.md'), '# Old Note\n\nContent', 'utf-8');
    await indexManager.rebuild();

    // Add new file after index
    await new Promise(resolve => setTimeout(resolve, 10)); // Ensure different mtime
    await writeFile(join(tempDir, 'notes', 'new-note.md'), '# New Note\n\nContent', 'utf-8');

    const isStale = await indexManager.isStale();
    expect(isStale).toBe(true);
  });

  test('updates specific note in index', async () => {
    // Create initial note
    await writeFile(join(tempDir, 'notes', 'test-note.md'), '# Test Note\n\nContent #test', 'utf-8');
    await indexManager.rebuild();

    // Update note
    await writeFile(join(tempDir, 'notes', 'test-note.md'), '# Updated Note\n\nNew content #updated #test', 'utf-8');
    await indexManager.update('notes/test-note.md');

    const index = await indexManager.load();
    const note = index.notes.find(n => n.path.includes('test-note.md'));
    
    expect(note?.title).toBe('Updated Note');
    expect(note?.tags).toContain('updated');
    expect(note?.tags).toContain('test');
    expect(index.tags.updated).toBe(1);
    expect(index.tags.test).toBe(1);
  });

  test('queries notes by zone', async () => {
    // Create test files in different zones
    await writeFile(join(tempDir, 'notes', 'note1.md'), '# Note 1\n\nContent', 'utf-8');
    await writeFile(join(tempDir, 'daily', '2025-01-01.md'), '# Daily\n\nEntry', 'utf-8');
    await writeFile(join(tempDir, 'inbox', 'quick', 'inbox1.md'), '# Inbox\n\nItem', 'utf-8');
    await indexManager.rebuild();

    const notesOnly = await indexManager.query({ zones: ['notes'] });
    const dailyOnly = await indexManager.query({ zones: ['daily'] });
    const inboxOnly = await indexManager.query({ zones: ['inbox'] });

    expect(notesOnly).toHaveLength(1);
    expect(notesOnly[0].title).toBe('Note 1');
    
    expect(dailyOnly).toHaveLength(1);
    expect(dailyOnly[0].title).toBe('Daily');
    
    expect(inboxOnly).toHaveLength(1);
    expect(inboxOnly[0].title).toBe('Inbox');
  });

  test('queries notes by tags', async () => {
    await writeFile(join(tempDir, 'notes', 'note1.md'), '# Note 1\n\nContent #tag1 #tag2', 'utf-8');
    await writeFile(join(tempDir, 'notes', 'note2.md'), '# Note 2\n\nContent #tag1', 'utf-8');
    await writeFile(join(tempDir, 'notes', 'note3.md'), '# Note 3\n\nContent #tag3', 'utf-8');
    await indexManager.rebuild();

    const tag1Results = await indexManager.query({ tags: ['tag1'] });
    const bothTagsResults = await indexManager.query({ tags: ['tag1', 'tag2'] });

    expect(tag1Results).toHaveLength(2);
    expect(bothTagsResults).toHaveLength(1);
    expect(bothTagsResults[0].title).toBe('Note 1');
  });

  test('queries notes by date range', async () => {
    const oldDate = new Date('2024-01-01');
    const newDate = new Date('2025-01-01');
    
    // Create files and manually set their timestamps to control the created date
    await writeFile(join(tempDir, 'notes', 'old-note.md'), '# Old Note\n\nContent', 'utf-8');
    await writeFile(join(tempDir, 'notes', 'new-note.md'), '# New Note\n\nContent', 'utf-8');
    
    // Rebuild and manually adjust dates in index for testing
    await indexManager.rebuild();
    const index = await indexManager.load();
    
    // Update dates for testing
    const oldNote = index.notes.find(n => n.title === 'Old Note');
    const newNote = index.notes.find(n => n.title === 'New Note');
    
    if (oldNote) oldNote.created = oldDate;
    if (newNote) newNote.created = newDate;
    
    // Save modified index
    const indexPath = join(tempDir, '.thread-stack-index.json');
    await writeFile(indexPath, JSON.stringify(index), 'utf-8');
    
    // Force reload
    (indexManager as any).index = null;

    const recentResults = await indexManager.query({ 
      dateFrom: new Date('2024-12-01') 
    });

    expect(recentResults).toHaveLength(1);
    expect(recentResults[0].title).toBe('New Note');
  });

  test('applies result limit', async () => {
    // Create multiple notes
    for (let i = 1; i <= 5; i++) {
      await writeFile(join(tempDir, 'notes', `note${i}.md`), `# Note ${i}\n\nContent`, 'utf-8');
    }
    await indexManager.rebuild();

    const limitedResults = await indexManager.query({ limit: 3 });
    
    expect(limitedResults).toHaveLength(3);
  });

  test('gets specific note metadata', async () => {
    await writeFile(join(tempDir, 'notes', 'test.md'), '# Test Note\n\nContent #test', 'utf-8');
    await indexManager.rebuild();

    const metadata = await indexManager.get('notes/test.md');
    
    expect(metadata).toBeTruthy();
    expect(metadata?.title).toBe('Test Note');
    expect(metadata?.tags).toContain('test');
  });

  test('returns null for non-existent note', async () => {
    const metadata = await indexManager.get('non-existent.md');
    expect(metadata).toBeNull();
  });

  test('invalidates specific notes', async () => {
    await writeFile(join(tempDir, 'notes', 'note1.md'), '# Note 1\n\nContent #tag1', 'utf-8');
    await writeFile(join(tempDir, 'notes', 'note2.md'), '# Note 2\n\nContent #tag2', 'utf-8');
    await indexManager.rebuild();

    await indexManager.invalidate(['notes/note1.md']);
    
    const index = await indexManager.load();
    expect(index.notes).toHaveLength(1);
    expect(index.notes[0].title).toBe('Note 2');
    expect(index.tags.tag1).toBeUndefined();
    expect(index.tags.tag2).toBe(1);
  });

  test('gets all tags with counts', async () => {
    await writeFile(join(tempDir, 'notes', 'note1.md'), '# Note 1\n\nContent #tag1 #shared', 'utf-8');
    await writeFile(join(tempDir, 'notes', 'note2.md'), '# Note 2\n\nContent #tag2 #shared', 'utf-8');
    await indexManager.rebuild();

    const tags = await indexManager.getAllTags();
    
    expect(tags.get('shared')).toBe(2);
    expect(tags.get('tag1')).toBe(1);
    expect(tags.get('tag2')).toBe(1);
  });

  test('provides index statistics', async () => {
    await writeFile(join(tempDir, 'notes', 'note1.md'), '# Note 1\n\nContent #tag1', 'utf-8');
    await writeFile(join(tempDir, 'notes', 'note2.md'), '# Note 2\n\nContent #tag2', 'utf-8');
    await indexManager.rebuild();

    const stats = await indexManager.getStats();
    
    expect(stats.noteCount).toBe(2);
    expect(stats.tagCount).toBe(2);
    expect(stats.lastUpdated).toBeTruthy();
    expect(typeof stats.isStale).toBe('boolean');
  });
});