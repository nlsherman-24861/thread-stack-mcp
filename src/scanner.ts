/**
 * Zone-aware file system scanner for thread-stack
 */

import { glob } from 'glob';
import { readFile, stat } from 'fs/promises';
import { relative } from 'path';
import matter from 'gray-matter';
import { NoteParser } from './parser.js';
import { Note, NoteMetadata, SearchResult } from './types.js';
import { ZoneManager, Zone } from './zones.js';

export interface ZoneSearchOptions {
  query?: string;
  tags?: string[];
  zones?: Zone[];  // Which zones to search
  dateFrom?: Date;
  dateTo?: Date;
  limit?: number;
}

export class ZoneScanner {
  private zones: ZoneManager;
  private parser: NoteParser;
  private cache: Map<string, Note> = new Map();
  private cacheTimestamps: Map<string, number> = new Map();

  constructor(basePath: string, parser?: NoteParser) {
    this.zones = new ZoneManager(basePath);
    this.parser = parser || new NoteParser();
  }

  /**
   * Scan zones and return metadata only (no full content)
   */
  async scanZonesMetadata(zones: Zone[]): Promise<NoteMetadata[]> {
    const metadata: NoteMetadata[] = [];

    for (const zone of zones) {
      if (zone === 'scratchpad') {
        // Scratchpad is a single file, handle separately
        const scratchpadPath = this.zones.getZonePath('scratchpad');
        try {
          const noteMetadata = await this.loadNoteMetadata(scratchpadPath);
          metadata.push(noteMetadata);
        } catch {
          // Scratchpad might not exist yet, skip
        }
      } else {
        // Scan directory zones
        const zonePaths = this.zones.getZonePaths([zone]);

        for (const zonePath of zonePaths) {
          const pattern = `${zonePath}/**/*.md`;
          const files = await glob(pattern, { windowsPathsNoEscape: true });

          for (const file of files) {
            try {
              const noteMetadata = await this.loadNoteMetadata(file);
              metadata.push(noteMetadata);
            } catch (error) {
              console.error(`Failed to load note metadata ${file}:`, error);
            }
          }
        }
      }
    }

    return metadata;
  }

  /**
   * Scan files in specified zones
   */
  async scanZones(zones: Zone[]): Promise<Note[]> {
    const notes: Note[] = [];

    for (const zone of zones) {
      if (zone === 'scratchpad') {
        // Scratchpad is a single file, handle separately
        const scratchpadPath = this.zones.getZonePath('scratchpad');
        try {
          const note = await this.loadNote(scratchpadPath);
          notes.push(note);
        } catch {
          // Scratchpad might not exist yet, skip
        }
      } else {
        // Scan directory zones
        const zonePaths = this.zones.getZonePaths([zone]);

        for (const zonePath of zonePaths) {
          const pattern = `${zonePath}/**/*.md`;
          const files = await glob(pattern, { windowsPathsNoEscape: true });

          for (const file of files) {
            try {
              const note = await this.loadNote(file);
              notes.push(note);
            } catch (error) {
              console.error(`Failed to load note ${file}:`, error);
            }
          }
        }
      }
    }

    return notes;
  }

