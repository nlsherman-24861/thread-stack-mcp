/**
 * Tests for NoteParser
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { NoteParser } from '../parser.js';

describe('NoteParser', () => {
  let parser: NoteParser;

  beforeEach(() => {
    parser = new NoteParser();
  });

  describe('parse', () => {
    it('should parse basic note with title and content', () => {
      const content = '# Test Note\n\nThis is the content.';
      const note = parser.parse('notes/test.md', content, {
        created: new Date('2025-01-20'),
        modified: new Date('2025-01-21')
      });

      expect(note.title).toBe('Test Note');
      expect(note.content).toContain('This is the content');
      expect(note.path).toBe('notes/test.md');
    });

    it('should extract inline tags', () => {
      const content = '# Note\n\nContent with #tag1 and #tag2';
      const note = parser.parse('notes/test.md', content, {
        created: new Date(),
        modified: new Date()
      });

      expect(note.tags).toContain('tag1');
      expect(note.tags).toContain('tag2');
    });

    it('should extract wikilinks', () => {
      const content = '# Note\n\nSee [[other-note]] and [[another-note]]';
      const note = parser.parse('notes/test.md', content, {
        created: new Date(),
        modified: new Date()
      });

      expect(note.links).toContain('other-note');
      expect(note.links).toContain('another-note');
    });

    it('should extract markdown links to .md files', () => {
      const content = '# Note\n\n[Link](path/to/note.md)';
      const note = parser.parse('notes/test.md', content, {
        created: new Date(),
        modified: new Date()
      });

      expect(note.links).toContain('path/to/note.md');
    });

    it('should parse frontmatter', () => {
      const content = `---
title: Frontmatter Title
tags: [test, example]
---

# Content Title

Body text`;

      const note = parser.parse('notes/test.md', content, {
        created: new Date(),
        modified: new Date()
      });

      expect(note.title).toBe('Frontmatter Title');
      expect(note.tags).toContain('test');
      expect(note.tags).toContain('example');
    });

    it('should use H1 title when no frontmatter', () => {
      const content = '# H1 Title\n\nContent';
      const note = parser.parse('notes/test.md', content, {
        created: new Date(),
        modified: new Date()
      });

      expect(note.title).toBe('H1 Title');
    });

    it('should derive title from filename when no H1', () => {
      const content = 'Just content, no title';
      const note = parser.parse('notes/2025-01-20-my-note.md', content, {
        created: new Date(),
        modified: new Date()
      });

      expect(note.title).toBe('My Note');
    });
  });

  describe('extractActionables', () => {
    it('should extract items with #actionable tag', () => {
      const content = `# Note

- This is actionable #actionable
- This is not`;

      const note = parser.parse('notes/test.md', content, {
        created: new Date(),
        modified: new Date()
      });

      const actionables = parser.extractActionables(note);
      expect(actionables).toHaveLength(1);
      expect(actionables[0].content).toContain('This is actionable');
    });

    it('should extract checkbox items', () => {
      const content = `# Note

- [ ] Unchecked task
- [x] Checked task
- Regular item`;

      const note = parser.parse('notes/test.md', content, {
        created: new Date(),
        modified: new Date()
      });

      const actionables = parser.extractActionables(note);
      expect(actionables).toHaveLength(2);
    });

    it('should mark checked items as done', () => {
      const content = '- [x] Completed task #actionable';
      const note = parser.parse('notes/test.md', content, {
        created: new Date(),
        modified: new Date()
      });

      const actionables = parser.extractActionables(note);
      expect(actionables[0].status).toBe('done');
    });

    it('should mark unchecked items as open', () => {
      const content = '- [ ] Open task #actionable';
      const note = parser.parse('notes/test.md', content, {
        created: new Date(),
        modified: new Date()
      });

      const actionables = parser.extractActionables(note);
      expect(actionables[0].status).toBe('open');
    });

    it('should extract priority', () => {
      const content = '- [ ] High priority task #actionable #high';
      const note = parser.parse('notes/test.md', content, {
        created: new Date(),
        modified: new Date()
      });

      const actionables = parser.extractActionables(note);
      expect(actionables[0].priority).toBe('high');
    });

    it('should extract linked issues', () => {
      const content = `# Note

Related to thread-stack#123

- [ ] Fix bug #actionable`;
      const note = parser.parse('notes/test.md', content, {
        created: new Date(),
        modified: new Date()
      });

      const actionables = parser.extractActionables(note);
      // The linked issue is in the note content, should be extracted
      const metadata = parser.toMetadata(note);
      expect(metadata.linkedIssues).toContain('thread-stack#123');
    });

    it('should provide context lines', () => {
      const content = `Previous line
- [ ] Task #actionable
Next line`;

      const note = parser.parse('notes/test.md', content, {
        created: new Date(),
        modified: new Date()
      });

      const actionables = parser.extractActionables(note);
      expect(actionables[0].context).toContain('Previous line');
      expect(actionables[0].context).toContain('Next line');
    });
  });

  describe('generateExcerpt', () => {
    it('should truncate long content', () => {
      const longContent = 'a'.repeat(300);
      const excerpt = parser.generateExcerpt(longContent, 100);
      expect(excerpt.length).toBeLessThanOrEqual(104); // 100 + '...'
    });

    it('should remove code blocks', () => {
      const content = 'Text before\n```\ncode\n```\nText after';
      const excerpt = parser.generateExcerpt(content);
      expect(excerpt).not.toContain('code');
      expect(excerpt).toContain('Text before');
    });

    it('should remove markdown formatting', () => {
      const content = '**bold** and *italic* and [link](url)';
      const excerpt = parser.generateExcerpt(content);
      expect(excerpt).toContain('bold');
      expect(excerpt).toContain('italic');
      expect(excerpt).toContain('link');
      expect(excerpt).not.toContain('**');
      expect(excerpt).not.toContain('](url)');
    });

    it('should return first paragraph when short enough', () => {
      const content = 'Short paragraph.\n\nSecond paragraph.';
      const excerpt = parser.generateExcerpt(content);
      expect(excerpt).toBe('Short paragraph.');
    });
  });

  describe('toMetadata', () => {
    it('should extract metadata from note', () => {
      const content = '# Note\n\nContent with #tag1';
      const note = parser.parse('notes/test.md', content, {
        created: new Date('2025-01-20'),
        modified: new Date('2025-01-21')
      });

      const metadata = parser.toMetadata(note);
      expect(metadata.path).toBe('notes/test.md');
      expect(metadata.title).toBe('Note');
      expect(metadata.tags).toContain('tag1');
      expect(metadata.wordCount).toBeGreaterThan(0);
    });

    it('should detect actionables', () => {
      const content = '# Note\n\n- [ ] Task #actionable';
      const note = parser.parse('notes/test.md', content, {
        created: new Date(),
        modified: new Date()
      });

      const metadata = parser.toMetadata(note);
      expect(metadata.hasActionables).toBe(true);
    });

    it('should extract linked issues', () => {
      const content = '# Note\n\nSee thread-stack#123';
      const note = parser.parse('notes/test.md', content, {
        created: new Date(),
        modified: new Date()
      });

      const metadata = parser.toMetadata(note);
      expect(metadata.linkedIssues).toContain('thread-stack#123');
    });

    it('should count words correctly', () => {
      const content = '# Title\n\nOne two three four five.';
      const note = parser.parse('notes/test.md', content, {
        created: new Date(),
        modified: new Date()
      });

      const metadata = parser.toMetadata(note);
      expect(metadata.wordCount).toBeGreaterThan(4);
    });
  });

  describe('edge cases', () => {
    it('should handle empty content', () => {
      const note = parser.parse('notes/test.md', '', {
        created: new Date(),
        modified: new Date()
      });

      expect(note.title).toBe('Test');
      expect(note.content).toBe('');
      expect(note.tags).toHaveLength(0);
    });

    it('should handle content with no tags', () => {
      const content = '# Note\n\nNo tags here';
      const note = parser.parse('notes/test.md', content, {
        created: new Date(),
        modified: new Date()
      });

      expect(note.tags).toHaveLength(0);
    });

    it('should handle duplicate tags', () => {
      const content = '# Note\n\n#tag1 and #tag1 again';
      const note = parser.parse('notes/test.md', content, {
        created: new Date(),
        modified: new Date()
      });

      // Should deduplicate
      expect(note.tags.filter(t => t === 'tag1')).toHaveLength(1);
    });

    it('should handle multiline wikilinks', () => {
      const content = '# Note\n\n[[link1]]\n[[link2]]';
      const note = parser.parse('notes/test.md', content, {
        created: new Date(),
        modified: new Date()
      });

      expect(note.links).toHaveLength(2);
    });
  });
});
