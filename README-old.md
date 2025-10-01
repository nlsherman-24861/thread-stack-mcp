# Thread-Stack MCP

MCP server for intelligent querying and updating of thread-stack PKM notes.

## Overview

This MCP server provides Claude Desktop with direct access to your thread-stack personal knowledge management system. Query notes by tags, content, date ranges, or relationships, and update them programmatically while maintaining the thread-stack structure and conventions.

## Status

🚧 **Draft / Planning Phase** - This is a roadmap and design document.

## Vision

Turn your thread-stack into a queryable, updatable knowledge base that Claude can interact with naturally:

- "Show me all actionable items from the last week"
- "Find notes about the github automation project"
- "Create a new note about this MCP server design"
- "Link this note to issue #15 in thread-weaver"
- "What was I thinking about dark mode implementation?"

## Core Principles

1. **Respect thread-stack conventions** - Follow existing note structure, tagging, and linking patterns
2. **Semantic search** - Not just keyword matching, understand context and relationships
3. **Bidirectional linking** - Track connections between notes, issues, PRs, and external references
4. **Non-destructive updates** - Append/extend rather than overwrite, maintain history
5. **Tag-aware** - Understand #actionable, #idea, #decision, #question, etc.

## Planned Tools

### Querying Tools

#### 1. `search_notes`
Semantic and keyword search across notes.

**Input:**
- `query` (string): Search query (natural language or keywords)
- `tags` (array, optional): Filter by tags (e.g., ["actionable", "idea"])
- `date_from` (string, optional): ISO date string
- `date_to` (string, optional): ISO date string
- `limit` (number, optional): Max results (default: 20)

**Output:**
```json
{
  "results": [
    {
      "file": "notes/2025-01-15-github-automation.md",
      "title": "GitHub Automation Thoughts",
      "excerpt": "...matching content...",
      "tags": ["actionable", "automation"],
      "created": "2025-01-15T10:30:00Z",
      "links": ["notes/2025-01-10-mcp-servers.md"],
      "score": 0.95
    }
  ],
  "total": 15
}
```

#### 2. `get_note`
Retrieve full content of a specific note.

**Input:**
- `path` (string): Relative path to note file

**Output:** Full note content with metadata

#### 3. `list_notes_by_tag`
List all notes with specific tag(s).

**Input:**
- `tags` (array): Tag names (AND or OR logic)
- `match_mode` (string): "any" or "all" (default: "any")
- `sort` (string): "created", "modified", "title" (default: "modified")

**Output:** Array of note summaries

#### 4. `get_actionable_items`
Extract all actionable items across notes.

**Input:**
- `status` (string, optional): "open", "done", "all" (default: "open")
- `priority` (string, optional): "high", "medium", "low"

**Output:**
```json
{
  "items": [
    {
      "source_note": "notes/2025-01-15-github-automation.md",
      "content": "Set up claude-task label in all repos",
      "tags": ["actionable"],
      "context": "...surrounding text...",
      "linked_issue": "thread-stack#8",
      "status": "done",
      "priority": "high"
    }
  ]
}
```

#### 5. `find_related_notes`
Find notes related to a given note or topic.

**Input:**
- `path` (string, optional): Reference note path
- `topic` (string, optional): Topic to find relations for
- `depth` (number, optional): How many link levels to traverse (default: 1)

**Output:** Graph of related notes with relationship types

#### 6. `query_note_history`
View git history for a note (when was it created, major edits, etc.).

**Input:**
- `path` (string): Note file path
- `limit` (number, optional): Max commits to return

**Output:** Array of commits affecting this note

### Updating Tools

#### 7. `create_note`
Create a new note following thread-stack conventions.

**Input:**
- `title` (string): Note title
- `content` (string): Note body (markdown)
- `tags` (array, optional): Initial tags
- `links` (array, optional): Links to other notes
- `date` (string, optional): Custom date (default: today)

**Output:** Created note path and metadata

#### 8. `append_to_note`
Add content to an existing note (non-destructive).

**Input:**
- `path` (string): Note file path
- `content` (string): Content to append
- `section` (string, optional): Section header to append under
- `create_section` (boolean): Create section if doesn't exist

**Output:** Updated note path and preview

#### 9. `add_note_tag`
Add tag(s) to a note.

**Input:**
- `path` (string): Note file path
- `tags` (array): Tags to add

**Output:** Updated tags list

#### 10. `link_notes`
Create bidirectional link between notes.

**Input:**
- `source_path` (string): Source note
- `target_path` (string): Target note
- `relationship` (string, optional): Type of relationship ("related", "implements", "references")

**Output:** Confirmation of link creation

#### 11. `link_note_to_issue`
Associate a note with a GitHub issue/PR.

**Input:**
- `note_path` (string): Note file path
- `issue_ref` (string): Issue reference (e.g., "thread-stack#15", "owner/repo#123")
- `relationship` (string): "tracks", "implements", "documents"

**Output:** Updated note with issue reference

#### 12. `mark_actionable_done`
Mark an actionable item as complete.

