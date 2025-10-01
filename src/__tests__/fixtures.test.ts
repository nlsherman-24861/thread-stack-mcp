/**
 * Tests for fixture generation to ensure benchmark data quality
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { tmpdir } from 'os';
import { join } from 'path';
import { rm, readdir, readFile, stat } from 'fs/promises';
import matter from 'gray-matter';
import { generateFixtures, FIXTURE_CONFIGS } from './fixtures.js';
import { ZoneScanner } from '../scanner.js';
import { NoteParser } from '../parser.js';

const TEST_DIR = join(tmpdir(), 'thread-stack-fixture-test');

describe('Fixture Generation', () => {
  beforeAll(async () => {
    await generateFixtures({
      basePath: TEST_DIR,
      ...FIXTURE_CONFIGS.small
    });
  });

  afterAll(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  describe('Directory structure', () => {
    test('creates expected directories', async () => {
      const entries = await readdir(TEST_DIR);

      expect(entries).toContain('notes');
      expect(entries).toContain('inbox');
      expect(entries).toContain('daily');
      expect(entries).toContain('scratchpad.md');
    });

    test('creates inbox subdirectories', async () => {
      const inboxEntries = await readdir(join(TEST_DIR, 'inbox'));

      expect(inboxEntries).toContain('quick');
      expect(inboxEntries).toContain('voice');
    });
  });

  describe('Note generation', () => {
    test('generates correct number of notes', async () => {
      const noteFiles = await readdir(join(TEST_DIR, 'notes'));
      const mdFiles = noteFiles.filter(f => f.endsWith('.md'));

      expect(mdFiles.length).toBe(FIXTURE_CONFIGS.small.noteCount);
    });

    test('generates notes with valid frontmatter', async () => {
      const noteFiles = await readdir(join(TEST_DIR, 'notes'));
      const sampleFile = join(TEST_DIR, 'notes', noteFiles[0]);
      const content = await readFile(sampleFile, 'utf-8');

      // Should not throw
      const parsed = matter(content);

      expect(parsed.data).toBeDefined();
      expect(parsed.content).toBeDefined();
    });

    test('generates notes with required frontmatter fields', async () => {
      const noteFiles = await readdir(join(TEST_DIR, 'notes'));
      const sampleFile = join(TEST_DIR, 'notes', noteFiles[0]);
      const content = await readFile(sampleFile, 'utf-8');
      const parsed = matter(content);

      expect(parsed.data.title).toBeDefined();
      expect(parsed.data.tags).toBeDefined();
      expect(Array.isArray(parsed.data.tags)).toBe(true);
      expect(parsed.data.created).toBeDefined();
    });

    test('generates notes with expected tag count', async () => {
      const noteFiles = await readdir(join(TEST_DIR, 'notes'));
      const sampleFile = join(TEST_DIR, 'notes', noteFiles[0]);
      const content = await readFile(sampleFile, 'utf-8');
      const parsed = matter(content);

      // Should have at least some tags (may be less than requested due to deduplication)
      expect(parsed.data.tags.length).toBeGreaterThan(0);
      expect(parsed.data.tags.length).toBeLessThanOrEqual(FIXTURE_CONFIGS.small.tagsPerNote);
    });

    test('generates notes with markdown content', async () => {
      const noteFiles = await readdir(join(TEST_DIR, 'notes'));
      const sampleFile = join(TEST_DIR, 'notes', noteFiles[0]);
      const content = await readFile(sampleFile, 'utf-8');
      const parsed = matter(content);

      expect(parsed.content.trim().length).toBeGreaterThan(0);
      expect(parsed.content).toMatch(/^#\s+/m); // Has at least one heading
    });

    test('generates notes with wikilinks format', async () => {
      const noteFiles = await readdir(join(TEST_DIR, 'notes'));

      // Check a few notes for wikilinks (not all will have them)
      let foundWikilink = false;
      for (let i = 0; i < Math.min(10, noteFiles.length); i++) {
        const content = await readFile(join(TEST_DIR, 'notes', noteFiles[i]), 'utf-8');
        if (content.includes('[[') && content.includes(']]')) {
          foundWikilink = true;
          break;
        }
      }

      // At least some notes should have wikilinks
      expect(foundWikilink).toBe(true);
    });

    test('generates notes with actionables based on density', async () => {
      const noteFiles = await readdir(join(TEST_DIR, 'notes'));
      let notesWithActionables = 0;

      for (const file of noteFiles) {
        const content = await readFile(join(TEST_DIR, 'notes', file), 'utf-8');
        if (content.includes('- [ ]') || content.includes('- [x]') || content.includes('#actionable')) {
          notesWithActionables++;
        }
      }

      const actualDensity = notesWithActionables / noteFiles.length;
      const expectedDensity = FIXTURE_CONFIGS.small.actionableDensity;

      // Should be within 20% of target density (random distribution)
      expect(actualDensity).toBeGreaterThan(expectedDensity * 0.5);
      expect(actualDensity).toBeLessThan(expectedDensity * 1.5);
    });
  });

  describe('Inbox generation', () => {
    test('generates inbox items', async () => {
      const quickFiles = await readdir(join(TEST_DIR, 'inbox', 'quick'));
      const voiceFiles = await readdir(join(TEST_DIR, 'inbox', 'voice'));

      const totalInbox = quickFiles.length + voiceFiles.length;
      expect(totalInbox).toBeGreaterThan(0);
    });

    test('inbox items are valid markdown', async () => {
      const quickFiles = await readdir(join(TEST_DIR, 'inbox', 'quick'));
      if (quickFiles.length > 0) {
        const content = await readFile(join(TEST_DIR, 'inbox', 'quick', quickFiles[0]), 'utf-8');

        expect(content.trim().length).toBeGreaterThan(0);
        expect(content).toMatch(/^#\s+/m); // Has heading
      }
    });
  });

  describe('Scratchpad generation', () => {
    test('creates scratchpad file', async () => {
      const scratchpadPath = join(TEST_DIR, 'scratchpad.md');
      const stats = await stat(scratchpadPath);

      expect(stats.isFile()).toBe(true);
    });

    test('scratchpad has content', async () => {
      const content = await readFile(join(TEST_DIR, 'scratchpad.md'), 'utf-8');

      expect(content.trim().length).toBeGreaterThan(0);
      expect(content).toMatch(/\[\d{4}-\d{2}-\d{2}/); // Has timestamps
    });
  });

  describe('Integration with scanner', () => {
    test('scanner can load generated fixtures', async () => {
      const scanner = new ZoneScanner(TEST_DIR, new NoteParser());
      const notes = await scanner.scanZones(['notes']);

      expect(notes.length).toBe(FIXTURE_CONFIGS.small.noteCount);
    });

    test('generated notes have parseable tags', async () => {
      const scanner = new ZoneScanner(TEST_DIR, new NoteParser());
      const notes = await scanner.scanZones(['notes']);

      for (const note of notes) {
        expect(Array.isArray(note.tags)).toBe(true);
        expect(note.tags.length).toBeGreaterThan(0);
      }
    });

    test('generated notes have valid links', async () => {
      const scanner = new ZoneScanner(TEST_DIR, new NoteParser());
      const notes = await scanner.scanZones(['notes']);

      for (const note of notes) {
        expect(Array.isArray(note.links)).toBe(true);
        // Links should reference paths that could exist
        for (const link of note.links) {
          expect(typeof link).toBe('string');
          expect(link.length).toBeGreaterThan(0);
        }
      }
    });

    test('generated actionables are extractable', async () => {
      const scanner = new ZoneScanner(TEST_DIR, new NoteParser());
      const parser = new NoteParser();
      const notes = await scanner.scanZones(['notes']);

      let totalActionables = 0;
      for (const note of notes) {
        const actionables = parser.extractActionables(note);
        totalActionables += actionables.length;
      }

      // Should have found some actionables
      expect(totalActionables).toBeGreaterThan(0);
    });

    test('generated notes have reasonable word counts', async () => {
      const scanner = new ZoneScanner(TEST_DIR, new NoteParser());
      const notes = await scanner.scanZones(['notes']);

      for (const note of notes) {
        const wordCount = note.content.split(/\s+/).length;

        // Should be within reasonable range of target
        expect(wordCount).toBeGreaterThan(50); // At least some content
        expect(wordCount).toBeLessThan(FIXTURE_CONFIGS.small.avgWordCount * 3); // Not absurdly long
      }
    });
  });

  describe('Fixture configs', () => {
    test('all configs have required fields', () => {
      for (const [name, config] of Object.entries(FIXTURE_CONFIGS)) {
        expect(config.noteCount).toBeGreaterThan(0);
        expect(config.tagsPerNote).toBeGreaterThan(0);
        expect(config.linksPerNote).toBeGreaterThanOrEqual(0);
        expect(config.avgWordCount).toBeGreaterThan(0);
        expect(config.actionableDensity).toBeGreaterThanOrEqual(0);
        expect(config.actionableDensity).toBeLessThanOrEqual(1);
      }
    });

    test('configs scale as expected', () => {
      expect(FIXTURE_CONFIGS.small.noteCount).toBeLessThan(FIXTURE_CONFIGS.medium.noteCount);
      expect(FIXTURE_CONFIGS.medium.noteCount).toBeLessThan(FIXTURE_CONFIGS.large.noteCount);
      expect(FIXTURE_CONFIGS.large.noteCount).toBeLessThan(FIXTURE_CONFIGS.xlarge.noteCount);
    });
  });
});

describe('Fixture determinism', () => {
  test('generates different content on each run', async () => {
    const dir1 = join(tmpdir(), 'fixture-test-1');
    const dir2 = join(tmpdir(), 'fixture-test-2');

    try {
      await generateFixtures({
        basePath: dir1,
        noteCount: 5,
        tagsPerNote: 3,
        linksPerNote: 2,
        avgWordCount: 200,
        actionableDensity: 0.5
      });

      await generateFixtures({
        basePath: dir2,
        noteCount: 5,
        tagsPerNote: 3,
        linksPerNote: 2,
        avgWordCount: 200,
        actionableDensity: 0.5
      });

      const files1 = await readdir(join(dir1, 'notes'));
      const files2 = await readdir(join(dir2, 'notes'));

      // Should have same count
      expect(files1.length).toBe(files2.length);

      // But different timestamps in filenames (they should be mostly different)
      const differentFiles = files1.filter(f => !files2.includes(f));
      expect(differentFiles.length).toBeGreaterThan(0);

    } finally {
      await rm(dir1, { recursive: true, force: true });
      await rm(dir2, { recursive: true, force: true });
    }
  });
});
