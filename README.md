# ag-ui-chat-transport

[![CI](https://github.com/djig/ag-ui-chat-transport/actions/workflows/ci.yml/badge.svg)](https://github.com/djig/ag-ui-chat-transport/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**⚠️ Experimental (v0.1)** - Early release for testing and feedback

Bridge Vercel AI SDK UI (`useChat`, AI Elements) to AG-UI protocol agents without adopting CopilotKit or assistant-ui.

## Status

**v0.1 - Experimental (October 2026)**

- ✅ Core transport implementation complete
- ✅ SSE (Server-Sent Events) parsing
- ✅ All AG-UI event types mapped to AI SDK chunks
- ✅ Text streaming working end-to-end
- ✅ Backend tool execution working - tools are called and results returned
- ✅ Tool output JSON parsing - JSON strings automatically parsed to objects for better UI rendering
- ✅ Unit tests passing (10/10)
- ✅ Integration tests passing (3/3) - verified with AI SDK message assembly
- ✅ Tested against custom AG-UI server using `@ag-ui/encoder`
- ⚠️ **Not yet tested** against LangGraph, Mastra, or Google ADK AG-UI implementations
- ⚠️ **Frontend tools not supported** - only backend tool execution

As of October 2026:
- **Vercel AI SDK v7** (`ai` package) dominates React agentic UIs with `useChat` and AI Elements
- **AG-UI 1.0** shipped September 30, 2026, becoming the standard protocol for agent↔UI communication
- Major agent frameworks (LangGraph, Mastra, ADK) all support AG-UI
- **But there's no bridge**: `useChat` can't talk to AG-UI agents directly

This library fills that gap with a simple `ChatTransport` implementation.

## Installation

**Install from GitHub** (npm package coming soon):

```bash
npm install djig/ag-ui-chat-transport ai @ai-sdk/react
# or
pnpm add djig/ag-ui-chat-transport ai @ai-sdk/react
# or
yarn add djig/ag-ui-chat-transport ai @ai-sdk/react
```

The package builds automatically during installation via the `prepare` script.

## Quick Start

```tsx
'use client';

import { useChat } from '@ai-sdk/react';
import { AgUiChatTransport } from 'ag-ui-chat-transport';
import { useState } from 'react';

const transport = new AgUiChatTransport({
  api: '/api/agent', // Your AG-UI endpoint (relative or absolute URL)
});

export default function Chat() {
  const { messages, sendMessage, status } = useChat({
    transport,
  });

  const [input, setInput] = useState('');
  const isLoading = status === 'submitted' || status === 'streaming';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    const message = input;
    setInput('');
    await sendMessage({ role: 'user', content: message });
  };

  return (
    <div>
      {messages.map(m => (
        <div key={m.id}>{m.content}</div>
      ))}
      <form onSubmit={handleSubmit}>
        <input 
          value={input} 
          onChange={(e) => setInput(e.target.value)} 
          disabled={isLoading}
        />
        <button type="submit" disabled={isLoading}>Send</button>
      </form>
    </div>
  );
}
```

## Features

✅ **Streaming**: Text messages stream word-by-word  
✅ **Tool Calls**: Arguments stream as JSON chunks, results map to AI SDK tool parts  
✅ **Reasoning**: Maps AG-UI reasoning events to AI SDK reasoning parts  
✅ **State**: Exposes AG-UI shared state via data parts and `useAgUiState` hook  
✅ **Errors**: Error events map to AI SDK error chunks  
✅ **Abort**: Supports AbortSignal for cancellation  
✅ **Reconnect**: Reconnection support via `reconnectToStream`  
✅ **Token Usage**: Maps AG-UI usage to data parts  
✅ **Subagents**: Subagent events exposed as custom data parts

## API

### `AgUiChatTransport`

```typescript
import { AgUiChatTransport } from 'ag-ui-chat-transport';

const transport = new AgUiChatTransport({
  // Required: AG-UI endpoint URL (can be relative or absolute)
  api: '/api/agent',
  
  // Optional: Static or dynamic headers
  headers: {
    Authorization: 'Bearer token',
  },
  // Or function:
  headers: async () => ({
    Authorization: `Bearer ${await getToken()}`,
  }),
  
  // Optional: Custom fetch implementation
  fetch: customFetch,
  
  // Optional: Credentials mode
  credentials: 'include',
  
  // Optional: Thread ID (defaults to chatId)
  threadId: 'user-session-123',
});
```

### `useAgUiState` Hook

Access AG-UI shared state from your chat messages:

```tsx
import { useChat } from '@ai-sdk/react';
import { AgUiChatTransport, useAgUiState } from 'ag-ui-chat-transport';

function Chat() {
  const { messages } = useChat({ transport });
  const state = useAgUiState(messages); // AG-UI state object or null
  
  return (
    <div>
      {state && <pre>{JSON.stringify(state, null, 2)}</pre>}
    </div>
  );
}
```

## Wire Format

AG-UI agents stream events using **SSE (Server-Sent Events)** format, per the AG-UI 1.0 specification:

```
data: {"type":"TEXT_MESSAGE_START","messageId":"msg-123",...}

data: {"type":"TEXT_MESSAGE_CONTENT","messageId":"msg-123","delta":"Hello"}

data: {"type":"TEXT_MESSAGE_END","messageId":"msg-123"}

```

Each event is prefixed with `data: ` and followed by `\n\n` (double newline). This library parses SSE streams and converts AG-UI events to AI SDK `UIMessageChunk` objects.

| AG-UI Event | AI SDK Chunk | Notes |
|---|---|---|
| `RUN_STARTED` | `{ type: 'start' }` | Begins a new assistant message |
| `TEXT_MESSAGE_START` | `{ type: 'text-start', id }` | Opens text stream |
| `TEXT_MESSAGE_CONTENT` | `{ type: 'text-delta', delta }` | Appends text fragment |
| `TEXT_MESSAGE_END` | `{ type: 'text-end' }` | Closes text stream |
| `TOOL_CALL_START` | `{ type: 'tool-input-start', toolName }` | Opens tool call |
| `TOOL_CALL_ARGS` | `{ type: 'tool-input-delta', inputTextDelta }` | Streams tool args |
| `TOOL_CALL_END` | `{ type: 'tool-input-available', input }` | Provides parsed args |
| `TOOL_CALL_RESULT` | `{ type: 'tool-output-available', output }` | Tool execution result |
| `STATE_SNAPSHOT` | `{ type: 'data-state', data }` | Full state replacement |
| `STATE_DELTA` | `{ type: 'data-state-delta', data }` | JSON Patch state update |
| `RUN_FINISHED` | `{ type: 'finish', finishReason }` | Ends message |
| `RUN_ERROR` | `{ type: 'error', errorText }` | Error event |
| `REASONING_START` | `{ type: 'reasoning-start', id }` | Opens reasoning stream |
| `REASONING_MESSAGE_CONTENT` | `{ type: 'reasoning-delta', delta }` | Reasoning content |
| `REASONING_END` | `{ type: 'reasoning-end' }` | Closes reasoning |
| `SUBAGENT_*` | `{ type: 'data-subagent', data }` | Custom data part |
| Token usage | `{ type: 'data-usage', data }` | From `RUN_FINISHED.usage` |

## Examples

See [`examples/nextjs-basic`](./examples/nextjs-basic) for a complete working example with:
- Mock AG-UI server
- Streaming chat UI
- Tool call demonstration
- Token usage display

## Limitations & Known Gaps

1. **Frontend Tools**: Only backend tool execution is supported. Frontend tools (human-in-the-loop, tool approval) are not yet implemented.
2. **Third-party AG-UI Servers**: Tested only against a custom server built with `@ag-ui/encoder`. Not yet tested with LangGraph, Mastra, or Google ADK AG-UI implementations.
3. **Multimodal**: Text-only for now. AG-UI image/audio/video parts are not yet mapped.
4. **Streaming State**: `STATE_DELTA` (JSON Patch) is exposed as-is; no automatic state merging.
5. **Error Recovery**: Network errors require manual reconnection via `reconnectToStream`.

## Tool Output Parsing

The transport automatically parses JSON strings in tool outputs for better UI rendering:

**AG-UI Response:**
```json
{
  "type": "TOOL_CALL_RESULT",
  "toolCallId": "tool-1",
  "content": [{ "type": "text", "text": "{\"temperature\":72,\"condition\":\"sunny\"}" }]
}
```

**Parsed Output:**
```javascript
{
  toolCallId: "tool-1",
  output: { temperature: 72, condition: "sunny" }  // Parsed as object
}
```

Non-JSON strings are preserved in their original format:
```javascript
{
  toolCallId: "tool-2",
  output: [{ type: "text", text: "file1.txt\nfile2.txt" }]  // Preserved as array
}
```

This behavior is tested in the integration test suite.

## Roadmap

- [ ] Tool approval / HITL interrupt mapping
- [ ] Multimodal content parts (image, audio, video)
- [ ] Automatic state merging for `STATE_DELTA`
- [ ] WebSocket transport option
- [ ] Retry and reconnection strategies
- [ ] Server-side usage (SSR / RSC)
- [ ] MCP Apps rendering

## License

MIT

## Contributing

PRs welcome! See [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## Testing Against Real AG-UI Servers

The transport has been tested against:

1. **Custom AG-UI server using `@ag-ui/encoder`** (included in `examples/real-agui-server.mjs`)
   - Uses official `EventEncoder.encodeSSE()` from `@ag-ui/encoder` v1.0.1
   - Emits proper AG-UI 1.0 SSE events
   - Successfully tested: 34 chunks including full tool call lifecycle
   
2. **Mock AG-UI server** (included in `examples/nextjs-basic/app/api/agent/route.ts`)
   - Hand-crafted SSE events following AG-UI 1.0 spec
   - Used for Next.js demo app

To run the custom AG-UI server test:
```bash
# Terminal 1: Start the AG-UI server
node examples/real-agui-server.mjs

# Terminal 2: Run the test script
node examples/test-real-server.mjs
```

Test with curl:
```bash
curl -X POST http://localhost:8001/agent \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Hello"}]}' 
```

**Third-party AG-UI servers** (not yet tested):
- LangGraph with AG-UI adapter
- Mastra with AG-UI output
- Google ADK with AG-UI protocol
- Other `@ag-ui/core` compatible servers

Contributions testing against LangGraph/Mastra/ADK welcome!

- [Vercel AI SDK](https://sdk.vercel.ai) - The AI SDK this library extends
- [AG-UI Protocol](https://github.com/ag-ui-protocol/ag-ui) - The protocol this library implements
- [AI Elements](https://elements.ai-sdk.dev) - Pre-built UI components that work with this transport
- [CopilotKit](https://github.com/CopilotKit/CopilotKit) - Full-stack framework with built-in AG-UI support
- [assistant-ui](https://github.com/assistant-ui/assistant-ui) - Chat primitives with AG-UI adapter

---

More by [@djig](https://github.com/djig): [ui-loop](https://github.com/djig/ui-loop) (token-budgeted visual feedback MCP) · [drift-guard](https://github.com/djig/drift-guard) (blocks stale React/Next/Tailwind patterns) · [claude-onair](https://github.com/djig/claude-onair) (Claude Code desk status light)
