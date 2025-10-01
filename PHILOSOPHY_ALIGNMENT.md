# Thread-Stack MCP Philosophy Alignment

## Critical Realignment Needed

After reviewing the thread-stack README and philosophy, our current MCP implementation misses **core concepts**:

### What We Got Wrong

1. **Assumed only `notes/` directory** - Ignored the gradient of thought
2. **No scratchpad support** - The MOST important capture mechanism
3. **No inbox awareness** - The intermediate step between fleeting and permanent
4. **No daily/ support** - Date-based journaling is part of the system
5. **No maps/ awareness** - Curated entry points exist

### Thread-Stack's Core Philosophy

```
Scratchpad (scratch.md) → Fleeting
  ↓
Inbox (inbox/quick/, inbox/voice/) → Captured
  ↓
Notes (notes/) → Permanent
```

**Plus:**
- `daily/` - Date-based journal entries
- `maps/` - Curated entry points to knowledge base

## The Gradient of Permanence

### Scratchpad
- **Purpose**: Thought incubator, zero friction
- **File**: `scratch.md` (single file, constantly rewritten)
- **Behavior**: Write freely, delete constantly
- **No structure required**

### Inbox
- **Purpose**: Discrete captures worth keeping
- **Locations**:
  - `inbox/quick/` - Text captures
  - `inbox/voice/` - Voice memo transcripts
- **Behavior**: Minimal structure, create file with title
- **Later review**: Move to notes/ or delete

### Notes
- **Purpose**: Permanent knowledge base
- **Location**: `notes/` (flat structure)
- **Behavior**: Enriched with tags, links
- **Fully integrated**: Part of searchable knowledge

### Daily
- **Purpose**: Date-based journaling
- **Location**: `daily/`
- **Behavior**: One file per day
- **Format**: Timestamped entries, casual

### Maps
- **Purpose**: Curated entry points
- **Location**: `maps/`
- **Behavior**: MOC (Maps of Content)
- **Optional**: Not everyone uses these

## Required MCP Changes

### 1. Scanner Must Understand All Zones

```typescript
export interface ThreadStackStructure {
  basePath: string;
  scratchpad: string;        // scratch.md
  inbox: {
    quick: string;           // inbox/quick/
    voice: string;           // inbox/voice/
  };
  notes: string;             // notes/
  daily: string;             // daily/
  maps: string;              // maps/
}
```

### 2. Tools Must Respect the Gradient

**capture_thought** (NEW)
- Append to `scratch.md` with timestamp
- Zero friction, no structure
- Most common operation

**promote_to_inbox** (NEW)
- Move scratchpad content to `inbox/quick/`
- Create discrete file
- Minimal structure (just title)

**promote_to_notes** (NEW)
- Move inbox item to `notes/`
- Add tags and links
- Full permanent status

**create_daily_entry** (NEW)
- Add timestamped entry to today's daily file
- Auto-create if doesn't exist

### 3. Search Must Be Zone-Aware

```typescript
interface SearchOptions {
  query?: string;
  tags?: string[];
  zones?: ('scratchpad' | 'inbox' | 'notes' | 'daily' | 'maps')[];
  dateFrom?: Date;
  dateTo?: Date;
}
```

**Default behavior:**
- Search `notes/` and `daily/` (permanent knowledge)
- Optionally include `inbox/` (in-progress)
- **Never** search scratchpad (too ephemeral)

**Explicit scratchpad search:**
- Only when user asks "what's in my scratchpad?"
- Single file, easy to read whole thing

### 4. Tool Naming Reflects Philosophy

**Current naming:**
- ❌ `search_notes` - Too specific
- ❌ `get_note` - Implies only notes/

**Better naming:**
- ✅ `search_knowledge` - Across zones
- ✅ `get_content` - Zone-agnostic
- ✅ `capture` - Scratchpad first
- ✅ `promote` - Move up gradient
- ✅ `archive` - Move down gradient (demote)

## Revised Tool Set

### Capture Tools (Gradient-Aware)

1. **capture_to_scratchpad**
   - Append to scratch.md
   - Timestamp
   - Zero structure

2. **create_inbox_item**
   - Create file in inbox/quick/
   - Title + content
   - Minimal structure

3. **create_note**
   - Create in notes/
   - Full structure (tags, links)

4. **create_daily_entry**
   - Append to daily/YYYY-MM-DD.md
   - Timestamped

### Promotion Tools (Movement)

5. **promote_to_inbox**
   - Extract from scratchpad → inbox/quick/
   - Add title

6. **promote_to_notes**
   - Move from inbox/ → notes/
   - Enrich with tags/links

7. **demote_to_archive**
   - Move to archive/
   - Still searchable but out of main flow

### Query Tools (Zone-Aware)

8. **search_knowledge**
   - Query across notes/ and daily/
   - Optional: include inbox/
   - Never scratchpad (unless explicit)

9. **read_scratchpad**
   - Get full scratch.md content
   - Simple, no parsing needed

10. **list_inbox_items**
    - Show what needs review
    - Sort by created date
    - "Zero inbox" workflow

11. **get_content**
    - Read any file by path
    - Zone-agnostic

12. **find_related**
    - Based on links/tags
    - Only in notes/ (permanent knowledge)

### Metadata Tools

13. **get_all_tags**
    - From notes/ only (permanent)
    - Exclude scratchpad/inbox (transient)

14. **query_history**
    - Git history for any file
    - Show evolution of thought

