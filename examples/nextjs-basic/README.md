# AG-UI Chat Transport - Next.js Example

This example demonstrates how to use `ag-ui-chat-transport` to connect Vercel AI SDK UI (`useChat`) with an AG-UI protocol agent.

## What's Inside

- **Mock AG-UI Server** (`app/api/agent/route.ts`): A simulated AG-UI protocol server that demonstrates streaming text and tool calls
- **Chat UI** (`app/page.tsx`): A modern chat interface built with `useChat` and the AG-UI transport

## Features Demonstrated

- ✅ Streaming text messages
- ✅ Tool calls with arguments streaming
- ✅ Tool results
- ✅ Token usage reporting
- ✅ Error handling
- ✅ Loading states

## Running the Example

```bash
npm install
npm run dev
```

Open [http://localhost:3456](http://localhost:3456) in your browser.

## Try It Out

Ask the agent:

- "What's the weather like?" - Demonstrates tool calls
- "Hello" - Basic greeting
- Any other message - Echo response

## Connecting to a Real AG-UI Agent

To connect to a real AG-UI agent (LangGraph, Mastra, Google ADK, etc.), simply update the `url` in the transport:

```typescript
const transport = new AgUiChatTransport({
  url: 'http://your-agent-url/stream',
  headers: {
    Authorization: 'Bearer your-token',
  },
});
```

## Project Structure

```
app/
├── api/
│   └── agent/
│       └── route.ts      # Mock AG-UI server
├── page.tsx              # Chat UI with useChat
└── layout.tsx            # Root layout
```
