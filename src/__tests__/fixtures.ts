/**
 * Test fixture generator for performance testing
 */

import { writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';

export interface FixtureConfig {
  basePath: string;
  noteCount: number;
  tagsPerNote: number;
  linksPerNote: number;
  avgWordCount: number;
  actionableDensity: number; // 0-1, percentage of notes with actionables
}

const SAMPLE_TAGS = [
  'project', 'idea', 'research', 'meeting', 'decision',
  'architecture', 'design', 'implementation', 'bug', 'feature',
  'auth', 'security', 'performance', 'testing', 'docs',
  'frontend', 'backend', 'api', 'database', 'deployment'
];

const SAMPLE_TITLES = [
  'Authentication System Design',
  'Performance Optimization Notes',
  'Meeting Notes',
  'Project Roadmap',
  'Technical Decisions',
  'API Design Patterns',
  'Database Schema',
  'Frontend Architecture',
  'Testing Strategy',
  'Deployment Pipeline',
  'Security Considerations',
  'User Research Findings',
  'Feature Specifications',
  'Bug Investigation',
  'Code Review Notes'
];

const LOREM = `
Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor
incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis
nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.

Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore
eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt
in culpa qui officia deserunt mollit anim id est laborum.

## Key Points

- Important consideration about the system design
- Trade-offs we need to evaluate carefully
- Dependencies that affect our timeline
- Resources required for implementation

## Next Steps

Further analysis needed in several areas to make informed decisions about
the path forward. We should reconvene after gathering more data.
`.trim();

/**
 * Generate a realistic note with frontmatter
 */
function generateNote(
  index: number,
  config: FixtureConfig,
  existingPaths: string[]
): string {
  const title = SAMPLE_TITLES[index % SAMPLE_TITLES.length] + ` ${Math.floor(index / SAMPLE_TITLES.length) + 1}`;

  // Random tags
  const tags: string[] = [];
  for (let i = 0; i < config.tagsPerNote; i++) {
    const tag = SAMPLE_TAGS[Math.floor(Math.random() * SAMPLE_TAGS.length)];
    if (!tags.includes(tag)) tags.push(tag);
  }

  // Random links to existing notes
  const links: string[] = [];
  if (existingPaths.length > 0) {
    for (let i = 0; i < Math.min(config.linksPerNote, existingPaths.length); i++) {
      const link = existingPaths[Math.floor(Math.random() * existingPaths.length)];
      if (!links.includes(link)) links.push(link);
    }
  }

  // Generate content
  const paragraphs = Math.ceil(config.avgWordCount / 100);
  const content = Array(paragraphs).fill(LOREM).join('\n\n');

  // Add actionables?
  let actionables = '';
  if (Math.random() < config.actionableDensity) {
    actionables = `\n## Actionable Items\n\n- [ ] Review implementation approach #high\n- [ ] Update documentation\n- [x] Initial research completed\n`;
  }

  // Build frontmatter
  const frontmatter = `---
title: ${title}
tags: [${tags.join(', ')}]
created: ${new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000).toISOString()}
---`;

  // Build links section
  const linkSection = links.length > 0
    ? `\n## Related\n\n${links.map(l => `- [[${l}]]`).join('\n')}\n`
    : '';

  return `${frontmatter}\n\n# ${title}\n\n${content}${actionables}${linkSection}`;
}

/**
 * Generate test fixtures
 */
export async function generateFixtures(config: FixtureConfig): Promise<void> {
  console.error(`Generating ${config.noteCount} test notes in ${config.basePath}...`);

  // Create directory structure
  await rm(config.basePath, { recursive: true, force: true });
  await mkdir(join(config.basePath, 'notes'), { recursive: true });
  await mkdir(join(config.basePath, 'inbox', 'quick'), { recursive: true });
  await mkdir(join(config.basePath, 'inbox', 'voice'), { recursive: true });
  await mkdir(join(config.basePath, 'daily'), { recursive: true });

  const existingPaths: string[] = [];

  // Generate notes
  for (let i = 0; i < config.noteCount; i++) {
    const date = new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000);
    const dateStr = date.toISOString().split('T')[0];
    const filename = `${dateStr}-note-${i.toString().padStart(4, '0')}.md`;
    const path = join(config.basePath, 'notes', filename);

    const content = generateNote(i, config, existingPaths);
    await writeFile(path, content, 'utf-8');

    existingPaths.push(`notes/${filename}`);

    if ((i + 1) % 100 === 0) {
      console.error(`  Generated ${i + 1}/${config.noteCount} notes...`);
    }
  }

  // Generate some inbox items
  const inboxCount = Math.floor(config.noteCount * 0.1);
  for (let i = 0; i < inboxCount; i++) {
    const subzone = Math.random() > 0.5 ? 'quick' : 'voice';
    const timestamp = Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000;
    const filename = `${timestamp}-inbox-${i}.md`;
    const path = join(config.basePath, 'inbox', subzone, filename);

    const title = `Inbox Item ${i}`;
    const content = `# ${title}\n\n${LOREM.split('\n\n')[0]}`;
    await writeFile(path, content, 'utf-8');
  }

  // Generate scratchpad
  const scratchpadPath = join(config.basePath, 'scratchpad.md');
  const scratchpadContent = `# Scratchpad

[2025-10-01 10:30] Quick thought about refactoring
[2025-10-01 14:15] Need to follow up on the deployment issue
[2025-10-01 16:45] Idea for improving the search performance
`;
  await writeFile(scratchpadPath, scratchpadContent, 'utf-8');

  console.error(`✓ Fixtures generated: ${config.noteCount} notes, ${inboxCount} inbox items`);
}

/**
 * Common fixture configs
 */
export const FIXTURE_CONFIGS = {
  small: {
    noteCount: 50,
    tagsPerNote: 3,
    linksPerNote: 2,
    avgWordCount: 200,
    actionableDensity: 0.3
  },
  medium: {
    noteCount: 200,
    tagsPerNote: 4,
    linksPerNote: 3,
    avgWordCount: 300,
    actionableDensity: 0.25
  },
  large: {
    noteCount: 1000,
    tagsPerNote: 5,
    linksPerNote: 4,
    avgWordCount: 400,
    actionableDensity: 0.2
  },
  xlarge: {
    noteCount: 5000,
    tagsPerNote: 5,
    linksPerNote: 5,
    avgWordCount: 500,
    actionableDensity: 0.15
  }
};
