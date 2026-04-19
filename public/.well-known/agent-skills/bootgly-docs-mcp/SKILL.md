---
name: bootgly-docs-mcp
description: Search and fetch Bootgly documentation pages through the MCP endpoint.
---

# Bootgly Docs MCP Skill

## Purpose

Use this skill to search and retrieve documentation pages from Bootgly Docs through its MCP server.

MCP endpoint:

- https://docs.bootgly.com/mcp

## Endpoints

- MCP endpoint: `https://docs.bootgly.com/mcp`
- Discovery index: `https://docs.bootgly.com/.well-known/agent-skills/index.json`

## Available Tools

The server currently exposes two tools:

### search_bootgly

Searches Bootgly documentation pages by keyword.

- Required input:
	- `query` (string)

Best for:

- Finding relevant docs pages for a topic.
- Locating modules, classes, or architecture concepts quickly.

### get_page_bootgly

Fetches the full markdown content of a specific documentation page.

- Required input:
	- `path` (string)

Best for:

- Reading a known page in full.
- Supplying exact docs context to an assistant.

## Recommended Flow

1. Call `search_bootgly` with a natural-language query.
2. Pick the best match from the results.
3. Call `get_page_bootgly` with the returned page path.

## Example Inputs

`search_bootgly`:

- `{"query":"HTTP server middleware"}`
- `{"query":"I2P architecture"}`

`get_page_bootgly`:

- `{"path":"manual/Bootgly/about/what/overview"}`

## Typical Tasks

- Find pages by topic, keyword, or concept.
- Fetch the full markdown content of a specific page.
- Navigate Bootgly framework guides and references.

## Tooling Expectations

If your MCP client supports dynamic tool discovery, prefer the tools exposed by the server. Typical operations include:

- Search docs pages by query.
- Fetch a page by path.

## Scope

This skill covers public documentation content only.
