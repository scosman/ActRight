---
status: complete
---

# ActRight Discover (`/act discover`)

Add the discover phase — mentioned in the v1 spec as "designed-for, not v1" — to ActRight. Invoked as `/act discover`.

It's hard because a codebase could be very large. To do it well we want to do it in steps, and make heavy use of subagents, the manager pattern, and planning docs.

## Planning Docs

Create a new folder called `.act_right/discovery`, and add `.act_right` to `.gitignore`. We'll use this to save progress/planning docs.

## Process

1) **Discovery Agent**: a subtask that discovers all the pages in the app, and designs a plan to split them up.
   - Main agent dispatches this, but get it to load any instructions from a reference file in our SKILL.md (don't have the main agent regurgitate instructions).
   - If `.act_right/discovery` already exists, ask user if they want to continue or do a new discovery. If new, rename `.act_right/discovery/` to `.act_right/discovery_1` or similar and create fresh dir.
   - Creates a blank `.act_right/discovery/open_questions.md`. Just a title.
   - Creates a `.act_right/discovery/plan.md`:
     - Use markdown checkbox style ` - [ ]` so we know what's done and what's not.
     - Iterate the codebase to discover all app pages and components.
       - It populates this by navigating the code base, not the UI/browser with MCP. Faster, more intent, no missing data.
     - Divide into groups that should be tackled together by a single agent (nested bullets). Note: it's absolutely fine to have a single page/component in a group.
       - Example: maybe pair the "create_project" and "edit_project" screens, but sometimes pages are so similar that it's better for an agent to handle all in 1 context.
       - Example: maybe pair a component that's used on a page, and by testing the page we'll get good component coverage.
     - Important to not miss any pages or components. When done the plan, do some file-searching to confirm it's comprehensive.

2) **Implementation**
   - The manager loops over all groups in the plan (top level bullets), and dispatches sub-agents to implement them. Manager details:
     - Can allow multiple parallel implementation agents.
     - Dispatches them with a link to a markdown guide on what their role is.
     - Message launched with: exactly which part of the plan to work on.
   - Implementation agent:
     - Goal: write great UI tests.
     - Discovery: can use MCP + browser to look at page if needed, but typically should be based on code, not UI.
     - Write tests: write tests for all flows/options/functions of the group it's assigned.
     - Note: goal is UI testing, not API testing.
     - Don't fix bugs, only make tests.
     - Likely load the instructions for our "new" task? Very similar.
     - If it needs to ask a user a question, add it to `.act_right/discovery/open_questions.md` then continue with what it can do without input. These should have checkbox format. Note: these should also have information for a later implementation agent to pick up and finish this task (assume a separate agent will act on this so it's both the question, and what to do with the result).
     - Should update the checkboxes in the plan when done, but importantly: can only add the "x" to check it off — no other edits, and only edits sections it was assigned.
     - Return a very short summary of what it did: "Wrote N tests. Wrote N open questions."

3) **Close open questions**
   - If `.act_right/discovery/open_questions.md` has questions when all agents are done, ask the user to answer in chat, then dispatch implementation agents to continue work on the blocked components.
   - Repeat if new open questions were added.

4) **Results Summary**
   - Run all tests.
   - How many tests were written.
   - Any failing or bugs found?