### Daily Tools

15. **get_today**
    - Read today's daily entry
    - Quick check-in

16. **summarize_week**
    - Aggregate daily/ entries
    - Weekly review support

## Workflow Examples (Corrected)

### Morning Thought Capture

**User:** "Just had an idea about OAuth in the credential vault"

**Claude:**
1. Uses `capture_to_scratchpad`
2. Appends to scratch.md with timestamp
3. Confirms: "Captured to scratchpad"

**No decision paralysis.** Just write.

### Processing Inbox

**User:** "Review my inbox"

**Claude:**
1. Uses `list_inbox_items`
2. Shows: "You have 3 items in inbox/quick/"
3. For each:
   - Shows preview
   - Asks: "Promote to notes, keep in inbox, or delete?"

### Creating Permanent Knowledge

**User:** "Create a note about the MCP architecture we discussed"

**Claude:**
1. Uses `create_note`
2. Adds to notes/ with:
   - Title
   - Content from conversation
   - Tags: #mcp #architecture #design
   - Links: [[thread-stack-mcp]] [[integration]]

### Daily Journaling

**User:** "Add to my daily: Finished MCP alignment, feeling good about it"

**Claude:**
1. Uses `create_daily_entry`
2. Appends to daily/2025-01-20.md:
   ```
   ## 15:30
   Finished MCP alignment, feeling good about it
   ```

### Finding Knowledge

**User:** "What have I written about MCP servers?"

**Claude:**
1. Uses `search_knowledge` with query="MCP servers"
2. Searches:
   - notes/ (permanent knowledge)
   - daily/ (journal entries)
   - Optional: inbox/ (in-progress thoughts)
3. **Does NOT search scratchpad** (ephemeral)

## Configuration Schema

```json
{
  "basePath": "/path/to/thread-stack",
  "structure": {
    "scratchpad": "scratch.md",
    "inbox": {
      "quick": "inbox/quick",
      "voice": "inbox/voice"
    },
    "notes": "notes",
    "daily": "daily",
    "maps": "maps",
    "archive": "archive"
  },
  "defaults": {
    "searchZones": ["notes", "daily"],
    "dateFormat": "YYYY-MM-DD",
    "tagPrefix": "#",
    "linkStyle": "wikilink"
  }
}
```

## Implementation Priority

### Phase 1: Gradient Support (CRITICAL)
- [ ] Recognize all zones (scratchpad, inbox, notes, daily, maps)
- [ ] `capture_to_scratchpad` tool
- [ ] `read_scratchpad` tool
- [ ] `create_daily_entry` tool
- [ ] Zone-aware scanner

### Phase 2: Movement (Workflow)
- [ ] `list_inbox_items` tool
- [ ] `promote_to_inbox` tool
- [ ] `promote_to_notes` tool
- [ ] `create_inbox_item` tool

### Phase 3: Search Refinement
- [ ] Zone filtering in search
- [ ] Exclude scratchpad by default
- [ ] Include/exclude inbox option

### Phase 4: Current Features (Adapted)
- [ ] Rename and adapt existing tools
- [ ] Make zone-aware
- [ ] Respect philosophy

## Key Philosophy Points

1. **Friction matches permanence**
   - Scratchpad: Zero friction
   - Inbox: Minimal structure
   - Notes: Full enrichment

2. **Organization is derived, not imposed**
   - Tags over folders
   - Links over hierarchies
   - Search over browsing

3. **Scratchpad is sacred**
   - Most common operation
   - Never require structure
   - Delete-friendly

4. **Inbox is transitional**
   - Things to process later
   - Not part of permanent knowledge yet
   - "Zero inbox" is a goal, not a requirement

5. **Notes are permanent**
   - Fully enriched
   - Searchable
   - Part of knowledge graph

## Anti-Patterns to Avoid

❌ **Requiring tags on scratchpad captures**
- Violates zero-friction principle

❌ **Treating inbox as permanent**
- Should be reviewed and promoted/deleted

❌ **Searching scratchpad by default**
- Too ephemeral, noise in results

❌ **Complex structure in inbox**
- Defeats "minimal friction" for captures

❌ **Forcing wikilinks or tags**
- Add organically, not required

## Semantic Equivalents

When users say:
- "scratch" / "scratchpad" / "quick thought" → `capture_to_scratchpad`
- "inbox" / "capture this" / "save for later" → `create_inbox_item`
- "note" / "permanent" / "knowledge base" → `create_note`
- "journal" / "today" / "daily" → `create_daily_entry`

## Testing Against Philosophy

Every tool should answer:

1. **Which zone does this operate on?**
   - Scratchpad, inbox, notes, daily, maps?

2. **Does friction match permanence?**
   - Scratchpad = instant
   - Inbox = title + content
   - Notes = full structure

3. **Does it respect the gradient?**
   - Can thought flow naturally between zones?
   - Can I promote/demote easily?

4. **Is it delete-friendly?**
   - Scratchpad should be rewritten constantly
   - Inbox should be processable
   - Notes are more permanent (but still deletable)

## Next Steps

1. **STOP current implementation**
2. **Redesign scanner** to recognize all zones
3. **Implement gradient tools** (capture, promote, demote)
4. **Test with real thread-stack structure**
5. **Update README** with philosophy-aligned examples

---

**The system is the content. Everything else adapts to it.**

This MCP must serve the thread-stack philosophy, not impose its own structure.