  /**
   * Load note metadata only (no full content parsing)
   */
  async loadNoteMetadata(filePath: string): Promise<NoteMetadata> {
    const fileStats = await stat(filePath);
    
    // Read only first ~1000 bytes to get frontmatter + title estimation
    const fileHandle = await readFile(filePath, 'utf-8');
    
    // Parse frontmatter without full content processing
    const { data: frontmatter, content } = matter(fileHandle);
    
    // Get relative path
    const relativePath = relative(this.zones.getBasePath(), filePath).replace(/\\/g, '/');
    
    // Extract title efficiently
    const title = this.extractTitleFromMetadata(frontmatter, content, relativePath);
    
    // Extract tags from frontmatter and first part of content
    const tags = this.extractTagsFromMetadata(frontmatter, content.substring(0, 500));
    
    // Estimate word count from file size (rough approximation: 1 word ≈ 5 characters)
    const estimatedWordCount = Math.floor(fileStats.size / 5);
    
    // Check for actionables in first part of content
    const contentSample = content.substring(0, 500);
    const hasActionables = contentSample.includes('#actionable') ||
                          /^[\s-]*\[[ xX]\]/m.test(contentSample) ||
                          tags.includes('actionable');
    
    // Extract issue references from first part
    const issuePattern = /([a-zA-Z0-9_-]+[/-][a-zA-Z0-9_-]+#\d+)|(?:^|\s)#(\d+)(?:\s|$)/g;
    const linkedIssues: string[] = [];
    let issueMatch;
    const contentSample = content.substring(0, 500);
    while ((issueMatch = issuePattern.exec(contentSample)) !== null) {
      linkedIssues.push(issueMatch[1] || `#${issueMatch[2]}`);
    }
    
    // Extract links from first part
    const linkedNotes = this.extractLinksFromContent(content.substring(0, 500));
    
    return {
      path: relativePath,
      title,
      tags,
      created: frontmatter.created ? new Date(frontmatter.created) : fileStats.birthtime,
      modified: frontmatter.modified ? new Date(frontmatter.modified) : fileStats.mtime,
      wordCount: estimatedWordCount,
      hasActionables,
      linkedIssues,
      linkedNotes
    };
  }

  /**
   * Load a single note from file
   */
  async loadNote(filePath: string, useCache = true): Promise<Note> {
    // Check cache
    if (useCache) {
      const cached = this.cache.get(filePath);
      const cacheTime = this.cacheTimestamps.get(filePath);

      if (cached && cacheTime) {
        const fileStats = await stat(filePath);
        if (fileStats.mtimeMs <= cacheTime) {
          return cached;
        }
      }
    }

    // Read file
    const content = await readFile(filePath, 'utf-8');
    const fileStats = await stat(filePath);

    // Parse note
    const relativePath = relative(this.zones.getBasePath(), filePath).replace(/\\/g, '/');
    const note = this.parser.parse(
      relativePath,
      content,
      {
        created: fileStats.birthtime,
        modified: fileStats.mtime
      }
    );

    // Update cache
    this.cache.set(filePath, note);
    this.cacheTimestamps.set(filePath, fileStats.mtimeMs);

    return note;
  }

  /**
   * Search notes across zones - using two-pass approach for performance
   */
  async search(options: ZoneSearchOptions): Promise<SearchResult[]> {
    // Determine which zones to search
    const zonesToSearch = options.zones || this.zones.getDefaultSearchZones();

    // PHASE 1: Scan metadata only for initial filtering
    const allMetadata = await this.scanZonesMetadata(zonesToSearch);
    let filteredMetadata = allMetadata;

    // Filter by date range (can be done with metadata only)
    if (options.dateFrom) {
      filteredMetadata = filteredMetadata.filter(note => note.created >= options.dateFrom!);
    }
    if (options.dateTo) {
      filteredMetadata = filteredMetadata.filter(note => note.created <= options.dateTo!);
    }

    // Filter by tags (can be done with metadata only)
    if (options.tags && options.tags.length > 0) {
      filteredMetadata = filteredMetadata.filter(note => 
        options.tags!.every(tag => note.tags.includes(tag))
      );
    }

    // PHASE 2: For query searches, load full content only for remaining notes
    const results: SearchResult[] = [];
    
    if (options.query) {
      // Load full content only for notes that passed metadata filters
      const fullNotes = await Promise.all(
        filteredMetadata.map(async (metadata) => {
          const basePath = this.zones.getBasePath();
          const fullPath = `${basePath}/${metadata.path}`;
          return await this.loadNote(fullPath);
        })
      );

      for (const note of fullNotes) {
        let score = 0;
        const matchedTags: string[] = [];

        // Add tag scoring
        if (options.tags && options.tags.length > 0) {
          matchedTags.push(...options.tags.filter(tag => note.tags.includes(tag)));
          score += matchedTags.length * 10;
        }

        // Query matching
        const queryLower = options.query.toLowerCase();
        const titleMatch = note.title.toLowerCase().includes(queryLower);
        const contentMatch = note.content.toLowerCase().includes(queryLower);

        if (!titleMatch && !contentMatch) {
          continue; // Skip notes without query match
        }

        // Score based on match location
        if (titleMatch) {
          score += 20;
        }
        if (contentMatch) {
          score += 10;
        }

        // Boost score for exact matches
        if (note.title.toLowerCase() === queryLower) {
          score += 50;
        }

        // Generate excerpt with query context
        const excerpt = this.generateContextualExcerpt(note.content, options.query);
        const metadata = this.parser.toMetadata(note);

        results.push({
          note: metadata,
          excerpt,
          score,
          matchedTags
        });
      }
    } else {
      // No query - just return filtered metadata with excerpts
      for (const metadata of filteredMetadata) {
        let score = 0;
        const matchedTags: string[] = [];

        // Add tag scoring
        if (options.tags && options.tags.length > 0) {
          matchedTags.push(...options.tags.filter(tag => metadata.tags.includes(tag)));
          score += matchedTags.length * 10;
        }

        results.push({
          note: metadata,
          excerpt: '', // No excerpt needed for tag-only searches
          score,
          matchedTags
        });
      }
    }

    // Sort by score (descending) and limit results
    results.sort((a, b) => b.score - a.score);

    if (options.limit) {
      return results.slice(0, options.limit);
    }

    return results;
  }

  /**
   * List notes by tags (zone-aware) - using metadata-only scan
   */
  async listByTags(
    tags: string[],
    matchMode: 'any' | 'all' = 'any',
    sortBy: 'created' | 'modified' | 'title' = 'modified',
    zones?: Zone[]
  ): Promise<NoteMetadata[]> {
    const zonesToSearch = zones || this.zones.getDefaultSearchZones();
    // Use metadata-only scan for performance
    const metadata = await this.scanZonesMetadata(zonesToSearch);

    const filtered = metadata.filter(note => {
      if (matchMode === 'all') {
        return tags.every(tag => note.tags.includes(tag));
      } else {
        return tags.some(tag => note.tags.includes(tag));
      }
    });

    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'created':
          return b.created.getTime() - a.created.getTime();
        case 'title':
          return a.title.localeCompare(b.title);
        case 'modified':
        default:
          return b.modified.getTime() - a.modified.getTime();
      }
    });

    return filtered;
  }

  /**
   * List files in inbox for processing - using metadata-only scan
   */
  async listInboxItems(subzone?: 'quick' | 'voice'): Promise<NoteMetadata[]> {
    const inboxZones: Zone[] = ['inbox'];
    // Use metadata-only scan for performance
    const metadata = await this.scanZonesMetadata(inboxZones);

    let filtered = metadata;

    // Filter by subzone if specified
    if (subzone) {
      const subzonePath = subzone === 'quick' ? 'inbox/quick' : 'inbox/voice';
      filtered = metadata.filter(note => note.path.includes(subzonePath));
    }

    // Sort by created date (oldest first for processing)
    filtered.sort((a, b) => a.created.getTime() - b.created.getTime());

    return filtered;
  }

  /**
   * Get all unique tags across zones - using metadata-only scan
   */
  async getAllTags(zones?: Zone[]): Promise<Map<string, number>> {
    const zonesToSearch = zones || this.zones.getDefaultSearchZones();
    // Use metadata-only scan for performance
    const metadata = await this.scanZonesMetadata(zonesToSearch);
    const tagCounts = new Map<string, number>();

    for (const note of metadata) {
      for (const tag of note.tags) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      }
    }

    return tagCounts;
  }

  /**
   * Find notes related to a given note
   */
  async findRelated(notePath: string, maxResults = 5, zones?: Zone[]): Promise<Note[]> {
    const targetNote = await this.loadNote(this.zones.getBasePath() + '/' + notePath);
    const zonesToSearch = zones || this.zones.getDefaultSearchZones();
    const allNotes = await this.scanZones(zonesToSearch);

    const scores = allNotes
      .filter(note => note.path !== targetNote.path)
      .map(note => ({
        note,
        score: this.calculateRelationScore(targetNote, note)
      }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);

    return scores.map(({ note }) => note);
  }

  /**
   * Clear cache (useful after external file changes)
   */
  clearCache(): void {
    this.cache.clear();
    this.cacheTimestamps.clear();
  }

  /**
   * Get zone manager
   */
  getZoneManager(): ZoneManager {
    return this.zones;
  }

  /**
   * Generate contextual excerpt highlighting query matches
   */
  private generateContextualExcerpt(content: string, query: string, contextLength = 200): string {
    const queryLower = query.toLowerCase();
    const contentLower = content.toLowerCase();
    const index = contentLower.indexOf(queryLower);

    if (index === -1) {
      return this.parser.generateExcerpt(content, contextLength);
    }

    // Get context around match
    const start = Math.max(0, index - contextLength / 2);
    const end = Math.min(content.length, index + query.length + contextLength / 2);

    let excerpt = content.substring(start, end);

    // Add ellipsis
    if (start > 0) {
      excerpt = '...' + excerpt;
    }
    if (end < content.length) {
      excerpt = excerpt + '...';
    }

    return excerpt.trim();
  }

  /**
   * Extract title from metadata efficiently
   */
  private extractTitleFromMetadata(frontmatter: any, content: string, filePath: string): string {
    // Priority 1: Frontmatter title
    if (frontmatter.title) {
      return frontmatter.title;
    }

    // Priority 2: First H1 heading (only check first few lines)
    const firstLines = content.split('\n').slice(0, 10).join('\n');
    const h1Match = firstLines.match(/^#\s+(.+)$/m);
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
   * Extract tags from metadata efficiently
   */
  private extractTagsFromMetadata(frontmatter: any, contentSample: string): string[] {
    const tags = new Set<string>();

    // From frontmatter
    if (Array.isArray(frontmatter.tags)) {
      frontmatter.tags.forEach((tag: string) => tags.add(tag));
    }

    // From inline tags in content sample
    const tagPattern = /#([a-zA-Z0-9_-]+)/g;
    let tagMatch;
    while ((tagMatch = tagPattern.exec(contentSample)) !== null) {
      tags.add(tagMatch[1]);
    }

    return Array.from(tags);
  }

  /**
   * Extract links from content sample efficiently
   */
  private extractLinksFromContent(contentSample: string): string[] {
    const links = new Set<string>();

    // Wikilinks: [[link]]
    const wikilinks = contentSample.matchAll(/\[\[([^\]]+)\]\]/g);
    for (const match of wikilinks) {
      links.add(match[1]);
    }

    // Markdown links to .md files: [text](path.md)
    const mdLinks = contentSample.matchAll(/\[([^\]]+)\]\(([^)]+\.md)\)/g);
    for (const match of mdLinks) {
      links.add(match[2]);
    }

    return Array.from(links);
  }

  /**
   * Calculate relationship score between two notes
   */
  private calculateRelationScore(note1: Note, note2: Note): number {
    let score = 0;

    // Direct link
    if (note1.links.includes(note2.path) || note2.links.includes(note1.path)) {
      score += 50;
    }

    // Shared tags
    const sharedTags = note1.tags.filter(tag => note2.tags.includes(tag));
    score += sharedTags.length * 10;

    // Title similarity (simple keyword matching)
    const words1 = note1.title.toLowerCase().split(/\s+/);
    const words2 = note2.title.toLowerCase().split(/\s+/);
    const sharedWords = words1.filter(word => words2.includes(word) && word.length > 3);
    score += sharedWords.length * 5;

    return score;
  }
}
