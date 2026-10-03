#!/usr/bin/env node
/**
 * Test ag-ui-chat-transport against real AG-UI server
 */

import { AgUiChatTransport } from '../dist/index.js';

console.log('[Test] Creating transport for real AG-UI server...');

const transport = new AgUiChatTransport({
  api: 'http://localhost:8001/agent',
});

const messages = [
  {
    id: '1',
    role: 'user',
    content: 'Hello, what time is it?',
    parts: [{ type: 'text', text: 'Hello, what time is it?' }],
  },
];

console.log('[Test] Calling sendMessages...');

try {
  const stream = await transport.sendMessages({
    trigger: 'submit-message',
    chatId: 'test-chat',
    messageId: undefined,
    messages,
    abortSignal: undefined,
  });

  console.log('[Test] Reading chunks from stream...\n');

  const reader = stream.getReader();
  const chunks = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    console.log(`[Test] Chunk ${chunks.length}:`, JSON.stringify(value, null, 2));
  }

  console.log(`\n[Test] ✅ SUCCESS! Received ${chunks.length} chunks from real AG-UI server`);

  // Verify key chunks
  const toolStart = chunks.find(c => c.type === 'tool-input-start');
  const toolAvailable = chunks.find(c => c.type === 'tool-input-available');
  const toolOutput = chunks.find(c => c.type === 'tool-output-available');
  const textDeltas = chunks.filter(c => c.type === 'text-delta');

  console.log('\n[Test] Verification:');
  console.log(`  - Tool start chunk: ${toolStart ? '✅' : '❌'}`);
  console.log(`  - Tool available chunk: ${toolAvailable ? '✅' : '❌'}`);
  console.log(`  - Tool output chunk: ${toolOutput ? '✅' : '❌'}`);
  console.log(`  - Text deltas: ${textDeltas.length} chunks`);

  if (toolStart) {
    console.log(`\n[Test] Tool name: ${toolStart.toolName}`);
  }
  if (toolAvailable) {
    console.log(`[Test] Tool input: ${JSON.stringify(toolAvailable.input)}`);
  }
  if (toolOutput) {
    console.log(`[Test] Tool output available: yes`);
  }

  process.exit(0);
} catch (error) {
  console.error('\n[Test] ❌ ERROR:', error.message);
  console.error(error.stack);
  process.exit(1);
}