**Input:**
- `note_path` (string): Note containing the actionable
- `item_text` (string): Text of the actionable item (for matching)
- `resolution` (string, optional): How it was resolved

**Output:** Updated note with strikethrough or completion marker

### Analysis Tools

#### 13. `analyze_tag_usage`
Get statistics on tag usage across notes.

**Output:**
```json
{
  "tags": [
    {
      "name": "actionable",
      "count": 45,
      "recent_growth": "+5 this week",
      "most_used_with": ["idea", "automation"]
    }
  ]
}
```

#### 14. `get_note_graph`
Generate a graph visualization of note connections.

**Input:**
- `format` (string): "json", "dot", "mermaid" (default: "json")
- `filter_tags` (array, optional): Only include notes with these tags

**Output:** Graph structure in requested format

#### 15. `summarize_recent_activity`
Summarize recent note creation/updates.

**Input:**
- `days` (number): Number of days to look back (default: 7)
- `include_content` (boolean): Include note excerpts

**Output:**
```json
{
  "period": "Last 7 days",
  "notes_created": 5,
  "notes_modified": 12,
  "actionables_added": 8,
  "actionables_completed": 3,
  "most_active_tags": ["automation", "mcp", "github"],
  "highlights": [
    {
      "note": "notes/2025-01-15-github-automation.md",
      "summary": "Documented Claude GitHub Actions setup"
    }
  ]
}
```

## Technical Architecture

### File Structure Detection

The server needs to understand thread-stack's structure:

```
thread-stack/
├── notes/           # Daily notes, project notes
├── tags/            # Tag indices (optional)
├── archive/         # Archived notes
└── .thread-stack    # Config file (if exists)
```

### Note Format Parser

Parse thread-stack markdown conventions:

- **Frontmatter**: YAML metadata (if used)
- **Tags**: Inline `#tag` or frontmatter array
- **Links**: `[[wikilinks]]` or markdown `[links](path.md)`
- **Actionables**: Lines with `#actionable` tag or `- [ ]` checkboxes
- **Timestamps**: ISO dates or natural language dates
- **Code blocks**: Preserve formatting, don't parse as content

### Search Implementation Options

1. **Simple (MVP)**:
   - Grep-based keyword search
   - Tag extraction via regex
   - File metadata from git/fs

2. **Advanced (v2)**:
   - Full-text search with SQLite FTS5
   - Semantic embeddings (local or API)
   - Graph database for relationships (Neo4j, SQLite with graph extension)

3. **Hybrid (Recommended)**:
   - Fast keyword search for exact matches
   - Semantic search for conceptual queries
   - Cached indices for performance
   - Incremental updates on file changes

### Configuration

`.thread-stack-mcp.json` in the thread-stack root:

```json
{
  "version": "0.1.0",
  "note_path": "notes",
  "archive_path": "archive",
  "tag_prefix": "#",
  "link_style": "wikilink",
  "date_format": "YYYY-MM-DD",
  "default_tags": ["idea"],
  "actionable_marker": "#actionable",
  "search": {
    "engine": "hybrid",
    "index_path": ".thread-stack-mcp/index.db",
    "semantic_model": "local"
  }
}
```

## Integration Points

### With github-issue-creator-mcp

**Scenario**: Convert note into GitHub issue

```
You: Take my note about dark mode and create an issue in thread-stack

Claude:
1. Uses thread-stack-mcp.get_note to read the note
2. Uses github-issue-creator-mcp.parse_thought to structure it
3. Uses github-issue-creator-mcp.create_issue to post it
4. Uses thread-stack-mcp.link_note_to_issue to update the original note
```

### With github-credential-vault-mcp

**Scenario**: All GitHub operations use stored credentials

```
You: Search my notes for automation ideas and create issues for them

Claude:
1. Uses github-credential-vault-mcp.authenticate_github (automatic)
2. Uses thread-stack-mcp.search_notes with tags=["idea", "automation"]
3. For each note, uses github-issue-creator-mcp.create_issue
4. Uses thread-stack-mcp.link_note_to_issue to track relationships
```

### With Claude Actions (GitHub Workflows)

**Scenario**: Bidirectional sync

```
GitHub Issue #15 created
→ Claude Actions workflow creates PR #16
→ PR includes commit updating thread-stack note with issue/PR references
→ Note now has: "Tracked in: thread-stack#15, PR: thread-stack#16"
```

## Example Workflows

### Daily Standup Summary

```
You: Summarize what I worked on yesterday

Claude:
1. Uses thread-stack-mcp.summarize_recent_activity (days=1)
2. Uses thread-stack-mcp.get_actionable_items (status="done", last 24h)
3. Formats a natural language summary
```

### Project Planning

```
You: Show me all open actionables related to the MCP servers project

Claude:
1. Uses thread-stack-mcp.search_notes (query="MCP servers")
2. Uses thread-stack-mcp.get_actionable_items (status="open")
3. Filters to notes matching the project
4. Presents sorted by priority
```

### Knowledge Capture

