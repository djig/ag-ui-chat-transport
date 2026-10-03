import { describe, it, expect, vi } from 'vitest';
import { AgUiChatTransport } from '../ag-ui-chat-transport';
import type { UIMessage, UIMessageChunk } from 'ai';

/**
 * Integration tests that verify the transport works end-to-end with the real AI SDK.
 * These tests simulate the full message assembly process and verify the final message parts.
 */

/**
 * Helper to create a mock AG-UI response stream from events (SSE format)
 */
function createMockAgUiStream(events: any[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;

  return new ReadableStream({
    async pull(controller) {
      if (index < events.length) {
        const event = events[index++];
        const sseEvent = `data: ${JSON.stringify(event)}\n\n`;
        controller.enqueue(encoder.encode(sseEvent));
      } else {
        controller.close();
      }
    },
  });
}

/**
 * Simulates AI SDK's message assembly logic by processing chunks into message parts.
 * This mirrors what the real useChat/Chat components do internally.
 */
async function assembleMessageParts(chunks: UIMessageChunk[]) {
  const parts: any[] = [];
  const textParts = new Map<string, { text: string }>();
  const toolParts = new Map<string, any>();
  const reasoningParts = new Map<string, { text: string }>();

  for (const chunk of chunks) {
    switch (chunk.type) {
      case 'text-start':
        if (chunk.id) {
          textParts.set(chunk.id, { text: '' });
        }
        break;

      case 'text-delta':
        if (chunk.id) {
          const part = textParts.get(chunk.id);
          if (part) {
            part.text += chunk.delta;
          }
        }
        break;

      case 'text-end':
        if (chunk.id) {
          const part = textParts.get(chunk.id);
          if (part && part.text) {
            parts.push({ type: 'text', text: part.text });
          }
        }
        break;

      case 'tool-input-start':
        toolParts.set(chunk.toolCallId, {
          type: 'dynamic-tool',
          toolCallId: chunk.toolCallId,
          toolName: chunk.toolName,
          input: undefined,
          output: undefined,
        });
        break;

      case 'tool-input-available':
        {
          const part = toolParts.get(chunk.toolCallId);
          if (part) {
            part.input = chunk.input;
          }
        }
        break;

      case 'tool-output-available':
        {
          const part = toolParts.get(chunk.toolCallId);
          if (part) {
            part.output = chunk.output;
            // Move completed tool part to parts array
            parts.push(part);
          }
        }
        break;

      case 'reasoning-start':
        if (chunk.id) {
          reasoningParts.set(chunk.id, { text: '' });
        }
        break;

      case 'reasoning-delta':
        if (chunk.id) {
          const part = reasoningParts.get(chunk.id);
          if (part) {
            part.text += chunk.delta;
          }
        }
        break;

      case 'reasoning-end':
        if (chunk.id) {
          const part = reasoningParts.get(chunk.id);
          if (part && part.text) {
            parts.push({ type: 'reasoning', text: part.text });
          }
        }
        break;
    }
  }

  return parts;
}

/**
 * Helper to collect all chunks from a stream
 */
async function collectChunks<T>(stream: ReadableStream<T>): Promise<T[]> {
  const chunks: T[] = [];
  const reader = stream.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  return chunks;
}

describe('Integration: AI SDK message assembly', () => {
  it('should assemble text + tool call into proper message parts', async () => {
    const mockFetch = vi.fn();
    const transport = new AgUiChatTransport({
      api: 'http://localhost:8000/agent',
      fetch: mockFetch as any,
    });

    // Simulate a complete AG-UI response with text and a tool call
    const agUiEvents = [
      { type: 'RUN_STARTED', runId: 'run-1' },
      { type: 'TEXT_MESSAGE_START', messageId: 'msg-1' },
      { type: 'TEXT_MESSAGE_CONTENT', messageId: 'msg-1', delta: 'Based on the weather data, ' },
      { type: 'TEXT_MESSAGE_CONTENT', messageId: 'msg-1', delta: "it looks like it's a beautiful sunny day " },
      { type: 'TEXT_MESSAGE_CONTENT', messageId: 'msg-1', delta: 'in San Francisco with a temperature of 72°F and 45% humidity. ' },
      { type: 'TEXT_MESSAGE_CONTENT', messageId: 'msg-1', delta: 'Perfect weather for outdoor activities!' },
      { type: 'TEXT_MESSAGE_END', messageId: 'msg-1' },
      { type: 'TOOL_CALL_START', toolCallId: 'tool-1', toolCallName: 'get_weather' },
      { type: 'TOOL_CALL_ARGS', toolCallId: 'tool-1', delta: '{"location": "' },
      { type: 'TOOL_CALL_ARGS', toolCallId: 'tool-1', delta: 'San Francisco' },
      { type: 'TOOL_CALL_ARGS', toolCallId: 'tool-1', delta: '"}' },
      { type: 'TOOL_CALL_END', toolCallId: 'tool-1' },
      {
        type: 'TOOL_CALL_RESULT',
        messageId: 'tool-msg-1',
        toolCallId: 'tool-1',
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              temperature: 72,
              condition: 'sunny',
              humidity: 45,
            }),
          },
        ],
      },
      { type: 'RUN_FINISHED', runId: 'run-1', threadId: 'thread-1', outcome: { type: 'success' } },
    ];

    mockFetch.mockResolvedValue({
      ok: true,
      body: createMockAgUiStream(agUiEvents),
    });

    const messages: UIMessage[] = [
      {
        id: '1',
        role: 'user',
        content: 'What is the weather?',
        parts: [{ type: 'text', text: 'What is the weather?' }],
      },
    ];

    // Get the chunk stream
    const stream = await transport.sendMessages({
      trigger: 'submit-message',
      chatId: 'test-chat',
      messageId: undefined,
      messages,
      abortSignal: undefined,
    });

    const chunks = await collectChunks(stream);
    const parts = await assembleMessageParts(chunks);

    // Verify we have both text and tool parts
    expect(parts.length).toBeGreaterThanOrEqual(2);

    // Find text part and tool part
    const textPart = parts.find((p) => p.type === 'text');
    const toolPart = parts.find((p) => p.type === 'dynamic-tool');

    expect(textPart).toBeDefined();
    expect(textPart?.text).toContain('Based on the weather data');
    expect(textPart?.text).toContain('Perfect weather for outdoor activities!');

    expect(toolPart).toBeDefined();
    expect(toolPart?.toolName).toBe('get_weather');
    expect(toolPart?.input).toEqual({ location: 'San Francisco' });

    // Verify output is parsed from JSON string to object
    expect(toolPart?.output).toBeDefined();
    expect(typeof toolPart?.output).toBe('object');
    expect(toolPart?.output).toMatchObject({
      temperature: 72,
      condition: 'sunny',
      humidity: 45,
    });
  });

  it('should preserve non-JSON tool output as-is', async () => {
    const mockFetch = vi.fn();
    const transport = new AgUiChatTransport({
      api: 'http://localhost:8000/agent',
      fetch: mockFetch as any,
    });

    const agUiEvents = [
      { type: 'RUN_STARTED', runId: 'run-1' },
      { type: 'TOOL_CALL_START', toolCallId: 'tool-1', toolCallName: 'run_command' },
      { type: 'TOOL_CALL_ARGS', toolCallId: 'tool-1', delta: '{"cmd":"ls"}' },
      { type: 'TOOL_CALL_END', toolCallId: 'tool-1' },
      {
        type: 'TOOL_CALL_RESULT',
        messageId: 'tool-msg-1',
        toolCallId: 'tool-1',
        content: [{ type: 'text', text: 'file1.txt\nfile2.txt\ndir1/' }],
      },
      { type: 'RUN_FINISHED', runId: 'run-1', threadId: 'thread-1', outcome: { type: 'success' } },
    ];

    mockFetch.mockResolvedValue({
      ok: true,
      body: createMockAgUiStream(agUiEvents),
    });

    const messages: UIMessage[] = [
      {
        id: '1',
        role: 'user',
        content: 'List files',
        parts: [{ type: 'text', text: 'List files' }],
      },
    ];

    const stream = await transport.sendMessages({
      trigger: 'submit-message',
      chatId: 'test-chat',
      messageId: undefined,
      messages,
      abortSignal: undefined,
    });

    const chunks = await collectChunks(stream);
    const parts = await assembleMessageParts(chunks);

    const toolPart = parts.find((p) => p.type === 'dynamic-tool');
    expect(toolPart).toBeDefined();
    expect(toolPart?.toolName).toBe('run_command');

    // Non-JSON text should remain in array format
    expect(Array.isArray(toolPart?.output)).toBe(true);
    expect(toolPart?.output[0]).toMatchObject({
      type: 'text',
      text: 'file1.txt\nfile2.txt\ndir1/',
    });
  });

  it('should parse JSON strings in tool output to objects', async () => {
    const mockFetch = vi.fn();
    const transport = new AgUiChatTransport({
      api: 'http://localhost:8000/agent',
      fetch: mockFetch as any,
    });

    const agUiEvents = [
      { type: 'RUN_STARTED', runId: 'run-1' },
      { type: 'TOOL_CALL_START', toolCallId: 'tool-1', toolCallName: 'get_data' },
      { type: 'TOOL_CALL_ARGS', toolCallId: 'tool-1', delta: '{"id":"123"}' },
      { type: 'TOOL_CALL_END', toolCallId: 'tool-1' },
      {
        type: 'TOOL_CALL_RESULT',
        messageId: 'tool-msg-1',
        toolCallId: 'tool-1',
        // AG-UI returns tool results as array with single text part containing JSON
        content: [{ type: 'text', text: '{"status":"ok","data":{"key":"value"}}' }],
      },
      { type: 'RUN_FINISHED', runId: 'run-1', threadId: 'thread-1', outcome: { type: 'success' } },
    ];

    mockFetch.mockResolvedValue({
      ok: true,
      body: createMockAgUiStream(agUiEvents),
    });

    const messages: UIMessage[] = [
      {
        id: '1',
        role: 'user',
        content: 'Get data',
        parts: [{ type: 'text', text: 'Get data' }],
      },
    ];

    const stream = await transport.sendMessages({
      trigger: 'submit-message',
      chatId: 'test-chat',
      messageId: undefined,
      messages,
      abortSignal: undefined,
    });

    const chunks = await collectChunks(stream);
    const parts = await assembleMessageParts(chunks);

    const toolPart = parts.find((p) => p.type === 'dynamic-tool');
    expect(toolPart).toBeDefined();
    expect(toolPart?.toolName).toBe('get_data');

    // Output should be parsed to an object
    expect(typeof toolPart?.output).toBe('object');
    expect(Array.isArray(toolPart?.output)).toBe(false);
    expect(toolPart?.output).toMatchObject({
      status: 'ok',
      data: { key: 'value' },
    });
  });
});
