/**
 * Core types for thread-stack MCP server
 */

export interface Note {
  path: string;
  title: string;
  content: string;
  excerpt?: string;
  tags: string[];
  created: Date;
  modified: Date;
  links: string[];
  metadata?: Record<string, any>;
}

export interface NoteMetadata {
  path: string;
  title: string;
  tags: string[];
  created: Date;
  modified: Date;
  wordCount: number;
  hasActionables: boolean;
  linkedIssues: string[];
  linkedNotes: string[];
}

export interface SearchResult {
  note: NoteMetadata;
  excerpt: string;
  score: number;
  matchedTags: string[];
}

export interface ActionableItem {
  sourceNote: string;
  content: string;
  tags: string[];
  context: string;
  linkedIssue?: string;
  status: 'open' | 'done';
  priority?: 'high' | 'medium' | 'low';
  line?: number;
}

export interface ThreadStackConfig {
  version: string;
  notePath: string;
  archivePath?: string;
  tagPrefix: string;
  linkStyle: 'wikilink' | 'markdown';
  dateFormat: string;
  defaultTags: string[];
  actionableMarker: string;
}

export interface SearchOptions {
  query?: string;
  tags?: string[];
  dateFrom?: Date;
  dateTo?: Date;
  limit?: number;
  includeArchived?: boolean;
}

export interface TagMatch {
  tag: string;
  count: number;
  notes: string[];
}

export interface GitCommit {
  hash: string;
  author: string;
  date: Date;
  message: string;
  files: string[];
}

export interface NoteHistory {
  path: string;
  commits: GitCommit[];
  created: Date;
  lastModified: Date;
  totalCommits: number;
}

export interface RelatedNote {
  path: string;
  title: string;
  relationship: 'linked' | 'similar' | 'tagged';
  score: number;
}

export interface ActivitySummary {
  period: string;
  notesCreated: number;
  notesModified: number;
  actionablesAdded: number;
  actionablesCompleted: number;
  mostActiveTags: string[];
  highlights: Array<{
    note: string;
    title: string;
    summary: string;
  }>;
}
