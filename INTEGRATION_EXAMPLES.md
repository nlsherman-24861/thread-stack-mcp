# Integration Examples

Real-world examples of how thread-stack-mcp orchestrates with other MCP servers.

## Prerequisites

All three MCP servers configured in `~/.claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "github-credential-vault": {
      "command": "node",
      "args": ["C:/Users/n/github-credential-vault-mcp/index.js"]
    },
    "github-issue-creator": {
      "command": "node",
      "args": ["C:/Users/n/github-issue-creator-mcp/index.js"],
      "env": {
        "GITHUB_TOKEN": "ghp_..."
      }
    },
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

## Example 1: Note → Issue

**You say:**
> "Check my thread-stack for notes about the new xyz feature for thread-weaver, and create an issue to move out on that"

**What Claude does automatically:**

```
1. thread-stack-mcp.search_notes({
     query: "xyz feature thread-weaver",
     tags: ["idea", "feature"]
   })

   Returns: notes/2025-01-20-thread-weaver-xyz-feature.md

2. thread-stack-mcp.get_note({
     path: "notes/2025-01-20-thread-weaver-xyz-feature.md"
   })

   Returns full note content

3. github-issue-creator-mcp.parse_thought({
     raw_text: "[note content]"
   })

   Returns structured: {problem, solution, acceptance_criteria}

4. github-credential-vault-mcp.authenticate_github({
     scope: "repo"
   })

   Returns: OAuth token (or uses stored)

5. github-issue-creator-mcp.create_issue({
     owner: "nlsherman-24861",
     repo: "thread-weaver",
     title: "Implement XYZ feature",
     body: "[structured markdown]",
     labels: ["enhancement"]
   })

   Returns: Issue #25 created

6. thread-stack-mcp.link_note_to_issue({
     note_path: "notes/2025-01-20-thread-weaver-xyz-feature.md",
     issue_ref: "thread-weaver#25",
     relationship: "implements"
   })

   Updates note with: "📋 Tracked in: thread-weaver#25"
```

**Result:** Issue created and note updated, all from one natural language request.

---

## Example 2: Multiple Notes → Multiple Issues

**You say:**
> "Find all my unimplemented ideas for thread-stack and create issues for them"

**What Claude does:**

```
1. thread-stack-mcp.search_notes({
     query: "thread-stack",
     tags: ["idea", "feature"]
   })

2. For each note without existing issue link:

   a. thread-stack-mcp.get_note()
   b. github-issue-creator-mcp.parse_thought()
   c. github-credential-vault-mcp.authenticate_github()
   d. github-issue-creator-mcp.create_issue()
   e. thread-stack-mcp.link_note_to_issue()
```

**Result:** Batch issue creation with automatic tracking.

---

## Example 3: Daily Standup → GitHub

**You say:**
> "Summarize what I worked on yesterday and create a standup issue in thread-stack"

**What Claude does:**

```
1. thread-stack-mcp.summarize_recent_activity({
     days: 1
   })

   Returns: {
     notes_created: 3,
     actionables_completed: 5,
     highlights: [...]
   }

2. thread-stack-mcp.get_actionable_items({
     status: "done",
     since: "yesterday"
   })

   Returns detailed list

3. Format as structured summary

4. github-credential-vault-mcp.authenticate_github()

5. github-issue-creator-mcp.create_issue({
     owner: "nlsherman-24861",
     repo: "thread-stack",
     title: "Daily Standup - 2025-01-20",
     body: "[formatted summary]",
     labels: ["standup"]
   })

6. thread-stack-mcp.create_note({
     title: "Standup 2025-01-20",
     content: "[same summary]",
     tags: ["standup", "reflection"]
   })
```

**Result:** Standup tracked both in GitHub and thread-stack.

---

## Example 4: Issue → Note (Reverse Flow)

**You say:**
> "Document the solution from thread-weaver#15 in my notes"

**What Claude does:**

```
1. github-credential-vault-mcp.authenticate_github()

