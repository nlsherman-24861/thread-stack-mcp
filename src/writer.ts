/**
 * Content writer for thread-stack zones
 */

import { appendFile, writeFile, readFile, mkdir } from 'fs/promises';
import { dirname, basename } from 'path';
import { ZoneManager } from './zones.js';

export class ContentWriter {
  private zones: ZoneManager;

  constructor(zones: ZoneManager) {
    this.zones = zones;
  }

  /**
   * Capture thought to scratchpad (append with timestamp)
   */
  async captureToScratchpad(content: string): Promise<{ path: string; timestamp: string }> {
    const scratchpadPath = this.zones.getZonePath('scratchpad');

    // Ensure scratchpad exists with header
    try {
      await readFile(scratchpadPath, 'utf-8');
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        const header = '# Scratchpad\n\nYour thought incubator. Write anything. Delete everything. No structure required.\n\n---\n';
        await writeFile(scratchpadPath, header, 'utf-8');
      }
    }

    const now = new Date();
    const timestamp = now.toISOString();
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

    const entry = `\n## ${timeStr}\n\n${content.trim()}\n`;

    await appendFile(scratchpadPath, entry, 'utf-8');

    return {
      path: scratchpadPath,
      timestamp
    };
  }

  /**
   * Read scratchpad content
   */
  async readScratchpad(): Promise<string> {
    const scratchpadPath = this.zones.getZonePath('scratchpad');
    try {
      return await readFile(scratchpadPath, 'utf-8');
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return '# Scratchpad\n\nYour thought incubator. Write anything. Delete everything. No structure required.\n\n---\n';
      }
      throw error;
    }
  }

  /**
   * Clear scratchpad (keep header)
   */
  async clearScratchpad(): Promise<void> {
    const scratchpadPath = this.zones.getZonePath('scratchpad');
    const header = '# Scratchpad\n\nYour thought incubator. Write anything. Delete everything. No structure required.\n\n---\n';
    await writeFile(scratchpadPath, header, 'utf-8');
  }

  /**
   * Create inbox item (minimal structure)
   */
  async createInboxItem(
    title: string,
    content: string,
    subzone: 'quick' | 'voice' = 'quick'
  ): Promise<{ path: string; filename: string }> {
    const filename = this.zones.generateInboxFilename(title, subzone);

    // Ensure directory exists
    await mkdir(dirname(filename), { recursive: true });

    const markdown = `# ${title}\n\n${content.trim()}\n`;

    await writeFile(filename, markdown, 'utf-8');

    return {
      path: filename,
      filename: basename(filename)
    };
  }

  /**
   * Create note (full structure with tags and links)
   */
  async createNote(
    title: string,
    content: string,
    options?: {
      tags?: string[];
      links?: string[];
      frontmatter?: Record<string, any>;
      date?: Date;
    }
  ): Promise<{ path: string; filename: string }> {
    const filename = this.zones.generateNoteFilename(title, options?.date);

    // Ensure directory exists
    await mkdir(dirname(filename), { recursive: true });

    let markdown = '';

    // Add frontmatter if provided
    if (options?.frontmatter) {
      markdown += '---\n';
      markdown += `title: ${title}\n`;
      if (options.frontmatter.tags) {
        markdown += `tags: [${options.frontmatter.tags.join(', ')}]\n`;
      }
      Object.entries(options.frontmatter).forEach(([key, value]) => {
        if (key !== 'tags' && key !== 'title') {
          markdown += `${key}: ${JSON.stringify(value)}\n`;
        }
      });
      markdown += '---\n\n';
    }

    // Add title
    markdown += `# ${title}\n\n`;

    // Add content
    markdown += content.trim();

    // Add links section if provided
    if (options?.links && options.links.length > 0) {
      markdown += '\n\n## Links\n\n';
      options.links.forEach(link => {
        markdown += `- [[${link}]]\n`;
      });
    }

    // Add tags at the end if provided
    if (options?.tags && options.tags.length > 0) {
      markdown += '\n\n';
      markdown += options.tags.map(tag => `#${tag}`).join(' ');
      markdown += '\n';
    }

    await writeFile(filename, markdown, 'utf-8');

    return {
      path: filename,
      filename: basename(filename)
    };
  }

  /**
   * Create or append to daily entry
   */
  async createDailyEntry(
    content: string,
    date?: Date
  ): Promise<{ path: string; filename: string; created: boolean }> {
    const filename = this.zones.getDailyFilename(date);
    const now = date || new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

    // Ensure directory exists
    await mkdir(dirname(filename), { recursive: true });

    let created = false;

    try {
      await readFile(filename);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // Create new daily file with header
        const dateStr = now.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
        const header = `# ${dateStr}\n\n`;
        await writeFile(filename, header, 'utf-8');
        created = true;
      } else {
        throw error;
      }
    }

    // Append entry
    const entry = `## ${timeStr}\n\n${content.trim()}\n\n`;
    await appendFile(filename, entry, 'utf-8');

    return {
      path: filename,
      filename: basename(filename),
      created
    };
  }

  /**
   * Promote scratchpad content to inbox
   */
  async promoteToInbox(
    content: string,
    title: string,
    subzone: 'quick' | 'voice' = 'quick'
  ): Promise<{ path: string; filename: string }> {
    return this.createInboxItem(title, content, subzone);
  }

  /**
   * Promote inbox item to notes
   */
  async promoteToNotes(
    inboxPath: string,
    options?: {
      tags?: string[];
      links?: string[];
      additionalContent?: string;
    }
  ): Promise<{ oldPath: string; newPath: string; filename: string }> {
    // Read inbox file
    const inboxContent = await readFile(inboxPath, 'utf-8');

    // Extract title (first line or first H1)
    const titleMatch = inboxContent.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1] : basename(inboxPath, '.md');

    // Get content without title
    let content = inboxContent.replace(/^#\s+.+$/m, '').trim();

    // Add additional content if provided
    if (options?.additionalContent) {
      content += '\n\n' + options.additionalContent;
    }

    // Create note
    const result = await this.createNote(title, content, {
      tags: options?.tags,
      links: options?.links
    });

    return {
      oldPath: inboxPath,
      newPath: result.path,
      filename: result.filename
    };
  }

  /**
   * Create a map (MOC - Map of Content)
   */
  async createMap(
    title: string,
    description: string,
    sections: Array<{ heading: string; links: string[] }>
  ): Promise<{ path: string; filename: string }> {
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const filename = `${slug}.md`;
    const path = this.zones.getZonePath('maps') + `/${filename}`;

    // Ensure directory exists
    await mkdir(dirname(path), { recursive: true });

    let markdown = `# ${title}\n\n${description}\n\n`;

    sections.forEach(section => {
      markdown += `## ${section.heading}\n\n`;
      section.links.forEach(link => {
        markdown += `- [[${link}]]\n`;
      });
      markdown += '\n';
    });

    await writeFile(path, markdown, 'utf-8');

    return { path, filename };
  }

  /**
   * Append to existing note
   */
  async appendToNote(
    notePath: string,
    content: string,
    section?: string
  ): Promise<void> {
    let existingContent = await readFile(notePath, 'utf-8');

    if (section) {
      // Try to append under specific section
      const sectionRegex = new RegExp(`^##\\s+${section}$`, 'm');
      const match = sectionRegex.exec(existingContent);

      if (match) {
        // Find next section or end of file
        const afterSection = existingContent.substring(match.index);
        const nextSectionMatch = afterSection.match(/\n##\s+/);

        if (nextSectionMatch && nextSectionMatch.index !== undefined) {
          const insertPos = match.index + nextSectionMatch.index;
          existingContent =
            existingContent.substring(0, insertPos) +
            `\n${content.trim()}\n` +
            existingContent.substring(insertPos);
        } else {
          // Append to end of section
          existingContent += `\n${content.trim()}\n`;
        }
      } else {
        // Section doesn't exist, create it
        existingContent += `\n## ${section}\n\n${content.trim()}\n`;
      }
    } else {
      // Append to end
      existingContent += `\n${content.trim()}\n`;
    }

    await writeFile(notePath, existingContent, 'utf-8');
  }
}
