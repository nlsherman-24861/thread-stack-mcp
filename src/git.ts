/**
 * Git integration for note history and metadata
 */

import { simpleGit, SimpleGit, LogResult } from 'simple-git';
import { GitCommit, NoteHistory } from './types.js';

export class GitIntegration {
  private git: SimpleGit;
  private basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
    this.git = simpleGit(basePath);
  }

  /**
   * Check if the directory is a git repository
   */
  async isRepository(): Promise<boolean> {
    try {
      await this.git.status();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get file creation date from git history
   */
  async getFileCreationDate(filePath: string): Promise<Date | null> {
    try {
      const log = await this.git.log({
        file: filePath,
        '--diff-filter': 'A', // Only addition commits
        '--follow': null // Follow file renames
      });

      if (log.all.length > 0) {
        const firstCommit = log.all[log.all.length - 1];
        return new Date(firstCommit.date);
      }

      return null;
    } catch (error) {
      console.error(`Failed to get creation date for ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Get file last modified date from git history
   */
  async getFileModifiedDate(filePath: string): Promise<Date | null> {
    try {
      const log = await this.git.log({
        file: filePath,
        maxCount: 1
      });

      if (log.all.length > 0) {
        return new Date(log.all[0].date);
      }

      return null;
    } catch (error) {
      console.error(`Failed to get modified date for ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Get full commit history for a file
   */
  async getFileHistory(filePath: string, limit?: number): Promise<NoteHistory | null> {
    try {
      const log = await this.git.log({
        file: filePath,
        maxCount: limit,
        '--follow': null
      });

      const commits: GitCommit[] = log.all.map(commit => ({
        hash: commit.hash,
        author: commit.author_name,
        date: new Date(commit.date),
        message: commit.message,
        files: [filePath]
      }));

      const created = commits.length > 0
        ? new Date(commits[commits.length - 1].date)
        : new Date();

      const lastModified = commits.length > 0
        ? new Date(commits[0].date)
        : new Date();

      return {
        path: filePath,
        commits,
        created,
        lastModified,
        totalCommits: log.total
      };
    } catch (error) {
      console.error(`Failed to get history for ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Get commits within a date range
   */
  async getCommitsInRange(dateFrom: Date, dateTo: Date): Promise<GitCommit[]> {
    try {
      const log = await this.git.log({
        '--since': dateFrom.toISOString(),
        '--until': dateTo.toISOString()
      });

      return log.all.map(commit => ({
        hash: commit.hash,
        author: commit.author_name,
        date: new Date(commit.date),
        message: commit.message,
        files: commit.diff?.files?.map(f => f.file) || []
      }));
    } catch (error) {
      console.error('Failed to get commits in range:', error);
      return [];
    }
  }

  /**
   * Get files modified in the last N days
   */
  async getRecentlyModifiedFiles(days: number): Promise<string[]> {
    try {
      const since = new Date();
      since.setDate(since.getDate() - days);

      const log = await this.git.log({
        '--since': since.toISOString(),
        '--name-only': null
      });

      const files = new Set<string>();

      for (const commit of log.all) {
        if (commit.diff?.files) {
          commit.diff.files.forEach(f => files.add(f.file));
        }
      }

      return Array.from(files).filter(f => f.endsWith('.md'));
    } catch (error) {
      console.error('Failed to get recently modified files:', error);
      return [];
    }
  }

  /**
   * Get files created in the last N days
   */
  async getRecentlyCreatedFiles(days: number): Promise<string[]> {
    try {
      const since = new Date();
      since.setDate(since.getDate() - days);

      const log = await this.git.log({
        '--since': since.toISOString(),
        '--diff-filter': 'A',
        '--name-only': null
      });

      const files = new Set<string>();

      for (const commit of log.all) {
        if (commit.diff?.files) {
          commit.diff.files.forEach(f => files.add(f.file));
        }
      }

      return Array.from(files).filter(f => f.endsWith('.md'));
    } catch (error) {
      console.error('Failed to get recently created files:', error);
      return [];
    }
  }

  /**
   * Check if file has uncommitted changes
   */
  async hasUncommittedChanges(filePath?: string): Promise<boolean> {
    try {
      const status = await this.git.status(filePath ? [filePath] : undefined);
      return status.files.length > 0;
    } catch (error) {
      console.error('Failed to check uncommitted changes:', error);
      return false;
    }
  }

  /**
   * Get current branch name
   */
  async getCurrentBranch(): Promise<string> {
    try {
      const branch = await this.git.branch();
      return branch.current;
    } catch (error) {
      console.error('Failed to get current branch:', error);
      return 'unknown';
    }
  }
}
