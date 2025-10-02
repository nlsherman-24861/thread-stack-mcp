/**
 * Zone management for thread-stack structure
 */

import { join } from 'path';
import { access } from 'fs/promises';

export type Zone = 'scratchpad' | 'inbox' | 'notes' | 'daily' | 'maps' | 'archive';

export interface ZoneStructure {
  basePath: string;
  scratchpad: string;       // scratch.md
  inbox: {
    quick: string;          // inbox/quick/
    voice: string;          // inbox/voice/
  };
  notes: string;            // notes/
  daily: string;            // daily/
  maps: string;             // maps/
  archive: string;          // archive/
}

export interface ZoneConfig {
  searchByDefault: boolean;  // Include in default searches?
  requiresStructure: boolean; // Need tags/links?
  isTransient: boolean;      // Expected to be deleted/rewritten?
}

export const ZONE_CONFIGS: Record<Zone, ZoneConfig> = {
  scratchpad: {
    searchByDefault: false,  // Too ephemeral
    requiresStructure: false, // Zero structure
    isTransient: true
  },
  inbox: {
    searchByDefault: false,  // Optional in searches
    requiresStructure: false, // Minimal structure
    isTransient: true        // Meant to be processed
  },
  notes: {
    searchByDefault: true,   // Primary knowledge base
    requiresStructure: true,  // Full enrichment
    isTransient: false
  },
  daily: {
    searchByDefault: true,   // Journal is searchable
    requiresStructure: false, // Casual entries
    isTransient: false
  },
  maps: {
    searchByDefault: true,   // Curated entry points
    requiresStructure: true,  // Well-organized
    isTransient: false
  },
  archive: {
    searchByDefault: false,  // Explicitly opt-in
    requiresStructure: false,
    isTransient: false
  }
};

export class ZoneManager {
  private structure: ZoneStructure;

  constructor(basePath: string) {
    this.structure = {
      basePath,
      scratchpad: join(basePath, 'scratch.md'),
      inbox: {
        quick: join(basePath, 'inbox', 'quick'),
        voice: join(basePath, 'inbox', 'voice')
      },
      notes: join(basePath, 'notes'),
      daily: join(basePath, 'daily'),
      maps: join(basePath, 'maps'),
      archive: join(basePath, 'archive')
    };
  }

  /**
   * Get path for a zone
   */
  getZonePath(zone: Zone, subzone?: 'quick' | 'voice'): string {
    switch (zone) {
      case 'scratchpad':
        return this.structure.scratchpad;
      case 'inbox':
        if (subzone) {
          return this.structure.inbox[subzone];
        }
        return join(this.structure.basePath, 'inbox');
      case 'notes':
        return this.structure.notes;
      case 'daily':
        return this.structure.daily;
      case 'maps':
        return this.structure.maps;
      case 'archive':
        return this.structure.archive;
    }
  }

  /**
   * Determine which zone a file path belongs to
   */
  getZoneForPath(filePath: string): Zone | null {
    const relative = filePath.replace(this.structure.basePath, '').replace(/\\/g, '/');

    if (relative.includes('scratch.md')) {
      return 'scratchpad';
    }
    if (relative.includes('/inbox/')) {
      return 'inbox';
    }
    if (relative.includes('/notes/')) {
      return 'notes';
    }
    if (relative.includes('/daily/')) {
      return 'daily';
    }
    if (relative.includes('/maps/')) {
      return 'maps';
    }
    if (relative.includes('/archive/')) {
      return 'archive';
    }

    return null;
  }

  /**
   * Get zones that should be searched by default
   */
  getDefaultSearchZones(): Zone[] {
    return Object.entries(ZONE_CONFIGS)
      .filter(([_, config]) => config.searchByDefault)
      .map(([zone, _]) => zone as Zone);
  }

  /**
   * Check if zone exists in filesystem
   */
  async zoneExists(zone: Zone): Promise<boolean> {
    try {
      await access(this.getZonePath(zone));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get all zone paths for scanning
   */
  getZonePaths(zones: Zone[]): string[] {
    const paths: string[] = [];

    for (const zone of zones) {
      switch (zone) {
        case 'scratchpad':
          paths.push(this.structure.scratchpad);
          break;
        case 'inbox':
          paths.push(this.structure.inbox.quick);
          paths.push(this.structure.inbox.voice);
          break;
        case 'notes':
          paths.push(this.structure.notes);
          break;
        case 'daily':
          paths.push(this.structure.daily);
          break;
        case 'maps':
          paths.push(this.structure.maps);
          break;
        case 'archive':
          paths.push(this.structure.archive);
          break;
      }
    }

    return paths;
  }

  /**
   * Get base path
   */
  getBasePath(): string {
    return this.structure.basePath;
  }

  /**
   * Get relative path from absolute path
   */
  getRelativePath(absolutePath: string): string {
    // Normalize both paths to use forward slashes for consistent comparison
    const normalizedAbsolutePath = absolutePath.replace(/\\/g, '/');
    const normalizedBasePath = this.structure.basePath.replace(/\\/g, '/');
    
    // Remove base path from absolute path, handling various separator combinations
    if (normalizedAbsolutePath.startsWith(normalizedBasePath + '/')) {
      return normalizedAbsolutePath.substring(normalizedBasePath.length + 1);
    } else if (normalizedAbsolutePath.startsWith(normalizedBasePath)) {
      // Handle case where base path doesn't end with separator
      return normalizedAbsolutePath.substring(normalizedBasePath.length).replace(/^[\/\\]+/, '');
    }
    
    // If path doesn't contain base path, return as-is (might already be relative)
    return normalizedAbsolutePath;
  }

  /**
   * Generate filename for daily entry
   */
  getDailyFilename(date?: Date): string {
    const d = date || new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return join(this.structure.daily, `${year}-${month}-${day}.md`);
  }

  /**
   * Generate filename for new note
   */
  generateNoteFilename(title: string, date?: Date): string {
    const d = date || new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');

    // Convert title to slug
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    return join(this.structure.notes, `${year}-${month}-${day}-${slug}.md`);
  }

  /**
   * Generate filename for inbox item
   */
  generateInboxFilename(title: string, subzone: 'quick' | 'voice' = 'quick'): string {
    const timestamp = Date.now();
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    return join(this.structure.inbox[subzone], `${timestamp}-${slug}.md`);
  }
}
