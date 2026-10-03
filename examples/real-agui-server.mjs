#!/usr/bin/env node
/**
 * Real AG-UI Server Test
 * 
 * A minimal AG-UI protocol server that uses @ag-ui/encoder to emit proper SSE events.
 * This serves as a reference implementation to test the transport against a real AG-UI server.
 */

import http from 'http';
import { EventEncoder } from '@ag-ui/encoder';

const PORT = 8001;

const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== 'POST' || req.url !== '/agent') {
    res.writeHead(404);
    res.end('Not Found');
    return;
  }

  // Parse request body
  let body = '';
  for await (const chunk of req) {
    body += chunk;
  }

  const { threadId, messages } = JSON.parse(body);
  const lastMessage = messages[messages.length - 1];
  
  console.log('[Real AG-UI Server] Received request:', { threadId, messageCount: messages.length, lastMessage: lastMessage.content });

  // Set up SSE response
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  // Create EventEncoder from @ag-ui/encoder
  const encoder = new EventEncoder();
  
  const runId = `run-${Date.now()}`;
  const messageId = `msg-${Date.now()}`;
  const toolCallId = `tool-${Date.now()}`;

  try {
    // Send RUN_STARTED event
    res.write(encoder.encodeSSE({ type: 'RUN_STARTED', runId, timestamp: Date.now() }));
    await sleep(50);

    // Simulate a tool call
    res.write(encoder.encodeSSE({
      type: 'TOOL_CALL_START',
      toolCallId,
      toolCallName: 'get_current_time',
      timestamp: Date.now(),
    }));
    await sleep(100);

    // Stream tool arguments
    const args = { format: '24h', timezone: 'UTC' };
    const argsStr = JSON.stringify(args);
    for (let i = 0; i < argsStr.length; i += 5) {
      res.write(encoder.encodeSSE({
        type: 'TOOL_CALL_ARGS',
        toolCallId,
        delta: argsStr.slice(i, i + 5),
        timestamp: Date.now(),
      }));
      await sleep(20);
    }

    res.write(encoder.encodeSSE({
      type: 'TOOL_CALL_END',
      toolCallId,
      timestamp: Date.now(),
    }));
    await sleep(50);

    // Send tool result
    const now = new Date();
    const toolResult = {
      time: now.toISOString(),
      timestamp: Date.now(),
      timezone: 'UTC',
    };
    
    res.write(encoder.encodeSSE({
      type: 'TOOL_CALL_RESULT',
      toolCallId,
      messageId: `tool-result-${Date.now()}`,
      content: [{ type: 'text', text: JSON.stringify(toolResult) }],
      timestamp: Date.now(),
    }));
    await sleep(100);

    // Send text message response
    res.write(encoder.encodeSSE({
      type: 'TEXT_MESSAGE_START',
      messageId,
      role: 'assistant',
      timestamp: Date.now(),
    }));
    await sleep(50);

    const responseText = `The current time is ${now.toUTCString()}. I used the get_current_time tool to retrieve this information.`;
    const words = responseText.split(' ');
    
    for (const word of words) {
      res.write(encoder.encodeSSE({
        type: 'TEXT_MESSAGE_CONTENT',
        messageId,
        delta: word + ' ',
        timestamp: Date.now(),
      }));
      await sleep(50);
    }

    res.write(encoder.encodeSSE({
      type: 'TEXT_MESSAGE_END',
      messageId,
      timestamp: Date.now(),
    }));
    await sleep(50);

    // Send RUN_FINISHED with usage
    res.write(encoder.encodeSSE({
      type: 'RUN_FINISHED',
      runId,
      threadId,
      outcome: { type: 'success' },
      usage: [
        {
          inputTokens: 15,
          outputTokens: 28,
          totalTokens: 43,
        },
      ],
      timestamp: Date.now(),
    }));

    console.log('[Real AG-UI Server] Stream complete');
    res.end();
  } catch (error) {
    console.error('[Real AG-UI Server] Error:', error);
    res.write(encoder.encodeSSE({
      type: 'RUN_ERROR',
      message: error.message,
      timestamp: Date.now(),
    }));
    res.end();
  }
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

server.listen(PORT, () => {
  console.log(`[Real AG-UI Server] Running on http://localhost:${PORT}/agent`);
  console.log('[Real AG-UI Server] Using @ag-ui/encoder for proper SSE formatting');
});