```
You: Document this conversation about thread-stack MCP design

Claude:
1. Uses thread-stack-mcp.create_note
   - Title: "Thread-Stack MCP Design"
   - Content: Structured summary of conversation
   - Tags: ["mcp", "design", "architecture"]
2. Uses thread-stack-mcp.link_notes to connect to related notes
```

### Cross-Reference Maintenance

```
You: Update my automation notes with the new issue I just created

Claude:
1. Uses thread-stack-mcp.search_notes (query="automation")
2. Uses thread-stack-mcp.append_to_note
   - Adds section: "## Related Issues"
   - Appends: "- thread-stack#15: Dark mode implementation"
```

## Roadmap

### Phase 1: Read-Only MVP (Week 1-2)
- [x] Project structure and README
- [ ] Basic file system scanning
- [ ] Simple keyword search (`search_notes`)
- [ ] Note retrieval (`get_note`)
- [ ] Tag listing (`list_notes_by_tag`)
- [ ] Git integration for metadata
- [ ] MCP server scaffolding

### Phase 2: Core Querying (Week 3-4)
- [ ] Actionable item extraction (`get_actionable_items`)
- [ ] Related notes finder (`find_related_notes`)
- [ ] Note history viewer (`query_note_history`)
- [ ] Activity summaries (`summarize_recent_activity`)
- [ ] Basic search indexing for performance

### Phase 3: Writing Capabilities (Week 5-6)
- [ ] Note creation (`create_note`)
- [ ] Content appending (`append_to_note`)
- [ ] Tag management (`add_note_tag`)
- [ ] Note linking (`link_notes`)
- [ ] Git commit automation for changes

### Phase 4: Integration (Week 7-8)
- [ ] Issue/PR linking (`link_note_to_issue`)
- [ ] Actionable completion (`mark_actionable_done`)
- [ ] Integration testing with other MCPs
- [ ] Workflow documentation

### Phase 5: Advanced Features (Future)
- [ ] Semantic search with embeddings
- [ ] Tag usage analytics (`analyze_tag_usage`)
- [ ] Graph visualization (`get_note_graph`)
- [ ] Full-text search index (SQLite FTS5)
- [ ] Real-time file watching for auto-indexing
- [ ] Conflict resolution for concurrent edits

## Technical Decisions

### Language: TypeScript or Python?

**TypeScript (Recommended)**:
- ✅ Matches other MCPs (github-credential-vault-mcp)
- ✅ Excellent file system APIs
- ✅ Easy git integration (isomorphic-git or simple-git)
- ✅ JSON/YAML parsing built-in
- ❌ Embedding models more complex (need to call Python/API)

**Python**:
- ✅ Better ML/embedding library support
- ✅ Easy semantic search (sentence-transformers)
- ✅ Rich markdown parsing (python-markdown)
- ❌ Different stack from other MCPs

**Decision**: Start with TypeScript for consistency, add Python microservice for semantic search if needed later.

### Search Strategy

**Phase 1**: Simple grep + git log
**Phase 2**: SQLite FTS5 for full-text
**Phase 3**: Optional semantic search via API or local model

### Git Integration

Use `simple-git` package to:
- Track note creation/modification dates
- Commit changes automatically
- Query file history
- Detect concurrent modifications

## Security Considerations

- **File Access**: Sandbox to thread-stack directory only
- **Git Commits**: User-configurable commit messages
- **Backup**: Automatic git backup before destructive operations
- **Validation**: Validate note paths to prevent directory traversal

## Development Setup

```bash
# Clone and setup
git clone https://github.com/nlsherman-24861/thread-stack-mcp.git
cd thread-stack-mcp
npm install

# Configure thread-stack path
export THREAD_STACK_PATH="/path/to/your/thread-stack"

# Run in dev mode
npm run dev

# Test with Claude Desktop
npm run build
# Add to claude_desktop_config.json
```

## Configuration for Claude Desktop

Add to `~/.claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "thread-stack": {
      "command": "node",
      "args": ["C:/Users/n/thread-stack-mcp/dist/index.js"],
      "env": {
        "THREAD_STACK_PATH": "C:/Users/n/thread-stack"
      }
    }
  }
}
```

## Testing Strategy

1. **Unit Tests**: Parser, search, git integration
2. **Integration Tests**: Full tool workflows
3. **Fixtures**: Sample thread-stack structure for testing
4. **Manual Testing**: Use with real Claude Desktop

## License

MIT

## Author

nlsherman-24861

---

## Questions for Implementation

- [ ] Should we support multiple thread-stack instances (personal, work, etc.)?
- [ ] How to handle conflicts when notes modified externally while MCP has them open?
- [ ] Should actionable items be tracked in a separate index/database?
- [ ] What's the preferred tag format: `#tag` inline or frontmatter array?
- [ ] Should we auto-commit every change or batch commits?
- [ ] How to handle large note repositories (10k+ notes) - pagination, streaming?

## Notes for Future

- Consider plugin architecture for custom note parsers
- Think about collaborative scenarios (shared thread-stack repos)
- Explore integration with Obsidian, Logseq, or other PKM tools
- Build web UI for graph visualization?
