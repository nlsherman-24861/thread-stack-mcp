#!/usr/bin/env node

/**
 * Thread-Stack MCP Server v2 - Zone-Aware
 *
 * Respects the gradient of thought: Scratchpad → Inbox → Notes
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool
} from '@modelcontextprotocol/sdk/types.js';

import { ZoneScanner, StreamingSearchOptions, StreamingSearchBatch } from './scanner.js';
import { NoteParser } from './parser.js';
import { ContentWriter } from './writer.js';
import { GitIntegration } from './git.js';
import { Zone } from './zones.js';
import { ActionableItem } from './types.js';

// Get thread-stack path from environment
const THREAD_STACK_PATH = process.env.THREAD_STACK_PATH;

if (!THREAD_STACK_PATH) {
  console.error('Error: THREAD_STACK_PATH environment variable not set');
  console.error('Please set it to the path of your thread-stack directory');
  process.exit(1);
}

// Initialize components
const parser = new NoteParser();
const scanner = new ZoneScanner(THREAD_STACK_PATH, parser);
const indexManager = scanner.getIndexManager();
const writer = new ContentWriter(scanner.getZoneManager(), indexManager);
const git = new GitIntegration(THREAD_STACK_PATH);

// Define tools (organized by zone)
const tools: Tool[] = [
  // === SCRATCHPAD TOOLS (Zero friction) ===
  {
    name: 'capture_to_scratchpad',
    description: 'Capture a thought to scratchpad. Zero friction, no structure required. Most common operation.',
    inputSchema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'The thought to capture'
        }
      },
      required: ['content']
    }
  },
  {
    name: 'read_scratchpad',
    description: 'Read full scratchpad content. Check what\'s been captured recently.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'clear_scratchpad',
    description: 'Clear scratchpad (keep header). Fresh start.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },

  // === INBOX TOOLS (Minimal structure) ===
  {
    name: 'create_inbox_item',
    description: 'Create discrete capture in inbox. Title + content, minimal structure. For thoughts worth keeping.',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Title for the item'
        },
        content: {
          type: 'string',
          description: 'Content of the item'
        },
        subzone: {
          type: 'string',
          enum: ['quick', 'voice'],
          description: 'Inbox subzone (default: quick)'
        }
      },
      required: ['title', 'content']
    }
  },
  {
    name: 'list_inbox_items',
    description: 'List items in inbox for review and processing. Zero inbox workflow.',
    inputSchema: {
      type: 'object',
      properties: {
        subzone: {
          type: 'string',
          enum: ['quick', 'voice'],
          description: 'Filter by subzone (optional)'
        }
      }
    }
  },

  // === NOTES TOOLS (Full structure) ===
  {
    name: 'create_note',
    description: 'Create permanent note. Full structure with tags and links. For well-formed thoughts.',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Note title'
        },
        content: {
          type: 'string',
          description: 'Note content (markdown)'
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags for the note'
        },
        links: {
          type: 'array',
          items: { type: 'string' },
          description: 'Related notes (wikilinks)'
        }
      },
      required: ['title', 'content']
    }
  },
  {
    name: 'append_to_note',
    description: 'Add content to existing note. Non-destructive update.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Note path (e.g., "notes/2025-01-20-example.md")'
        },
        content: {
          type: 'string',
          description: 'Content to append'
        },
        section: {
          type: 'string',
          description: 'Section heading to append under (optional)'
        }
      },
      required: ['path', 'content']
    }
  },

  // === DAILY TOOLS (Journal) ===
  {
    name: 'create_daily_entry',
    description: 'Add timestamped entry to daily journal. Casual, date-based entries.',
    inputSchema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'Entry content'
        },
        date: {
          type: 'string',
          description: 'Date (ISO format, default: today)'
        }
      },
      required: ['content']
    }
  },
  {
    name: 'get_today',
    description: 'Read today\'s daily journal entry.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },

  // === PROMOTION TOOLS (Movement) ===
  {
    name: 'promote_to_inbox',
    description: 'Extract content from scratchpad and create inbox item. Add structure to fleeting thought.',
    inputSchema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'Content to promote'
        },
        title: {
          type: 'string',
          description: 'Title for inbox item'
        },
        subzone: {
          type: 'string',
          enum: ['quick', 'voice'],
          description: 'Target subzone (default: quick)'
        }
      },
      required: ['content', 'title']
    }
  },
  {
    name: 'promote_to_notes',
    description: 'Move inbox item to permanent notes. Enrich with tags and links.',
    inputSchema: {
      type: 'object',
      properties: {
        inbox_path: {
          type: 'string',
          description: 'Path to inbox item'
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags to add'
        },
        links: {
          type: 'array',
          items: { type: 'string' },
          description: 'Links to add'
        },
        additional_content: {
          type: 'string',
          description: 'Additional content to add'
        }
      },
      required: ['inbox_path']
    }
  },

  // === SEARCH TOOLS (Zone-aware) ===
  {
    name: 'search_knowledge',
    description: 'Search across zones. Default: notes and daily (permanent knowledge). Can include inbox.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query'
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by tags'
        },
        zones: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['scratchpad', 'inbox', 'notes', 'daily', 'maps', 'archive']
          },
          description: 'Zones to search (default: notes, daily)'
        },
        date_from: {
          type: 'string',
          description: 'Start date (ISO format)'
        },
        date_to: {
          type: 'string',
          description: 'End date (ISO format)'
        },
        limit: {
          type: 'number',
          description: 'Max results (default: 20)'
        }
      }
    }
  },
  {
    name: 'search_knowledge_streaming',
    description: 'Stream search results as they are found. Returns batches with progress for faster perceived performance.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query'
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by tags'
        },
        zones: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['scratchpad', 'inbox', 'notes', 'daily', 'maps', 'archive']
          },
          description: 'Zones to search (default: notes, daily)'
        },
        date_from: {
          type: 'string',
          description: 'Start date (ISO format)'
        },
        date_to: {
          type: 'string',
          description: 'End date (ISO format)'
        },
        limit: {
          type: 'number',
          description: 'Max results (default: 20)'
        },
        batch_size: {
          type: 'number',
          description: 'Results per batch (default: 10)'
        }
      }
    }
  },
  {
    name: 'get_content',
    description: 'Read any file by path. Zone-agnostic.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'File path relative to thread-stack root'
        }
      },
      required: ['path']
    }
  },
  {
    name: 'list_notes_by_tag',
    description: 'List notes with specific tags. Zone-aware.',
    inputSchema: {
      type: 'object',
      properties: {
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags to filter by'
        },
        match_mode: {
          type: 'string',
          enum: ['any', 'all'],
          description: 'Match any or all tags (default: any)'
        },
        sort_by: {
          type: 'string',
          enum: ['created', 'modified', 'title'],
          description: 'Sort order (default: modified)'
        },
        zones: {
          type: 'array',
          items: { type: 'string' },
          description: 'Zones to search (default: notes, daily)'
        }
      },
      required: ['tags']
    }
  },

  // === ACTIONABLE TOOLS ===
  {
    name: 'get_actionable_items',
    description: 'Extract actionable items across zones. Items marked with #actionable or checkboxes.',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['open', 'done', 'all'],
          description: 'Filter by status (default: open)'
        },
        priority: {
          type: 'string',
          enum: ['high', 'medium', 'low'],
          description: 'Filter by priority'
        },
        zones: {
          type: 'array',
          items: { type: 'string' },
          description: 'Zones to search (default: notes, daily)'
        }
      }
    }
  },

  // === METADATA TOOLS ===
  {
    name: 'get_all_tags',
    description: 'Get all unique tags from permanent knowledge (notes, daily).',
    inputSchema: {
      type: 'object',
      properties: {
        zones: {
          type: 'array',
          items: { type: 'string' },
          description: 'Zones to analyze (default: notes, daily)'
        }
      }
    }
  },
  {
    name: 'find_related_notes',
    description: 'Find notes related to given note. Based on links, tags, similarity.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Reference note path'
        },
        max_results: {
          type: 'number',
          description: 'Max results (default: 5)'
        },
        zones: {
          type: 'array',
          items: { type: 'string' },
          description: 'Zones to search (default: notes, daily)'
        }
      },
      required: ['path']
    }
  },
  {
    name: 'query_note_history',
    description: 'Get git history for a note. See how thinking evolved.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Note path'
        },
        limit: {
          type: 'number',
          description: 'Max commits to return'
        }
      },
      required: ['path']
    }
  }
];

// Create server with progress capabilities
const server = new Server(
  {
    name: 'thread-stack-mcp',
    version: '0.2.0'
  },
  {
    capabilities: {
      tools: {},
      experimental: {
        streaming: true  // Indicate we support streaming-like behavior
      }
    }
  }
);

// Handle list tools request
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (!args) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ error: 'No arguments provided' }, null, 2)
      }],
      isError: true
    };
  }

  try {
    switch (name) {
      // === SCRATCHPAD ===
      case 'capture_to_scratchpad': {
        const result = await writer.captureToScratchpad(args.content as string);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: 'Captured to scratchpad',
              timestamp: result.timestamp
            }, null, 2)
          }]
        };
      }

      case 'read_scratchpad': {
        const content = await writer.readScratchpad();
        return {
          content: [{
            type: 'text',
            text: content
          }]
        };
      }

      case 'clear_scratchpad': {
        await writer.clearScratchpad();
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: 'Scratchpad cleared'
            }, null, 2)
          }]
        };
      }

      // === INBOX ===
      case 'create_inbox_item': {
        const result = await writer.createInboxItem(
          args.title as string,
          args.content as string,
          (args.subzone as 'quick' | 'voice') || 'quick'
        );
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              path: result.path,
              filename: result.filename
            }, null, 2)
          }]
        };
      }

      case 'list_inbox_items': {
        const items = await scanner.listInboxItemsOptimized(args.subzone as 'quick' | 'voice' | undefined);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              total: items.length,
              items: items.map(i => ({
                path: i.path,
                title: i.title,
                created: i.created,
                word_count: i.wordCount
              }))
            }, null, 2)
          }]
        };
      }

      // === NOTES ===
      case 'create_note': {
        const result = await writer.createNote(
          args.title as string,
          args.content as string,
          {
            tags: args.tags as string[] | undefined,
            links: args.links as string[] | undefined
          }
        );
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              path: result.path,
              filename: result.filename
            }, null, 2)
          }]
        };
      }

      case 'append_to_note': {
        await writer.appendToNote(
          args.path as string,
          args.content as string,
          args.section as string | undefined
        );
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: 'Content appended'
            }, null, 2)
          }]
        };
      }

      // === DAILY ===
      case 'create_daily_entry': {
        const result = await writer.createDailyEntry(
          args.content as string,
          args.date ? new Date(args.date as string) : undefined
        );
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              path: result.path,
              filename: result.filename,
              created: result.created
            }, null, 2)
          }]
        };
      }

      case 'get_today': {
        const todayPath = scanner.getZoneManager().getDailyFilename();
        try {
          const note = await scanner.loadNote(todayPath, false);
          return {
            content: [{
              type: 'text',
              text: note.content
            }]
          };
        } catch (error: any) {
          if (error.code === 'ENOENT') {
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  message: 'No entry for today yet',
                  suggestion: 'Use create_daily_entry to add one'
                }, null, 2)
              }]
            };
          }
          throw error;
        }
      }

      // === PROMOTION ===
      case 'promote_to_inbox': {
        const result = await writer.promoteToInbox(
          args.content as string,
          args.title as string,
          (args.subzone as 'quick' | 'voice') || 'quick'
        );
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: 'Promoted to inbox',
              path: result.path,
              filename: result.filename
            }, null, 2)
          }]
        };
      }

      case 'promote_to_notes': {
        const result = await writer.promoteToNotes(
          args.inbox_path as string,
          {
            tags: args.tags as string[] | undefined,
            links: args.links as string[] | undefined,
            additionalContent: args.additional_content as string | undefined
          }
        );
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: 'Promoted to notes',
              old_path: result.oldPath,
              new_path: result.newPath,
              filename: result.filename
            }, null, 2)
          }]
        };
      }

      // === SEARCH ===
      case 'search_knowledge': {
        const zones = args.zones as Zone[] | undefined;
        const results = await scanner.search({
          query: args.query as string | undefined,
          tags: args.tags as string[] | undefined,
          zones,
          dateFrom: args.date_from ? new Date(args.date_from as string) : undefined,
          dateTo: args.date_to ? new Date(args.date_to as string) : undefined,
          limit: (args.limit as number) || 20
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              total: results.length,
              results: results.map(r => ({
                path: r.note.path,
                title: r.note.title,
                excerpt: r.excerpt,
                tags: r.note.tags,
                created: r.note.created,
                modified: r.note.modified,
                score: r.score
              }))
            }, null, 2)
          }]
        };
      }

      case 'search_knowledge_streaming': {
        const zones = args.zones as Zone[] | undefined;
        const streamingOptions: StreamingSearchOptions = {
          query: args.query as string | undefined,
          tags: args.tags as string[] | undefined,
          zones,
          dateFrom: args.date_from ? new Date(args.date_from as string) : undefined,
          dateTo: args.date_to ? new Date(args.date_to as string) : undefined,
          limit: (args.limit as number) || 20,
          batchSize: (args.batch_size as number) || 10
        };

        // Collect all batches and return as multiple content items
        const batches: StreamingSearchBatch[] = [];
        const startTime = Date.now();
        
        for await (const batch of scanner.searchStreaming(streamingOptions)) {
          batches.push(batch);
          
          // Early exit if we have enough results or hit limit
          if (streamingOptions.limit && batch.totalFound >= streamingOptions.limit) {
            break;
          }
        }

        const endTime = Date.now();
        const totalTime = endTime - startTime;
        
        // Create response with multiple content items (one per batch + summary)
        const content = [];
        
        // Add each batch as a separate content item
        for (const batch of batches) {
          content.push({
            type: 'text' as const,
            text: JSON.stringify({
              type: 'batch',
              batch: batch.batch,
              has_more: batch.hasMore,
              total_found: batch.totalFound,
              total_processed: batch.totalProcessed,
              results: batch.results.map(r => ({
                path: r.note.path,
                title: r.note.title,
                excerpt: r.excerpt,
                tags: r.note.tags,
                created: r.note.created,
                modified: r.note.modified,
                score: r.score
              }))
            }, null, 2)
          });
        }
        
        // Add summary as final content item
        const allResults = batches.flatMap(b => b.results);
        content.push({
          type: 'text' as const,
          text: JSON.stringify({
            type: 'summary',
            total_batches: batches.length,
            total_results: allResults.length,
            time_ms: totalTime,
            time_to_first_result_ms: batches.length > 0 ? 'varies' : totalTime,
            streaming_enabled: true
          }, null, 2)
        });

        return { content };
      }

      case 'get_content': {
        const note = await scanner.loadNote(
          scanner.getZoneManager().getBasePath() + '/' + (args.path as string),
          false
        );
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              path: note.path,
              title: note.title,
              content: note.content,
              tags: note.tags,
              links: note.links,
              created: note.created,
              modified: note.modified
            }, null, 2)
          }]
        };
      }

      case 'list_notes_by_tag': {
        const zones = args.zones as Zone[] | undefined;
        const notes = await scanner.listByTagsOptimized(
          args.tags as string[],
          (args.match_mode as 'any' | 'all') || 'any',
          (args.sort_by as 'created' | 'modified' | 'title') || 'modified',
          zones
        );

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              total: notes.length,
              notes: notes.map(n => ({
                path: n.path,
                title: n.title,
                tags: n.tags,
                created: n.created,
                modified: n.modified
              }))
            }, null, 2)
          }]
        };
      }

      // === ACTIONABLES ===
      case 'get_actionable_items': {
        const zones = (args.zones as Zone[]) || scanner.getZoneManager().getDefaultSearchZones();
        let actionables = await scanner.extractActionablesOptimized(zones);

        if (args.status && args.status !== 'all') {
          actionables = actionables.filter(a => a.status === (args.status as string));
        }

        if (args.priority) {
          actionables = actionables.filter(a => a.priority === (args.priority as string));
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              total: actionables.length,
              items: actionables.map(a => ({
                source_note: a.sourceNote,
                content: a.content,
                status: a.status,
                priority: a.priority,
                linked_issue: a.linkedIssue,
                tags: a.tags,
                line: a.line
              }))
            }, null, 2)
          }]
        };
      }

      // === METADATA ===
      case 'get_all_tags': {
        const zones = args.zones as Zone[] | undefined;
        const tagCounts = await scanner.getAllTagsOptimized(zones);
        const sortedTags = Array.from(tagCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([tag, count]) => ({ tag, count }));

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              total_unique_tags: sortedTags.length,
              tags: sortedTags
            }, null, 2)
          }]
        };
      }

      case 'find_related_notes': {
        const zones = args.zones as Zone[] | undefined;
        const maxResults = (args.max_results as number) || 5;
        const related = await scanner.findRelated(args.path as string, maxResults, zones);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              reference_note: args.path,
              total: related.length,
              related: related.map(n => ({
                path: n.path,
                title: n.title,
                tags: n.tags,
                excerpt: parser.generateExcerpt(n.content, 150)
              }))
            }, null, 2)
          }]
        };
      }

      case 'query_note_history': {
        const isRepo = await git.isRepository();
        if (!isRepo) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                error: 'Not a git repository'
              }, null, 2)
            }],
            isError: true
          };
        }

        const history = await git.getFileHistory(args.path as string, args.limit as number | undefined);
        if (!history) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                error: 'No history found'
              }, null, 2)
            }],
            isError: true
          };
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              path: history.path,
              created: history.created,
              last_modified: history.lastModified,
              total_commits: history.totalCommits,
              commits: history.commits.map(c => ({
                hash: c.hash.substring(0, 8),
                author: c.author,
                date: c.date,
                message: c.message
              }))
            }, null, 2)
          }]
        };
      }

      default:
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: 'Unknown tool',
              tool: name
            }, null, 2)
          }],
          isError: true
        };
    }
  } catch (error: any) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          error: error.message || 'Unknown error',
          tool: name
        }, null, 2)
      }],
      isError: true
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Thread-Stack MCP Server v2 (Zone-Aware) running on stdio');
  console.error(`Thread-Stack path: ${THREAD_STACK_PATH}`);
}

main().catch(console.error);
