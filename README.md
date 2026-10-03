# ag-ui-chat-transport

Bridge Vercel AI SDK UI (`useChat`, AI Elements) to AG-UI protocol agents (LangGraph, Mastra, Google ADK, CrewAI, etc.) without adopting CopilotKit or assistant-ui.

## Why?

As of October 2026:
- **Vercel AI SDK v7** (`ai` package, 33.7M weekly downloads) dominates React agentic UIs with `useChat` and AI Elements
- **AG-UI 1.0** shipped September 30, 2026, becoming the standard protocol for agent↔UI communication
- Major agent frameworks (LangGraph, Mastra, ADK, Pydantic AI, Claude Managed Agents, OpenAI Agents SDK) all support AG-UI
- **But there's no bridge**: `useChat` can't talk to AG-UI agents directly

This library fills that gap with a simple `ChatTransport` implementation.

## Installation

```bash
npm install ag-ui-chat-transport ai @ai-sdk/react
# or
pnpm add ag-ui-chat-transport ai @ai-sdk/react
# or
yarn add ag-ui-chat-transport ai @ai-sdk/react
```

## Quick Start

```tsx
'use client';

import { useChat } from '@ai-sdk/react';
import { AgUiChatTransport } from 'ag-ui-chat-transport';

const transport = new AgUiChatTransport({
  url: 'http://localhost:8000/agent', // Your AG-UI endpoint
});

export default function Chat() {
  const { messages, input, handleInputChange, handleSubmit } = useChat({
    transport,
  });

  return (
    <div>
      {messages.map(m => (
        <div key={m.id}>{m.content}</div>
      ))}
      <form onSubmit={handleSubmit}>
        <input value={input} onChange={handleInputChange} />
        <button type="submit">Send</button>
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
  // Required: AG-UI endpoint URL
  url: 'http://localhost:8000/agent',
  
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

## Event Mapping

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

1. **Tool Approval**: AG-UI interrupts for tool approval are not yet mapped to AI SDK approval parts. Frontend tools work, but human-in-the-loop approval needs custom handling.
2. **Multimodal**: Text-only for now. AG-UI image/audio/video parts are not yet mapped.
3. **Streaming State**: `STATE_DELTA` (JSON Patch) is exposed as-is; no automatic state merging.
4. **Error Recovery**: Network errors require manual reconnection via `reconnectToStream`.

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

## Related Projects

- [Vercel AI SDK](https://sdk.vercel.ai) - The AI SDK this library extends
- [AG-UI Protocol](https://github.com/ag-ui-protocol/ag-ui) - The protocol this library implements
- [AI Elements](https://elements.ai-sdk.dev) - Pre-built UI components that work with this transport
- [CopilotKit](https://github.com/CopilotKit/CopilotKit) - Full-stack framework with built-in AG-UI support
- [assistant-ui](https://github.com/assistant-ui/assistant-ui) - Chat primitives with AG-UI adapter
