/**
 * Note parser for thread-stack markdown files
 */

import matter from 'gray-matter';
import { Note, NoteMetadata, ActionableItem } from './types.js';

export class NoteParser {
  private tagPrefix: string;
  private actionableMarker: string;

  constructor(tagPrefix = '#', actionableMarker = '#actionable') {
    this.tagPrefix = tagPrefix;
    this.actionableMarker = actionableMarker;
  }

  /**
   * Parse a markdown file into a Note object
   */
  parse(filePath: string, content: string, stats: { created: Date; modified: Date }): Note {
    // Try to parse frontmatter
    const { data: frontmatter, content: bodyContent } = matter(content);

    // Extract title (from frontmatter, first H1, or filename)
    const title = this.extractTitle(frontmatter, bodyContent, filePath);

    // Extract tags (from frontmatter and inline)
    const tags = this.extractTags(frontmatter, bodyContent);

    // Extract links (wikilinks and markdown links)
    const links = this.extractLinks(bodyContent);

    return {
      path: filePath,
      title,
      content: bodyContent.trim(),
      tags,
      created: frontmatter.created ? new Date(frontmatter.created) : stats.created,
      modified: frontmatter.modified ? new Date(frontmatter.modified) : stats.modified,
      links,
      metadata: frontmatter
    };
  }

  /**
   * Convert Note to NoteMetadata (lighter weight)
   */
  toMetadata(note: Note): NoteMetadata {
    const wordCount = this.countWords(note.content);
    const hasActionables = this.hasActionableMarker(note.content) || note.tags.includes('actionable');
    const linkedIssues = this.extractIssueReferences(note.content);
    const linkedNotes = note.links;

    return {
      path: note.path,
      title: note.title,
      tags: note.tags,
      created: note.created,
      modified: note.modified,
      wordCount,
      hasActionables,
      linkedIssues,
      linkedNotes
    };
  }

  /**
   * Extract actionable items from note content
   */
  extractActionables(note: Note): ActionableItem[] {
    const actionables: ActionableItem[] = [];
    const lines = note.content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Check for actionable marker
      if (this.hasActionableMarker(line)) {
        // Extract context (previous and next lines)
        const contextStart = Math.max(0, i - 1);
        const contextEnd = Math.min(lines.length, i + 2);
        const context = lines.slice(contextStart, contextEnd).join('\n');

        // Determine status (done if strikethrough or checked checkbox)
        const isDone = line.includes('~~') || line.includes('[x]') || line.includes('[X]');

        // Extract priority from tags or keywords
        const priority = this.extractPriority(line);

        // Extract linked issue
        const linkedIssue = this.extractIssueReferences(line)[0];

        // Clean content (remove markers, checkboxes, etc.)
        const content = this.cleanActionableContent(line);

        // Extract tags from the line
        const lineTags = this.extractInlineTags(line);

        actionables.push({
          sourceNote: note.path,
          content,
          tags: lineTags,
          context,
          linkedIssue,
          status: isDone ? 'done' : 'open',
          priority,
          line: lineNum
        });
      }
    }

