/**
 * Zone-aware file system scanner for thread-stack
 * Fixed CI duplicate function implementation errors
 */

import { glob } from 'glob';
import { readFile, stat } from 'fs/promises';
import { relative } from 'path';
import matter from 'gray-matter';
import { NoteParser } from './parser.js';
import { Note, NoteMetadata, SearchResult, ActionableItem } from './types.js';
import { ZoneManager, Zone } from './zones.js';
import { IndexManager } from './index-manager.js';

export interface ZoneSearchOptions {
  query?: string;
  tags?: string[];
  zones?: Zone[];  // Which zones to search
  dateFrom?: Date;
  dateTo?: Date;
  limit?: number;
}

interface ScoringWeights {
  exactTitleMatch: number;      // 200 (up from current ~50)
  titleWordMatch: number;       // 50 (new - partial title matches)
  exactTagMatch: number;        // 20 (up from 10)
  contentFirstParagraph: number; // 5 (new - intro matters more)
  contentMatch: number;         // 1 (basic content matches)
  recencyBoost: number;         // 0-10 based on age (new)
  zoneBoost: {
    notes: number;              // 5 (permanent knowledge)
    daily: number;              // 3 (journal entries)
    inbox: number;              // 1 (drafts)
    archive: number;            // 0 (historical)
    scratchpad: number;         // 2 (working notes)
    maps: number;               // 4 (curated entry points)
  };
}

const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  exactTitleMatch: 200,
  titleWordMatch: 50,
  exactTagMatch: 20,
  contentFirstParagraph: 5,
  contentMatch: 1,
  recencyBoost: 10, // Max boost for very recent notes
  zoneBoost: {
    notes: 5,
    daily: 3,
    inbox: 1,
    archive: 0,
    scratchpad: 2,
    maps: 4
  }
};

const CONFIDENCE_THRESHOLD = 25; // Early exit when we have enough high-scoring results

export class ZoneScanner {
  private zones: ZoneManager;
  private parser: NoteParser;
  private cache: Map<string, Note> = new Map();
  private cacheTimestamps: Map<string, number> = new Map();
  private indexManager: IndexManager;