2. GitHub API call to fetch issue #15 details
   (via github-issue-creator-mcp internal helper)

3. thread-stack-mcp.create_note({
     title: "Dark Mode Implementation - thread-weaver#15",
     content: "[issue body + comments + PR references]",
     tags: ["documentation", "thread-weaver", "implementation"]
   })

4. thread-stack-mcp.link_note_to_issue({
     note_path: "[created note]",
     issue_ref: "thread-weaver#15",
     relationship: "documents"
   })
```

**Result:** GitHub knowledge captured in PKM system.

---

## Example 5: Cross-Reference Updates

**You say:**
> "The PR for issue #15 got merged - update my notes"

**What Claude does:**

```
1. thread-stack-mcp.search_notes({
     query: "thread-weaver#15"
   })

   Finds notes linked to this issue

2. github-credential-vault-mcp.authenticate_github()

3. GitHub API: Get PR status and merge commit

4. thread-stack-mcp.append_to_note({
     path: "[matching note]",
     content: "✅ Merged in PR #16 (commit abc123)",
     section: "Status"
   })

5. thread-stack-mcp.mark_actionable_done({
     note_path: "[note]",
     item_text: "Implement dark mode",
     resolution: "Completed in thread-weaver#15"
   })
```

**Result:** Notes stay in sync with GitHub state.

---

## Example 6: Research → Plan → Execute

**You say:**
> "I want to add OAuth support to the credential vault. Help me plan this out."

**What Claude does:**

```
1. thread-stack-mcp.search_notes({
     query: "OAuth authentication credential vault",
     tags: ["research", "idea"]
   })

   Check if you've already researched this

2. If no existing notes, Claude helps you discuss and refine

3. thread-stack-mcp.create_note({
     title: "OAuth Support for Credential Vault",
     content: "[conversation summary with sections:
                Problem, Solution, Acceptance Criteria,
                Technical Notes, References]",
     tags: ["idea", "actionable", "oauth", "credential-vault"]
   })

4. github-issue-creator-mcp.parse_thought({
     raw_text: "[note content]"
   })

5. github-issue-creator-mcp.preview_issue()

   Claude shows you: "Here's what the issue would look like"

6. You: "Looks good, create it"

7. github-credential-vault-mcp.authenticate_github()

8. github-issue-creator-mcp.create_issue({
     owner: "nlsherman-24861",
     repo: "github-credential-vault-mcp",
     title: "Add OAuth support",
     body: "[from parsed note]",
     labels: ["enhancement"]
   })

9. thread-stack-mcp.link_note_to_issue()

10. Add claude-task label (manually or via API)

11. Claude Actions workflow picks it up and starts implementing
```

**Result:** Full cycle from idea → note → issue → automation → implementation.

---

## Example 7: Weekly Review

**You say:**
> "Give me a weekly review - what did I work on, what's open, what should I focus on next?"

**What Claude does:**

```
1. thread-stack-mcp.summarize_recent_activity({
     days: 7,
     include_content: true
   })

2. thread-stack-mcp.get_actionable_items({
     status: "open",
     priority: "high"
   })

3. thread-stack-mcp.analyze_tag_usage()

   Shows trending topics this week

4. thread-stack-mcp.search_notes({
     tags: ["decision"],
     date_from: "7 days ago"
   })

   Key decisions made this week

5. Format as structured review with sections:
   - 📊 Week in Numbers
   - ✅ Completed Work
   - 🚧 In Progress
   - 🔥 High Priority Items
   - 🧠 Key Decisions
   - 📈 Trending Topics
   - 💡 Recommendations

6. thread-stack-mcp.create_note({
     title: "Weekly Review - Week of 2025-01-20",
     content: "[formatted review]",
     tags: ["review", "reflection", "weekly"]
   })
