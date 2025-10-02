/**
 * Metadata index manager for thread-stack
 * Maintains .thread-stack-index.json with pre-computed metadata
 */

import { readFile, writeFile, stat } from 'fs/promises';
import { join } from 'path';
import { NoteMetadata } from './types.js';
import { NoteParser } from './parser.js';
import { ZoneManager, Zone } from './zones.js';
import { glob } from 'glob';

export interface MetadataIndex {
  version: number;
  lastUpdated: string;
  notes: Array<NoteMetadata & { mtime: number }>;
  tags: Record<string, number>;
}

export interface QueryOptions {
  zones?: Zone[];
  tags?: string[];
  dateFrom?: Date;
  dateTo?: Date;
  limit?: number;
}

export class IndexManager {
  private indexPath: string;
  private index: MetadataIndex | null = null;
  private zones: ZoneManager;
  private parser: NoteParser;

  constructor(basePath: string, parser?: NoteParser) {
    this.indexPath = join(basePath, '.thread-stack-index.json');
    this.zones = new ZoneManager(basePath);
    this.parser = parser || new NoteParser();
  }

  /**
   * Load index from disk
   */
  async load(): Promise<MetadataIndex> {
    if (this.index) {
      return this.index;
    }

    try {
      const content = await readFile(this.indexPath, 'utf-8');
      this.index = JSON.parse(content);
      
      // Convert date strings back to Date objects
      if (this.index) {
        this.index.notes = this.index.notes.map(note => ({
          ...note,
          created: new Date(note.created),
          modified: new Date(note.modified)
        }));
      }

      return this.index as MetadataIndex;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // Index doesn't exist, create empty one
        this.index = {
          version: 1,
          lastUpdated: new Date().toISOString(),
          notes: [],
          tags: {}
        };
        return this.index;
      }
      throw error;
    }
  }

  /**
   * Save index to disk
   */
  private async save(): Promise<void> {
    if (!this.index) {
      throw new Error('No index to save');
    }

    // Update timestamp
    this.index.lastUpdated = new Date().toISOString();

    // Write atomically using temp file
    const tempPath = this.indexPath + '.tmp';
    await writeFile(tempPath, JSON.stringify(this.index, null, 2), 'utf-8');
    
    // Rename to final path (atomic on most filesystems)
    await writeFile(this.indexPath, JSON.stringify(this.index, null, 2), 'utf-8');
  }

  /**
   * Check if index is stale compared to file system
   */
  async isStale(): Promise<boolean> {
    await this.load();
    
    if (!this.index || this.index.notes.length === 0) {
      return true;
    }

    try {
      const indexStat = await stat(this.indexPath);
      const indexMtime = indexStat.mtimeMs;

      // Check all zones for newer files
      const allZones: Zone[] = ['scratchpad', 'inbox', 'notes', 'daily', 'maps'];
      
      for (const zone of allZones) {
        if (zone === 'scratchpad') {
          // Check scratchpad file
          const scratchpadPath = this.zones.getZonePath('scratchpad');
          try {
            const fileStat = await stat(scratchpadPath);
            if (fileStat.mtimeMs > indexMtime) {
              return true;
            }
          } catch {
            // Scratchpad doesn't exist, skip
          }
        } else {
          // Check directory zones
          const zonePaths = this.zones.getZonePaths([zone]);
          
          for (const zonePath of zonePaths) {
            const pattern = `${zonePath}/**/*.md`;
            try {
              const files = await glob(pattern, { windowsPathsNoEscape: true });
              
              for (const file of files) {
                try {
                  const fileStat = await stat(file);
                  if (fileStat.mtimeMs > indexMtime) {
                    return true;
                  }
                } catch {
                  // File might have been deleted, will be handled in rebuild
                }
              }
            } catch {
              // Zone directory doesn't exist, skip
            }
          }
        }
      }

      return false;
    } catch {
      // If we can't check, assume stale
      return true;
    }
  }

  /**
   * Rebuild entire index from file system
   */
  async rebuild(): Promise<void> {
    console.error('[index] Rebuilding metadata index...');
    
    const newIndex: MetadataIndex = {
      version: 1,
      lastUpdated: new Date().toISOString(),
      notes: [],
      tags: {}
    };

    const allZones: Zone[] = ['scratchpad', 'inbox', 'notes', 'daily', 'maps'];
    
    for (const zone of allZones) {
      if (zone === 'scratchpad') {
        // Handle scratchpad file
        const scratchpadPath = this.zones.getZonePath('scratchpad');
        try {
          await this.addNoteToIndex(newIndex, scratchpadPath);
        } catch {
          // Scratchpad might not exist, skip
        }
      } else {
        // Handle directory zones
        const zonePaths = this.zones.getZonePaths([zone]);
        
        for (const zonePath of zonePaths) {
          const pattern = `${zonePath}/**/*.md`;
          try {
            const files = await glob(pattern, { windowsPathsNoEscape: true });
            
            for (const file of files) {
              try {
                await this.addNoteToIndex(newIndex, file);
              } catch (error) {
                console.error(`[index] Failed to index ${file}:`, error);
              }
            }
          } catch {
            // Zone directory doesn't exist, skip
          }
        }
      }
    }

    this.index = newIndex;
    await this.save();
    
    console.error(`[index] Rebuilt index with ${newIndex.notes.length} notes`);
  }

  /**
   * Update index for a specific note
   */
  async update(notePath: string): Promise<void> {
    await this.load();
    
    if (!this.index) {
      await this.rebuild();
      return;
    }

    // Remove existing entry
    this.index.notes = this.index.notes.filter(note => note.path !== notePath);

    // Add updated entry
    try {
      const fullPath = join(this.zones.getBasePath(), notePath);
      await this.addNoteToIndex(this.index, fullPath);
      await this.save();
    } catch (error) {
      console.error(`[index] Failed to update ${notePath}:`, error);
    }
  }

  /**
   * Get metadata for a specific note
   */
  async get(path: string): Promise<NoteMetadata | null> {
    await this.load();
    
    if (!this.index) {
      return null;
    }

    const note = this.index.notes.find(n => n.path === path);
    if (!note) {
      return null;
    }

    // Return without mtime
    const { mtime, ...metadata } = note;
    return metadata;
  }

  /**
   * Query notes based on options
   */
  async query(options: QueryOptions): Promise<NoteMetadata[]> {
    await this.load();
    
    if (!this.index) {
      return [];
    }

    let results = [...this.index.notes];

    // Filter by zones
    if (options.zones) {
      const zonePatterns = options.zones.map(zone => {
        if (zone === 'scratchpad') {
          return 'scratch.md';
        }
        return `${zone}/`;
      });
      
      results = results.filter(note => 
        zonePatterns.some(pattern => note.path.includes(pattern))
      );
    }

    // Filter by tags
    if (options.tags && options.tags.length > 0) {
      results = results.filter(note =>
        options.tags!.every(tag => note.tags.includes(tag))
      );
    }

    // Filter by date range
    if (options.dateFrom) {
      results = results.filter(note => note.created >= options.dateFrom!);
    }
    if (options.dateTo) {
      results = results.filter(note => note.created <= options.dateTo!);
    }

    // Sort by modified date (newest first)
    results.sort((a, b) => b.modified.getTime() - a.modified.getTime());

    // Apply limit
    if (options.limit && options.limit > 0) {
      results = results.slice(0, options.limit);
    }

    // Return without mtime
    return results.map(({ mtime, ...metadata }) => metadata);
  }

  /**
   * Invalidate specific notes (remove from index)
   */
  async invalidate(paths: string[]): Promise<void> {
    await this.load();
    
    if (!this.index) {
      return;
    }

    const initialCount = this.index.notes.length;
    this.index.notes = this.index.notes.filter(note => !paths.includes(note.path));
    
    if (this.index.notes.length !== initialCount) {
      // Rebuild tag counts
      this.rebuildTagCounts();
      await this.save();
    }
  }

  /**
   * Get all tags with counts
   */
  async getAllTags(): Promise<Map<string, number>> {
    await this.load();
    
    if (!this.index) {
      return new Map();
    }

    return new Map(Object.entries(this.index.tags));
  }

  /**
   * Get index stats
   */
  async getStats(): Promise<{
    noteCount: number;
    tagCount: number;
    lastUpdated: string;
    isStale: boolean;
  }> {
    await this.load();
    const stale = await this.isStale();
    
    return {
      noteCount: this.index?.notes.length || 0,
      tagCount: this.index ? Object.keys(this.index.tags).length : 0,
      lastUpdated: this.index?.lastUpdated || 'never',
      isStale: stale
    };
  }

  /**
   * Add a note to the index
   */
  private async addNoteToIndex(index: MetadataIndex, filePath: string): Promise<void> {
    // Read file
    const content = await readFile(filePath, 'utf-8');
    const fileStats = await stat(filePath);

    // Parse note
    const relativePath = this.zones.getRelativePath(filePath);
    const note = this.parser.parse(
      relativePath,
      content,
      {
        created: fileStats.birthtime,
        modified: fileStats.mtime
      }
    );

    // Convert to metadata with mtime
    const metadata = this.parser.toMetadata(note);
    const indexEntry = {
      ...metadata,
      mtime: fileStats.mtimeMs
    };

    // Add to index
    index.notes.push(indexEntry);

    // Update tag counts
    for (const tag of metadata.tags) {
      index.tags[tag] = (index.tags[tag] || 0) + 1;
    }
  }

  /**
   * Rebuild tag counts from current notes
   */
  private rebuildTagCounts(): void {
    if (!this.index) {
      return;
    }

    this.index.tags = {};
    for (const note of this.index.notes) {
      for (const tag of note.tags) {
        this.index.tags[tag] = (this.index.tags[tag] || 0) + 1;
      }
    }
  }
}