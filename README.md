# mcp-travel-advisories

US Travel Advisories MCP.

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1394+ live data sources.

## Tools

| Tool | Description |
|------|-------------|
| `advisories` | List current US State Department travel advisories. Filter by country keyword and/or minimum threat level (1=normal precautions, 2=increased caution, 3=reconsider travel, 4=do not travel). Sorted by threat level (highest first). |
| `advisory` | Get the current US travel advisory for a single country. Pass the country NAME (recommended), e.g. "Japan", "Mexico". A State Department 2-letter country code also works (note: these are NOT ISO codes — e.g. Japan is "JA"). |

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "travel-advisories": {
      "url": "https://gateway.pipeworx.io/travel-advisories/mcp"
    }
  }
}
```

Or connect to the full Pipeworx gateway for access to all 1394+ data sources:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English:

```
ask_pipeworx({ question: "your question about Travel Advisories data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