```

**Result:** Comprehensive review auto-generated from your notes.

---

## Example 8: Context Switching

**You say:**
> "I need to switch back to the thread-weaver project - what was I working on there?"

**What Claude does:**

```
1. thread-stack-mcp.search_notes({
     query: "thread-weaver",
     tags: ["actionable", "wip"]
   })

2. thread-stack-mcp.get_actionable_items({
     status: "open",
     project: "thread-weaver"
   })

3. thread-stack-mcp.find_related_notes({
     topic: "thread-weaver",
     depth: 2
   })

4. github-credential-vault-mcp.authenticate_github()

5. GitHub API: List open issues and PRs in thread-weaver

6. Cross-reference GitHub state with notes

7. Present context summary:
   - Last worked on: [date]
   - Open actionables: [list]
   - Related GitHub items: [issues/PRs]
   - Recent notes: [relevant notes]
   - Suggested next steps: [based on context]
```

**Result:** Instant context restoration for project switching.

---

## Example 9: Automated Documentation

**You say:**
> "The MCP servers are all working now - create a summary note documenting the whole setup"

**What Claude does:**

```
1. thread-stack-mcp.search_notes({
     tags: ["mcp", "setup", "automation"]
   })

   Gather all related notes

2. thread-stack-mcp.get_note() for each relevant note

3. Synthesize into comprehensive documentation

4. thread-stack-mcp.create_note({
     title: "MCP Server Ecosystem - Complete Setup",
     content: "[sections:
               - Overview
               - Installed Servers
               - Integration Points
               - Example Workflows
               - Configuration
               - Troubleshooting
               - Future Enhancements]",
     tags: ["documentation", "mcp", "reference"]
   })

5. thread-stack-mcp.link_notes() to connect with original notes

6. Optional: Create GitHub wiki page or README
   github-credential-vault-mcp.authenticate_github()
   GitHub API: Update wiki
```

**Result:** Living documentation auto-generated from your work.

---

## Natural Language Patterns

These all work naturally:

- ✅ "Check my notes about X and create an issue"
- ✅ "Find all my ideas for project Y and make issues for the good ones"
- ✅ "What was I thinking about Z last week?"
- ✅ "Update my notes with the status of issue #N"
- ✅ "Summarize my progress on project X"
- ✅ "Create a note documenting this conversation"
- ✅ "Find notes related to [topic] and show me what's actionable"
- ✅ "Convert my brainstorm from [date] into structured issues"
- ✅ "What should I work on next based on my notes and open issues?"

## Tool Composition Patterns

### Pattern 1: Search → Extract → Transform → Create
```
search_notes → get_note → parse_thought → create_issue
```

### Pattern 2: Query → Analyze → Document
```
summarize_recent_activity → create_note → link_notes
```

### Pattern 3: Cross-System Sync
```
GitHub API → get_note → append_to_note → mark_actionable_done
```

### Pattern 4: Batch Operations
```
list_notes_by_tag → for_each(parse_thought → create_issue → link_note_to_issue)
```

### Pattern 5: Context Restoration
```
search_notes + get_actionable_items + GitHub API → synthesize context
```

## Benefits

1. **Zero Context Switching** - Stay in Claude Desktop, let the tools orchestrate
2. **Bidirectional Sync** - Notes ↔ GitHub always in sync
3. **Knowledge Capture** - Conversations → Notes → Issues → Implementation
4. **Automated Workflows** - Multi-step operations from single requests
5. **Living Documentation** - Your notes become your project memory
6. **Reduced Friction** - No manual copying between systems
7. **Discoverability** - Semantic search across all your knowledge
8. **Auditability** - Git history tracks all changes

## Next Steps

1. ✅ github-issue-creator-mcp (done, needs testing)
2. ✅ github-credential-vault-mcp (in progress)
3. 🚧 thread-stack-mcp (designed, needs Phase 1 implementation)
4. 🔜 Test integration scenarios end-to-end
5. 🔜 Document edge cases and error handling
6. 🔜 Build example thread-stack fixture for testing
