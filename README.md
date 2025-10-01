# Thread-Stack MCP

MCP server for intelligent interaction with your [thread-stack](https://github.com/nlsherman-24861/thread-stack) personal knowledge management system.

**Respects the gradient of thought: Scratchpad → Inbox → Notes**

## Philosophy

Thread-stack is built on a simple truth: **thoughts exist on a spectrum from fleeting to permanent**, and your tools should match that reality.

This MCP respects that philosophy by providing zone-aware tools where **friction matches permanence**:

```
┌─────────────┬──────────────┬─────────────┐
│ Scratchpad  │   Inbox      │   Notes     │
├─────────────┼──────────────┼─────────────┤
│ Fleeting    │  Captured    │ Permanent   │
│ Zero        │  Minimal     │ Full        │
│ structure   │  structure   │ structure   │
└─────────────┴──────────────┴─────────────┘
```

Plus: **Daily** (journal) and **Maps** (curated entry points)

### Why This Matters

Most PKM tools force you to decide "where does this go?" before capturing a thought. That creates friction and decision paralysis.

Thread-stack + this MCP let you:
- **Capture instantly** to scratchpad (zero decisions)
- **Process later** by promoting to inbox
- **Enrich when ready** by moving to permanent notes

The right structure emerges naturally as thoughts mature.

## Installation

### 1. Prerequisites

- Node.js 18+
- Your [thread-stack](https://github.com/nlsherman-24861/thread-stack) directory
- Claude Desktop

### 2. Install

```bash
cd thread-stack-mcp
npm install
npm run build
```

### 3. Configure Claude Desktop

Edit claude_desktop_config.json:

```json
{
  "mcpServers": {
    "thread-stack": {
      "command": "node",
      "args": ["/absolute/path/to/thread-stack-mcp/dist/index.js"],
      "env": {
        "THREAD_STACK_PATH": "/absolute/path/to/your/thread-stack"
      }
    }
  }
}
```

### 4. Restart Claude Desktop

The tools will be available immediately.

## Tool Categories

### 🧠 Scratchpad (Zero Friction)

**Most common operation.** Write anything, delete everything, no structure required.

- `capture_to_scratchpad` - Append thought with timestamp
- `read_scratchpad` - See what you've captured
- `clear_scratchpad` - Fresh start

### 📥 Inbox (Minimal Structure)

For thoughts worth keeping as discrete items. Title + content, that's it.

- `create_inbox_item` - Create capture with just title and content
- `list_inbox_items` - See what needs processing
- `promote_to_inbox` - Extract from scratchpad and give it structure

### 📝 Notes (Full Structure)

Permanent knowledge base. Fully enriched with tags, links, context.

- `create_note` - Create permanent note with tags and links
- `append_to_note` - Add to existing note non-destructively
- `promote_to_notes` - Move inbox item to permanent knowledge

### 📅 Daily (Journal)

Date-based journal entries. Timestamped, casual, searchable.

- `create_daily_entry` - Add timestamped entry to today
- `get_today` - Read today's journal

### 🔍 Search (Zone-Aware)

Search respects the gradient. Defaults to permanent knowledge only.

- `search_knowledge` - Search notes + daily (default), optionally include inbox
- `get_content` - Read any file by path
- `list_notes_by_tag` - Filter by tags
- `get_actionable_items` - Extract todos/actionables
- `get_all_tags` - Tag usage statistics
- `find_related_notes` - Discover connections
- `query_note_history` - See how thinking evolved (git history)

## Common Use Cases

### Stream-of-Consciousness Capture → Quick Punch List

**Scenario:** You're voice-dumping or rapid-fire texting "I need to remember to..." items throughout the day. Later you want to see what you committed to.

**Natural language:**
> "What did I say I needed to do today?"

**Claude automatically:**
1. Uses `search_knowledge` with zones: ['inbox', 'scratchpad', 'daily']
2. Uses `get_actionable_items` to extract todos
3. Filters to today's date
4. Returns punch list grouped by zone

**Or more specifically:**
> "Show me what I captured in my inbox today"

Claude uses `list_inbox_items` filtered by creation date.

**Or even:**
> "What's on my plate this week?"

Claude:
1. `get_actionable_items` with status "open"
2. `search_knowledge` in inbox + daily from last 7 days
3. Synthesizes into categorized list


## Example Workflows

### Workflow 1: Morning Brain Dump → Structured Note

**In Claude Desktop:**

> "I just had a thought about improving the OAuth flow. Capture it."

Claude uses `capture_to_scratchpad`

Later that day:

> "Review my scratchpad and promote the OAuth idea to inbox."

Claude uses `read_scratchpad` then `promote_to_inbox`

When ready:

> "That OAuth idea is solid. Create a proper note for it with tags oauth, security."

Claude uses `promote_to_notes` with full structure.

**Result:** Fleeting thought → Captured idea → Permanent knowledge

---

### Workflow 2: Direct Note Creation

Sometimes you have a fully-formed thought. No need for scratchpad.

> "Create a note documenting the thread-stack MCP architecture. Tag it with mcp, architecture, design."

Claude uses `create_note` directly - skips scratchpad and inbox entirely.

**Philosophy in action:** Friction matches permanence.

---

### Workflow 3: Daily Journaling

> "Add to my daily: Finished the zone-aware MCP redesign. Really happy with how it respects the philosophy now."

Claude uses `create_daily_entry` with timestamp.

---

### Workflow 4: Finding Knowledge

> "What have I written about MCP servers?"

Claude uses `search_knowledge` (searches notes + daily, NOT scratchpad).

> "Show me all my open high-priority actionables"

Claude uses `get_actionable_items` with filters.

## Natural Language Examples

These all work naturally in Claude Desktop:

- ✅ "Capture this thought: [idea]"
- ✅ "What's in my scratchpad?"
- ✅ "What did I say I needed to do today?" (searches inbox + scratchpad + daily)
- ✅ "Show me my inbox" 
- ✅ "Make a note about [subject] with tags x, y, z"
- ✅ "Add to my daily: [journal entry]"
- ✅ "Find notes about [topic]"
- ✅ "What's on my plate this week?" (open actionables from last 7 days)
- ✅ "Process my inbox"
- ✅ "Promote that scratchpad idea to a real note"

## Zone Behavior Reference

### Default Search Zones

When you use `search_knowledge` without specifying zones:

- ✅ **Searches:** `notes/`, `daily/` (permanent knowledge)
- ❌ **Excludes:** `scratchpad`, `inbox/` (transient)
- 💡 **Override:** Explicitly ask to include inbox/scratchpad

### Why Scratchpad Is Special

**Never searched by default.** Too ephemeral, too much noise.

To see scratchpad content, explicitly use `read_scratchpad`.

### Multi-Device Sync

Scratchpad is intentionally a single, shared file (`scratchpad.md`) - a canonical "piece of paper" for zero-friction capture. This simplicity is core to the philosophy, but it creates a practical question: **how do multiple devices stay in sync?**

**The answer: thread-stack doesn't solve this.** Sync is an implementation concern, not a philosophical one.

Thread-stack uses git for version control, which handles most zones gracefully (discrete files, structured edits). But scratchpad is append-heavy and transient - exactly the pattern that causes git merge conflicts.

**That's okay.** Here's why:

- **Context-switching, not collaboration**: You're one human switching between devices sequentially (mobile → desktop → mobile). You're not doing real-time collaborative editing.

- **Sync helpers are external**: Tools that sync scratchpad before/after capture (git pull/push, smart merge on conflict) are *quality-of-life enhancements*, not core requirements. They live outside thread-stack proper.

- **Conflicts are low-stakes**: Scratchpad is ephemeral by design. If a merge duplicates some timestamps or reorders a few entries, it doesn't matter - you're processing and clearing it soon anyway.

**Implementation strategies** (for your sync tooling, not thread-stack):

- Auto-sync helpers that pull before capture, push after
- "Best-effort" merge on conflict (append both versions, don't try to be clever)
- Manual sync commands when switching devices
- Background daemons for active contexts (optional complexity)

The key insight: **friction matches permanence** applies to sync too. Scratchpad tolerates messy sync because it's designed to be messy. Notes/inbox require cleaner merges because they're more structured. Each zone's sync needs match its permanence level.

### Promotion Path

```
scratchpad.md
    ↓ promote_to_inbox (add title)
inbox/quick/1234-idea.md
    ↓ promote_to_notes (add tags, links)
notes/2025-10-01-idea.md
```

But you can also create directly at any level.

## Philosophy Deep Dive

### Friction Matches Permanence

| Zone | Friction | When to Use |
|------|----------|-------------|
| **Scratchpad** | Zero | Quick capture, working through problems, temporary lists |
| **Inbox** | Title only | "This deserves to exist as a thing" |
| **Notes** | Full structure | Permanent knowledge, fully formed thoughts |
| **Daily** | Timestamp only | Journal entries, reflections, progress logs |

### The Gradient in Practice

Not every thought deserves the same treatment. Most thoughts start fleeting and either:
- Get deleted (scratchpad → trash)
- Mature into knowledge (scratchpad → inbox → notes)
- Get captured directly at the right level

The MCP supports all three paths.

## Integration with Other MCPs

### With github-issue-creator-mcp

> "Find notes about the new auth feature and create a GitHub issue"

Claude orchestrates:
1. `search_knowledge` with query "auth feature"
2. `get_content` to read full notes
3. `parse_thought` (from issue-creator-mcp)
4. `create_issue` (from issue-creator-mcp)
5. `append_to_note` to add issue reference back

**Result:** Bidirectional sync between notes and GitHub.

## Troubleshooting

### Error: "THREAD_STACK_PATH environment variable not set"

Make sure your `claude_desktop_config.json` has the path in the `env` section.

### Search not finding notes

Check which zones you're searching. Default is `notes` and `daily` only.

> "Search my notes and inbox for [query]"

Claude will include inbox in the search.

### Tools not appearing in Claude Desktop

1. Verify config file is valid JSON
2. Restart Claude Desktop completely
3. Check path to `dist/index.js` is absolute

## Roadmap

### Phase 1: Read-Only Tools ✅ COMPLETE
- [x] Zone-aware scanning
- [x] Search with zone filtering
- [x] Tag extraction and analysis
- [x] Actionable item detection

### Phase 2: Writing Tools ✅ COMPLETE
- [x] Scratchpad capture
- [x] Inbox creation
- [x] Note creation with full structure
- [x] Daily journal entries
- [x] Promotion between zones

### Phase 3: Intelligence (Future)
- [ ] Semantic search with embeddings
- [ ] Auto-suggest tags based on content
- [ ] Auto-link related notes
- [ ] Weekly review summaries

## License

MIT

## Related Projects

- [thread-stack](https://github.com/nlsherman-24861/thread-stack) - The PKM system
- [github-issue-creator-mcp](../github-issue-creator-mcp) - Convert thoughts to issues
- [claude-actions-setup](https://github.com/nlsherman-24861/claude-actions-setup) - GitHub automation

---

**Start simple. Capture thoughts. Let structure emerge.**