  constructor(basePath: string, parser?: NoteParser) {
    this.zones = new ZoneManager(basePath);
    this.parser = parser || new NoteParser();
    this.indexManager = new IndexManager(basePath, this.parser);
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
                          contentSample.includes('- [ ]') ||
                          contentSample.includes('- [x]') ||
                          contentSample.includes('- [X]') ||
                          tags.includes('actionable');
    
    // Extract issue references from first part
    const issuePattern = /([a-zA-Z0-9_-]+[/-][a-zA-Z0-9_-]+#\d+)|(?:^|\s)#(\d+)(?:\s|$)/g;
    const linkedIssues: string[] = [];
    let issueMatch;
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
   * Search notes across zones - using smart ranking with early termination
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

    // PHASE 2: Smart ranking with early termination
    const results: SearchResult[] = [];
    
    if (options.query) {
      // Pre-filter and sort candidates by expected relevance
      const candidates = this.preFilterCandidates(filteredMetadata, options);
      const sortedCandidates = this.sortByExpectedRelevance(candidates, options);

      const limit = options.limit || 20;
      let processedCount = 0;

      // Process high-probability candidates first with early termination
      for (const candidate of sortedCandidates) {
        const basePath = this.zones.getBasePath();
        const fullPath = `${basePath}/${candidate.path}`;
        const note = await this.loadNote(fullPath);
        
        const scoreResult = this.scoreNoteEnhanced(note, options);
        processedCount++;
        
        if (scoreResult.score > 0) {
          const excerpt = this.generateContextualExcerpt(note.content, options.query);
          const metadata = this.parser.toMetadata(note);

          results.push({
            note: metadata,
            excerpt,
            score: scoreResult.score,
            matchedTags: scoreResult.matchedTags
          });

          // Sort results as we go to maintain top-N
          results.sort((a, b) => b.score - a.score);

          // Early exit if we have enough high-scoring results
          if (results.length >= limit && results[limit - 1].score >= CONFIDENCE_THRESHOLD) {
            break;
          }
        }

        // Also exit if we've processed enough candidates regardless of score threshold
        if (processedCount >= Math.min(sortedCandidates.length, limit * 3)) {
          break;
        }
      }
    } else {
      // No query - just return filtered metadata with enhanced tag scoring
      for (const metadata of filteredMetadata) {
        const scoreResult = this.scoreMetadataOnly(metadata, options);

        results.push({
          note: metadata,
          excerpt: '', // No excerpt needed for tag-only searches
          score: scoreResult.score,
          matchedTags: scoreResult.matchedTags
        });
      }
    }

    // Final sort and limit
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
   * Get index manager (for direct access to index operations)
   */
  getIndexManager(): IndexManager {
    return this.indexManager;
  }

  /**
   * Scan zones metadata using index (O(1) performance)
   */
  async scanZonesMetadata(zones: Zone[]): Promise<NoteMetadata[]> {
    // Check if index is stale and rebuild if needed
    if (await this.indexManager.isStale()) {
      console.error('[index] Rebuilding stale index...');
      await this.indexManager.rebuild();
    }

    return await this.indexManager.query({ zones });
  }

  /**
   * List notes by tags using index (optimized)
   */
  async listByTagsOptimized(
    tags: string[],
    matchMode: 'any' | 'all' = 'any',
    sortBy: 'created' | 'modified' | 'title' = 'modified',
    zones?: Zone[]
  ): Promise<NoteMetadata[]> {
    // Check if index is stale and rebuild if needed
    if (await this.indexManager.isStale()) {
      console.error('[index] Rebuilding stale index...');
      await this.indexManager.rebuild();
    }

    const zonesToSearch = zones || this.zones.getDefaultSearchZones();
    
    if (matchMode === 'all') {
      // For 'all' mode, use index query with all tags
      return await this.indexManager.query({ 
        zones: zonesToSearch, 
        tags 
      });
    } else {
      // For 'any' mode, query each tag separately and merge results
      const allResults: NoteMetadata[] = [];
      const seenPaths = new Set<string>();

      for (const tag of tags) {
        const tagResults = await this.indexManager.query({ 
          zones: zonesToSearch, 
          tags: [tag] 
        });
        
        for (const result of tagResults) {
          if (!seenPaths.has(result.path)) {
            seenPaths.add(result.path);
            allResults.push(result);
          }
        }
      }

      // Sort results
      allResults.sort((a, b) => {
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

      return allResults;
    }
  }

  /**
   * Get all tags using index (optimized)
   */
  async getAllTagsOptimized(zones?: Zone[]): Promise<Map<string, number>> {
    // Check if index is stale and rebuild if needed
    if (await this.indexManager.isStale()) {
      console.error('[index] Rebuilding stale index...');
      await this.indexManager.rebuild();
    }

    if (!zones) {
      // Return all tags from index
      return await this.indexManager.getAllTags();
    } else {
      // Filter by zones
      const metadata = await this.indexManager.query({ zones });
      const tagCounts = new Map<string, number>();

      for (const note of metadata) {
        for (const tag of note.tags) {
          tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
        }
      }

      return tagCounts;
    }
  }

  /**
   * List inbox items using index (optimized)
   */
  async listInboxItemsOptimized(subzone?: 'quick' | 'voice'): Promise<NoteMetadata[]> {
    // Check if index is stale and rebuild if needed
    if (await this.indexManager.isStale()) {
      console.error('[index] Rebuilding stale index...');
      await this.indexManager.rebuild();
    }

    const metadata = await this.indexManager.query({ zones: ['inbox'] });

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
   * Extract actionables from zones using metadata filtering (Phase 3a optimization)
   */
  async extractActionablesOptimized(zones: Zone[]): Promise<ActionableItem[]> {
    // PHASE 1: Get metadata from index to filter notes with actionables
    const metadata = await this.scanZonesMetadata(zones);
    
    // PHASE 2: Filter to only notes that have actionables flag
    const candidates = metadata.filter(m => m.hasActionables);
    
    // PHASE 3: Load full content only for candidate notes
    const basePath = this.zones.getBasePath();
    const notes = await Promise.all(
      candidates.map(async (m) => {
        const fullPath = `${basePath}/${m.path}`;
        return await this.loadNote(fullPath);
      })
    );

    // PHASE 4: Extract actionables from the filtered set
    const actionables: ActionableItem[] = [];
    for (const note of notes) {
      const noteActionables = this.parser.extractActionables(note);
      actionables.push(...noteActionables);
    }

    return actionables;
  }

  /**
   * Pre-filter candidates using metadata to optimize search order
   */
  private preFilterCandidates(metadata: NoteMetadata[], options: ZoneSearchOptions): NoteMetadata[] {
    if (!options.query) return metadata;

    const queryLower = options.query.toLowerCase();
    
    // Filter to notes likely to have matches based on title/tags
    return metadata.filter(note => {
      const titleMatch = note.title.toLowerCase().includes(queryLower);
      const tagMatch = note.tags.some(tag => tag.toLowerCase().includes(queryLower));
      
      // Keep if title/tag match - don't include all notes from high-value zones
      return titleMatch || tagMatch;
    });
  }

  /**
   * Sort candidates by expected relevance using metadata only
   */
  private sortByExpectedRelevance(candidates: NoteMetadata[], options: ZoneSearchOptions): NoteMetadata[] {
    if (!options.query) return candidates;

    const queryLower = options.query.toLowerCase();
    
    return candidates.sort((a, b) => {
      let scoreA = 0;
      let scoreB = 0;

      // Zone priority (notes > daily > inbox > archive)
      const zoneA = this.getZoneFromPath(a.path);
      const zoneB = this.getZoneFromPath(b.path);
      scoreA += DEFAULT_SCORING_WEIGHTS.zoneBoost[zoneA as keyof typeof DEFAULT_SCORING_WEIGHTS.zoneBoost] || 0;
      scoreB += DEFAULT_SCORING_WEIGHTS.zoneBoost[zoneB as keyof typeof DEFAULT_SCORING_WEIGHTS.zoneBoost] || 0;

      // Title match scoring
      const titleMatchA = a.title.toLowerCase().includes(queryLower);
      const titleMatchB = b.title.toLowerCase().includes(queryLower);
      if (titleMatchA) scoreA += 100;
      if (titleMatchB) scoreB += 100;

      // Exact title match boost
      if (a.title.toLowerCase() === queryLower) scoreA += 200;
      if (b.title.toLowerCase() === queryLower) scoreB += 200;

      // Tag match scoring
      const tagMatchA = a.tags.some(tag => tag.toLowerCase().includes(queryLower));
      const tagMatchB = b.tags.some(tag => tag.toLowerCase().includes(queryLower));
      if (tagMatchA) scoreA += 50;
      if (tagMatchB) scoreB += 50;

      // Recency boost (metadata only)
      const ageA = Date.now() - a.modified.getTime();
      const ageB = Date.now() - b.modified.getTime();
      const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
      scoreA += Math.max(0, DEFAULT_SCORING_WEIGHTS.recencyBoost * (1 - ageA / maxAge));
      scoreB += Math.max(0, DEFAULT_SCORING_WEIGHTS.recencyBoost * (1 - ageB / maxAge));

      return scoreB - scoreA;
    });
  }

  /**
   * Enhanced scoring algorithm for full notes
   */
  private scoreNoteEnhanced(note: Note, options: ZoneSearchOptions): { score: number; matchedTags: string[] } {
    let score = 0;
    const matchedTags: string[] = [];
    
    if (!options.query) {
      return { score: 0, matchedTags };
    }

    const queryLower = options.query.toLowerCase();
    const weights = DEFAULT_SCORING_WEIGHTS;

    // Tag scoring (enhanced)
    if (options.tags && options.tags.length > 0) {
      const exactTagMatches = options.tags.filter(tag => note.tags.includes(tag));
      matchedTags.push(...exactTagMatches);
      score += exactTagMatches.length * weights.exactTagMatch;
    }

    // Query matching in title
    const titleLower = note.title.toLowerCase();
    if (titleLower === queryLower) {
      // Exact title match
      score += weights.exactTitleMatch;
    } else if (titleLower.includes(queryLower)) {
      // Check if it's a word match vs substring
      const titleWords = titleLower.split(/\s+/);
      const queryWords = queryLower.split(/\s+/);
      const wordMatches = queryWords.filter(qw => titleWords.includes(qw));
      if (wordMatches.length > 0) {
        score += wordMatches.length * weights.titleWordMatch;
      } else {
        // Substring match
        score += weights.titleWordMatch / 2;
      }
    }

    // Query matching in content
    const contentLower = note.content.toLowerCase();
    if (contentLower.includes(queryLower)) {
      // Count occurrences
      const occurrences = (contentLower.match(new RegExp(queryLower, 'g')) || []).length;
      
      // First paragraph gets higher weight
      const firstParagraph = note.content.split('\n\n')[0]?.toLowerCase() || '';
      const firstParagraphMatches = (firstParagraph.match(new RegExp(queryLower, 'g')) || []).length;
      
      score += firstParagraphMatches * weights.contentFirstParagraph;
      score += (occurrences - firstParagraphMatches) * weights.contentMatch;
    }

    // Zone boost
    const zone = this.getZoneFromPath(note.path);
    score += weights.zoneBoost[zone as keyof typeof weights.zoneBoost] || 0;

    // Recency boost
    const age = Date.now() - note.modified.getTime();
    const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
    const recencyMultiplier = Math.max(0, 1 - age / maxAge);
    score += weights.recencyBoost * recencyMultiplier;

    return { score, matchedTags };
  }

  /**
   * Score metadata-only for tag searches
   */
  private scoreMetadataOnly(metadata: NoteMetadata, options: ZoneSearchOptions): { score: number; matchedTags: string[] } {
    let score = 0;
    const matchedTags: string[] = [];

    // Tag scoring
    if (options.tags && options.tags.length > 0) {
      const exactTagMatches = options.tags.filter(tag => metadata.tags.includes(tag));
      matchedTags.push(...exactTagMatches);
      score += exactTagMatches.length * DEFAULT_SCORING_WEIGHTS.exactTagMatch;
    }

    // Zone boost
    const zone = this.getZoneFromPath(metadata.path);
    score += DEFAULT_SCORING_WEIGHTS.zoneBoost[zone as keyof typeof DEFAULT_SCORING_WEIGHTS.zoneBoost] || 0;

    // Recency boost
    const age = Date.now() - metadata.modified.getTime();
    const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
    const recencyMultiplier = Math.max(0, 1 - age / maxAge);
    score += DEFAULT_SCORING_WEIGHTS.recencyBoost * recencyMultiplier;

    return { score, matchedTags };
  }

  /**
   * Extract zone from file path
   */
  private getZoneFromPath(path: string): Zone {
    const pathParts = path.split('/');
    const firstPart = pathParts[0];
    
    // Map path prefixes to zones
    if (firstPart === 'notes') return 'notes';
    if (firstPart === 'daily') return 'daily';
    if (firstPart === 'inbox') return 'inbox';
    if (firstPart === 'archive') return 'archive';
    if (firstPart === 'maps') return 'maps';
    if (path.includes('scratchpad')) return 'scratchpad';
    
    // Default to notes if unclear
    return 'notes';
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