    return actionables;
  }

  /**
   * Generate an excerpt from note content
   */
  generateExcerpt(content: string, maxLength = 200): string {
    // Remove code blocks
    const withoutCode = content.replace(/```[\s\S]*?```/g, '');

    // Remove markdown formatting
    const cleaned = withoutCode
      .replace(/^#+\s/gm, '') // headers
      .replace(/\*\*(.+?)\*\*/g, '$1') // bold
      .replace(/\*(.+?)\*/g, '$1') // italic
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
      .replace(/\[\[([^\]]+)\]\]/g, '$1') // wikilinks
      .trim();

    // Get first paragraph or first N chars
    const firstParagraph = cleaned.split('\n\n')[0];

    if (firstParagraph.length <= maxLength) {
      return firstParagraph;
    }

    return firstParagraph.substring(0, maxLength) + '...';
  }

  /**
   * Extract title from frontmatter, first H1, or filename
   */
  private extractTitle(frontmatter: any, content: string, filePath: string): string {
    // Priority 1: Frontmatter title
    if (frontmatter.title) {
      return frontmatter.title;
    }

    // Priority 2: First H1 heading
    const h1Match = content.match(/^#\s+(.+)$/m);
    if (h1Match) {
      return h1Match[1].trim();
    }

    // Priority 3: Filename (without extension and date prefix)
    const filename = filePath.split('/').pop()?.replace(/\.md$/, '') || 'Untitled';
    // Remove date prefix like "2025-01-20-"
    const withoutDate = filename.replace(/^\d{4}-\d{2}-\d{2}-/, '');
    // Convert dashes to spaces and title case
    return withoutDate.split('-').map(word =>
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  }

  /**
   * Extract tags from frontmatter and inline
   */
  private extractTags(frontmatter: any, content: string): string[] {
    const tags = new Set<string>();

    // From frontmatter
    if (Array.isArray(frontmatter.tags)) {
      frontmatter.tags.forEach((tag: string) => tags.add(tag));
    }

    // From inline tags
    this.extractInlineTags(content).forEach(tag => tags.add(tag));

    return Array.from(tags);
  }

  /**
   * Extract inline tags (e.g., #tag)
   */
  private extractInlineTags(text: string): string[] {
    const tagPattern = new RegExp(`${this.tagPrefix}([a-zA-Z0-9_-]+)`, 'g');
    const matches = text.matchAll(tagPattern);
    return Array.from(matches, m => m[1]);
  }

  /**
   * Extract links (wikilinks and markdown links)
   */
  private extractLinks(content: string): string[] {
    const links = new Set<string>();

    // Wikilinks: [[link]]
    const wikilinks = content.matchAll(/\[\[([^\]]+)\]\]/g);
    for (const match of wikilinks) {
      links.add(match[1]);
    }

    // Markdown links to .md files: [text](path.md)
    const mdLinks = content.matchAll(/\[([^\]]+)\]\(([^)]+\.md)\)/g);
    for (const match of mdLinks) {
      links.add(match[2]);
    }

    return Array.from(links);
  }

  /**
   * Extract GitHub issue references (e.g., owner/repo#123, repo#123, #123)
   */
  private extractIssueReferences(text: string): string[] {
    const refs = new Set<string>();

    // Pattern: owner/repo#123 or repo#123 (with - or /)
    const fullRefs = text.matchAll(/([a-zA-Z0-9_-]+[/-][a-zA-Z0-9_-]+#\d+)/g);
    for (const match of fullRefs) {
      refs.add(match[1]);
    }

    // Pattern: #123 (standalone)
    const shortRefs = text.matchAll(/(?:^|\s)#(\d+)(?:\s|$)/g);
    for (const match of shortRefs) {
      refs.add(`#${match[1]}`);
    }

    return Array.from(refs);
  }

  /**
   * Check if text has actionable marker
   */
  private hasActionableMarker(text: string): boolean {
    // Check for #actionable tag
    if (text.includes(this.actionableMarker)) {
      return true;
    }

    // Check for task checkboxes: - [ ] or - [x]
    if (text.includes('- [ ]') || text.includes('- [x]') || text.includes('- [X]')) {
      return true;
    }

    return false;
  }

  /**
   * Extract priority from text
   */
  private extractPriority(text: string): 'high' | 'medium' | 'low' | undefined {
    const lower = text.toLowerCase();

    if (lower.includes('#high') || lower.includes('priority: high') || lower.includes('urgent')) {
      return 'high';
    }

    if (lower.includes('#low') || lower.includes('priority: low')) {
      return 'low';
    }

    if (lower.includes('#medium') || lower.includes('priority: medium')) {
      return 'medium';
    }

    return undefined;
  }

  /**
   * Clean actionable content (remove markers, checkboxes, etc.)
   */
  private cleanActionableContent(line: string): string {
    return line
      .replace(/^[\s-]*\[[ xX]\]\s*/, '') // checkboxes
      .replace(/~~(.+?)~~/g, '$1') // strikethrough
      .replace(new RegExp(this.tagPrefix + '[a-zA-Z0-9_-]+', 'g'), '') // tags
      .replace(/\s+/g, ' ') // normalize whitespace
      .trim();
  }

  /**
   * Count words in text
   */
  private countWords(text: string): number {
    // Remove code blocks
    const withoutCode = text.replace(/```[\s\S]*?```/g, '');
    // Remove markdown formatting
    const cleaned = withoutCode.replace(/[#*_\[\]()]/g, '');
    // Count words
    return cleaned.split(/\s+/).filter(word => word.length > 0).length;
  }
}
