/**
 * Tests for ContentWriter
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { ContentWriter } from '../writer.js';
import { ZoneManager } from '../zones.js';
import { readFile, rm, mkdir } from 'fs/promises';
import { join } from 'path';

describe('ContentWriter', () => {
  const testBasePath = join(process.cwd(), 'test-thread-stack');
  let writer: ContentWriter;
  let zones: ZoneManager;

  beforeEach(async () => {
    // Create test directory
    await mkdir(testBasePath, { recursive: true });
    zones = new ZoneManager(testBasePath);
    writer = new ContentWriter(zones);
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await rm(testBasePath, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('captureToScratchpad', () => {
    it('should append to scratchpad with timestamp', async () => {
      const result = await writer.captureToScratchpad('Test thought');

      expect(result.path).toContain('scratch.md');
      expect(result.timestamp).toBeTruthy();

      const content = await readFile(result.path, 'utf-8');
      expect(content).toContain('Test thought');
      expect(content).toMatch(/## \d{2}:\d{2}/); // Timestamp heading
    });

    it('should append multiple entries', async () => {
      await writer.captureToScratchpad('First thought');
      await writer.captureToScratchpad('Second thought');

      const scratchpadPath = zones.getZonePath('scratchpad');
      const content = await readFile(scratchpadPath, 'utf-8');

      expect(content).toContain('First thought');
      expect(content).toContain('Second thought');
    });
  });

  describe('readScratchpad', () => {
    it('should read scratchpad content', async () => {
      await writer.captureToScratchpad('Test content');
      const content = await writer.readScratchpad();

      expect(content).toContain('Test content');
      expect(content).toContain('Scratchpad');
    }, 10000); // Increase timeout for file operations

    it('should return default content if scratchpad does not exist', async () => {
      const content = await writer.readScratchpad();
      expect(content).toContain('Scratchpad');
      expect(content).toContain('thought incubator');
    });
  });

  describe('clearScratchpad', () => {
    it('should clear scratchpad but keep header', async () => {
      await writer.captureToScratchpad('Content to clear');
      await writer.clearScratchpad();

      const content = await writer.readScratchpad();
      expect(content).toContain('Scratchpad');
      expect(content).not.toContain('Content to clear');
    });
  });

  describe('createInboxItem', () => {
    it('should create inbox item with title and content', async () => {
      const result = await writer.createInboxItem('Test Title', 'Test content');

      expect(result.filename).toContain('test-title.md');
      expect(result.path.replace(/\\/g, '/')).toContain('inbox/quick');

      const content = await readFile(result.path, 'utf-8');
      expect(content).toContain('# Test Title');
      expect(content).toContain('Test content');
    });

    it('should support voice subzone', async () => {
      const result = await writer.createInboxItem('Voice Note', 'Transcription', 'voice');

      expect(result.path.replace(/\\/g, '/')).toContain('inbox/voice');
    });

    it('should create directory if it does not exist', async () => {
      const result = await writer.createInboxItem('New Item', 'Content');
      const content = await readFile(result.path, 'utf-8');

      expect(content).toBeTruthy();
    });
  });

  describe('createNote', () => {
    it('should create note with basic structure', async () => {
      const result = await writer.createNote('Test Note', 'Content here');

      expect(result.filename).toMatch(/\d{4}-\d{2}-\d{2}-test-note\.md/);
      expect(result.path.replace(/\\/g, '/')).toContain('notes/');

      const content = await readFile(result.path, 'utf-8');
      expect(content).toContain('# Test Note');
      expect(content).toContain('Content here');
    });

    it('should add tags at the end', async () => {
      const result = await writer.createNote('Test', 'Content', {
        tags: ['tag1', 'tag2']
      });

      const content = await readFile(result.path, 'utf-8');
      expect(content).toContain('#tag1 #tag2');
    });

    it('should add links section', async () => {
      const result = await writer.createNote('Test', 'Content', {
        links: ['note1', 'note2']
      });

      const content = await readFile(result.path, 'utf-8');
      expect(content).toContain('## Links');
      expect(content).toContain('[[note1]]');
      expect(content).toContain('[[note2]]');
    });

    it('should support frontmatter', async () => {
      const result = await writer.createNote('Test', 'Content', {
        frontmatter: {
          tags: ['test'],
          custom: 'value'
        }
      });

      const content = await readFile(result.path, 'utf-8');
      expect(content).toContain('---');
      expect(content).toContain('title: Test');
      expect(content).toContain('custom: "value"');
    });

    it('should use specified date', async () => {
      const customDate = new Date('2023-05-15T12:00:00Z');
      const result = await writer.createNote('Test', 'Content', {
        date: customDate
      });

      // Check for date in filename (may vary by timezone)
      expect(result.filename).toMatch(/2023-05-(14|15)/);
    });
  });

  describe('createDailyEntry', () => {
    it('should create new daily file with header', async () => {
      const result = await writer.createDailyEntry('First entry');

      expect(result.created).toBe(true);
      expect(result.filename).toMatch(/\d{4}-\d{2}-\d{2}\.md/);

      const content = await readFile(result.path, 'utf-8');
      expect(content).toMatch(/# \w+, \w+ \d+, \d{4}/); // Date header
      expect(content).toContain('First entry');
    });

    it('should append to existing daily file', async () => {
      const result1 = await writer.createDailyEntry('Entry 1');
      const result2 = await writer.createDailyEntry('Entry 2');

      expect(result1.created).toBe(true);
      expect(result2.created).toBe(false);

      const content = await readFile(result2.path, 'utf-8');
      expect(content).toContain('Entry 1');
      expect(content).toContain('Entry 2');
    });

    it('should add timestamp headings', async () => {
      const result = await writer.createDailyEntry('Test entry');
      const content = await readFile(result.path, 'utf-8');

      expect(content).toMatch(/## \d{2}:\d{2}/);
    });

    it('should support custom date', async () => {
      const customDate = new Date('2023-05-15T12:00:00Z');
      const result = await writer.createDailyEntry('Test', customDate);

      // May vary by timezone
      expect(result.filename).toMatch(/2023-05-(14|15)\.md/);
    });
  });

  describe('promoteToNotes', () => {
    it('should move inbox item to notes', async () => {
      const inbox = await writer.createInboxItem('Inbox Item', 'Content to promote');
      const result = await writer.promoteToNotes(inbox.path);

      // Normalize path separators for cross-platform
      expect(result.newPath.replace(/\\/g, '/')).toContain('notes/');
      expect(result.filename).toMatch(/inbox-item\.md$/);

      const content = await readFile(result.newPath, 'utf-8');
      expect(content).toContain('Inbox Item');
      expect(content).toContain('Content to promote');
    });

    it('should add tags and links during promotion', async () => {
      const inbox = await writer.createInboxItem('Item', 'Content');
      const result = await writer.promoteToNotes(inbox.path, {
        tags: ['promoted', 'important'],
        links: ['related-note']
      });

      const content = await readFile(result.newPath, 'utf-8');
      expect(content).toContain('#promoted #important');
      expect(content).toContain('[[related-note]]');
    });

    it('should support additional content', async () => {
      const inbox = await writer.createInboxItem('Item', 'Original content');
      const result = await writer.promoteToNotes(inbox.path, {
        additionalContent: '\n\nAdded during promotion'
      });

      const content = await readFile(result.newPath, 'utf-8');
      expect(content).toContain('Original content');
      expect(content).toContain('Added during promotion');
    });
  });

  describe('appendToNote', () => {
    it('should append content to end of note', async () => {
      const note = await writer.createNote('Test', 'Original content');
      await writer.appendToNote(note.path, 'Appended content');

      const content = await readFile(note.path, 'utf-8');
      expect(content).toContain('Original content');
      expect(content).toContain('Appended content');
    });

    it('should append to specific section', async () => {
      const note = await writer.createNote('Test', '## Section 1\n\nContent 1\n\n## Section 2\n\nContent 2');
      await writer.appendToNote(note.path, 'New content', 'Section 1');

      const content = await readFile(note.path, 'utf-8');
      const section1Index = content.indexOf('## Section 1');
      const section2Index = content.indexOf('## Section 2');
      const newContentIndex = content.indexOf('New content');

      expect(newContentIndex).toBeGreaterThan(section1Index);
      expect(newContentIndex).toBeLessThan(section2Index);
    });

    it('should create section if it does not exist', async () => {
      const note = await writer.createNote('Test', 'Original content');
      await writer.appendToNote(note.path, 'New content', 'New Section');

      const content = await readFile(note.path, 'utf-8');
      expect(content).toContain('## New Section');
      expect(content).toContain('New content');
    });
  });
});
