/**
 * Tests for ZoneManager
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { ZoneManager, Zone, ZONE_CONFIGS } from '../zones.js';
import { join } from 'path';

describe('ZoneManager', () => {
  let zoneManager: ZoneManager;
  const basePath = '/test/thread-stack';

  beforeEach(() => {
    zoneManager = new ZoneManager(basePath);
  });

  describe('getZonePath', () => {
    it('should return correct path for scratchpad', () => {
      const path = zoneManager.getZonePath('scratchpad');
      expect(path).toBe(join(basePath, 'scratch.md'));
    });

    it('should return correct path for notes', () => {
      const path = zoneManager.getZonePath('notes');
      expect(path).toBe(join(basePath, 'notes'));
    });

    it('should return correct path for daily', () => {
      const path = zoneManager.getZonePath('daily');
      expect(path).toBe(join(basePath, 'daily'));
    });

    it('should return correct path for inbox with quick subzone', () => {
      const path = zoneManager.getZonePath('inbox', 'quick');
      expect(path).toBe(join(basePath, 'inbox', 'quick'));
    });

    it('should return correct path for inbox with voice subzone', () => {
      const path = zoneManager.getZonePath('inbox', 'voice');
      expect(path).toBe(join(basePath, 'inbox', 'voice'));
    });

    it('should return inbox base path without subzone', () => {
      const path = zoneManager.getZonePath('inbox');
      expect(path).toBe(join(basePath, 'inbox'));
    });
  });

  describe('getZoneForPath', () => {
    it('should identify scratchpad zone', () => {
      const zone = zoneManager.getZoneForPath('/test/thread-stack/scratch.md');
      expect(zone).toBe('scratchpad');
    });

    it('should identify notes zone', () => {
      const zone = zoneManager.getZoneForPath('/test/thread-stack/notes/2025-01-20-test.md');
      expect(zone).toBe('notes');
    });

    it('should identify inbox zone', () => {
      const zone = zoneManager.getZoneForPath('/test/thread-stack/inbox/quick/test.md');
      expect(zone).toBe('inbox');
    });

    it('should identify daily zone', () => {
      const zone = zoneManager.getZoneForPath('/test/thread-stack/daily/2025-01-20.md');
      expect(zone).toBe('daily');
    });

    it('should identify maps zone', () => {
      const zone = zoneManager.getZoneForPath('/test/thread-stack/maps/project-map.md');
      expect(zone).toBe('maps');
    });

    it('should return null for unknown paths', () => {
      const zone = zoneManager.getZoneForPath('/some/other/path.md');
      expect(zone).toBeNull();
    });
  });

  describe('getDefaultSearchZones', () => {
    it('should return zones that are searchable by default', () => {
      const zones = zoneManager.getDefaultSearchZones();
      expect(zones).toContain('notes');
      expect(zones).toContain('daily');
      expect(zones).toContain('maps');
    });

    it('should not include transient zones by default', () => {
      const zones = zoneManager.getDefaultSearchZones();
      expect(zones).not.toContain('scratchpad');
      expect(zones).not.toContain('inbox');
    });
  });

  describe('getDailyFilename', () => {
    it('should generate filename with YYYY-MM-DD format', () => {
      const date = new Date('2025-01-20T10:30:00Z');
      const filename = zoneManager.getDailyFilename(date);
      expect(filename).toContain('2025-01-20.md');
    });

    it('should use current date when no date provided', () => {
      const filename = zoneManager.getDailyFilename();
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      expect(filename).toContain(`${year}-${month}-${day}.md`);
    });
  });

  describe('generateNoteFilename', () => {
    it('should generate filename with date prefix and slug', () => {
      const date = new Date('2025-01-20T10:30:00Z');
      const filename = zoneManager.generateNoteFilename('Test Note Title', date);
      expect(filename).toContain('2025-01-20-test-note-title.md');
    });

    it('should convert title to lowercase slug', () => {
      const filename = zoneManager.generateNoteFilename('My Test NOTE');
      expect(filename).toMatch(/my-test-note\.md$/);
    });

    it('should remove special characters', () => {
      const filename = zoneManager.generateNoteFilename('Test! @ # $ Note');
      expect(filename).toMatch(/test-note\.md$/);
    });

    it('should handle multiple spaces', () => {
      const filename = zoneManager.generateNoteFilename('Test   Multiple   Spaces');
      expect(filename).toMatch(/test-multiple-spaces\.md$/);
    });
  });

  describe('generateInboxFilename', () => {
    it('should generate filename with timestamp and slug', () => {
      const filename = zoneManager.generateInboxFilename('Test Idea');
      expect(filename).toMatch(/inbox[\\/]quick[\\/]\d+-test-idea\.md$/);
    });

    it('should use quick subzone by default', () => {
      const filename = zoneManager.generateInboxFilename('Test');
      expect(filename.replace(/\\/g, '/')).toContain('inbox/quick/');
    });

    it('should use voice subzone when specified', () => {
      const filename = zoneManager.generateInboxFilename('Test', 'voice');
      expect(filename.replace(/\\/g, '/')).toContain('inbox/voice/');
    });

    it('should create unique filenames for same title', (done) => {
      const filename1 = zoneManager.generateInboxFilename('Same Title');
      setTimeout(() => {
        const filename2 = zoneManager.generateInboxFilename('Same Title');
        expect(filename1).not.toBe(filename2);
        done();
      }, 10);
    });
  });

  describe('ZONE_CONFIGS', () => {
    it('should mark scratchpad as transient', () => {
      expect(ZONE_CONFIGS.scratchpad.isTransient).toBe(true);
    });

    it('should mark scratchpad as not searchable by default', () => {
      expect(ZONE_CONFIGS.scratchpad.searchByDefault).toBe(false);
    });

    it('should mark scratchpad as requiring no structure', () => {
      expect(ZONE_CONFIGS.scratchpad.requiresStructure).toBe(false);
    });

    it('should mark notes as permanent', () => {
      expect(ZONE_CONFIGS.notes.isTransient).toBe(false);
    });

    it('should mark notes as searchable by default', () => {
      expect(ZONE_CONFIGS.notes.searchByDefault).toBe(true);
    });

    it('should mark notes as requiring structure', () => {
      expect(ZONE_CONFIGS.notes.requiresStructure).toBe(true);
    });

    it('should mark inbox as transient', () => {
      expect(ZONE_CONFIGS.inbox.isTransient).toBe(true);
    });

    it('should mark daily as searchable by default', () => {
      expect(ZONE_CONFIGS.daily.searchByDefault).toBe(true);
    });
  });

  describe('Parallel Zone Search Error Resilience', () => {
    it('should handle partial zone failures gracefully', async () => {
      const { tmpdir } = await import('os');
      const { join } = await import('path');
      const { rm, mkdir, writeFile } = await import('fs/promises');
      const { ZoneScanner } = await import('../scanner.js');
      const { NoteParser } = await import('../parser.js');

      const testDir = join(tmpdir(), 'test-error-resilience');
      
      try {
        // Create test structure
        await mkdir(join(testDir, 'notes'), { recursive: true });
        await mkdir(join(testDir, 'daily'), { recursive: true });
        await writeFile(join(testDir, 'notes', 'test-note.md'), '# Test Note\nContent');
        await writeFile(join(testDir, 'daily', 'test-daily.md'), '# Test Daily\nContent');

        const scanner = new ZoneScanner(testDir, new NoteParser());

        // Mock scanSingleZone to simulate failure in one zone
        const originalScanSingleZone = (scanner as any).scanSingleZone;
        (scanner as any).scanSingleZone = jest.fn().mockImplementation(async (zone: string) => {
          if (zone === 'inbox') {
            throw new Error('Simulated inbox failure');
          }
          return originalScanSingleZone.call(scanner, zone);
        });

        // Should still return results from successful zones
        const results = await scanner.scanZones(['notes', 'daily', 'inbox']);
        
        expect(results.length).toBeGreaterThan(0);
        expect(results.some(note => note.path.includes('notes'))).toBe(true);
        expect(results.some(note => note.path.includes('daily'))).toBe(true);
        expect(results.some(note => note.path.includes('inbox'))).toBe(false);

      } finally {
        await rm(testDir, { recursive: true, force: true });
      }
    });
  });
});
