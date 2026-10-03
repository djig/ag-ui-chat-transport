import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgUiChatTransport } from '../ag-ui-chat-transport';
import type { UIMessage } from 'ai';

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

describe('AgUiChatTransport', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let transport: AgUiChatTransport;

  beforeEach(() => {
    mockFetch = vi.fn();
    transport = new AgUiChatTransport({
      api: 'http://localhost:8000/agent',
      fetch: mockFetch as any,
    });
  });

  describe('sendMessages', () => {
    it('should convert AI SDK messages to AG-UI format', async () => {
      const messages: UIMessage[] = [
        {
          id: '1',
          role: 'user',
          content: 'Hello',
          parts: [{ type: 'text', text: 'Hello' }],
        },
      ];

      const agUiEvents = [
        { type: 'RUN_STARTED', runId: 'run-1' },
        { type: 'TEXT_MESSAGE_START', messageId: 'msg-1' },
        { type: 'TEXT_MESSAGE_CONTENT', messageId: 'msg-1', delta: 'Hi there!' },
        { type: 'TEXT_MESSAGE_END', messageId: 'msg-1' },
        { type: 'RUN_FINISHED', runId: 'run-1', threadId: 'thread-1', outcome: { type: 'success' } },
      ];

      mockFetch.mockResolvedValue({
        ok: true,
        body: createMockAgUiStream(agUiEvents),
      });

      const stream = await transport.sendMessages({
        trigger: 'submit-message',
        chatId: 'chat-1',
        messageId: undefined,
        messages,
        abortSignal: undefined,
      });

      const chunks = await collectChunks(stream);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8000/agent',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'content-type': 'application/json',
          }),
        }),
      );

      // Verify the request body contains AG-UI formatted messages
      const callArgs = mockFetch.mock.calls[0];
      const requestBody = JSON.parse(callArgs[1].body);
      expect(requestBody).toHaveProperty('threadId');
      expect(requestBody).toHaveProperty('messages');
      expect(requestBody.messages[0]).toMatchObject({
        role: 'user',
        content: 'Hello',
      });

      expect(chunks).toHaveLength(5);
      expect(chunks[0]).toEqual({ type: 'start', messageId: undefined });
      expect(chunks[1]).toEqual({ type: 'text-start', id: 'msg-1' });
      expect(chunks[2]).toEqual({ type: 'text-delta', id: 'msg-1', delta: 'Hi there!' });
      expect(chunks[3]).toEqual({ type: 'text-end', id: 'msg-1' });
      expect(chunks[4]).toEqual({ type: 'finish', finishReason: 'stop' });
    });

    it('should handle tool calls with exact chunk sequence', async () => {
      const messages: UIMessage[] = [
        {
          id: '1',
          role: 'user',
          content: 'What is the weather?',
          parts: [{ type: 'text', text: 'What is the weather?' }],
        },
      ];

      const agUiEvents = [
        { type: 'RUN_STARTED', runId: 'run-1' },
        { type: 'TOOL_CALL_START', toolCallId: 'tool-1', toolCallName: 'get_weather' },
        { type: 'TOOL_CALL_ARGS', toolCallId: 'tool-1', delta: '{"location": "' },
        { type: 'TOOL_CALL_ARGS', toolCallId: 'tool-1', delta: 'San Francisco' },
        { type: 'TOOL_CALL_ARGS', toolCallId: 'tool-1', delta: '"}' },
        { type: 'TOOL_CALL_END', toolCallId: 'tool-1' },
        {
          type: 'TOOL_CALL_RESULT',
          messageId: 'tool-msg-1',
          toolCallId: 'tool-1',
          content: [{ type: 'text', text: JSON.stringify({ temperature: 72, condition: 'sunny' }) }],
        },
        { type: 'RUN_FINISHED', runId: 'run-1', threadId: 'thread-1', outcome: { type: 'success' } },
      ];

      mockFetch.mockResolvedValue({
        ok: true,
        body: createMockAgUiStream(agUiEvents),
      });

      const stream = await transport.sendMessages({
        trigger: 'submit-message',
        chatId: 'chat-1',
        messageId: undefined,
        messages,
        abortSignal: undefined,
      });

      const chunks = await collectChunks(stream);

      // Assert exact chunk sequence for tool call
      expect(chunks).toEqual([
        { type: 'start', messageId: undefined },
        {
          type: 'tool-input-start',
          toolCallId: 'tool-1',
          toolName: 'get_weather',
          dynamic: true,
        },
        {
          type: 'tool-input-delta',
          toolCallId: 'tool-1',
          inputTextDelta: '{"location": "',
        },
        {
          type: 'tool-input-delta',
          toolCallId: 'tool-1',
          inputTextDelta: 'San Francisco',
        },
        {
          type: 'tool-input-delta',
          toolCallId: 'tool-1',
          inputTextDelta: '"}',
        },
        {
          type: 'tool-input-available',
          toolCallId: 'tool-1',
          toolName: 'get_weather',
          input: { location: 'San Francisco' },
          dynamic: true,
        },
        {
          type: 'tool-output-available',
          toolCallId: 'tool-1',
          // Output is now parsed from JSON string to object
          output: { temperature: 72, condition: 'sunny' },
          dynamic: true,
        },
        { type: 'finish', finishReason: 'stop' },
      ]);
    });

    it('should handle errors correctly', async () => {
      const messages: UIMessage[] = [
        {
          id: '1',
          role: 'user',
          content: 'Test',
          parts: [{ type: 'text', text: 'Test' }],
        },
      ];

      const agUiEvents = [
        { type: 'RUN_STARTED', runId: 'run-1' },
        { type: 'RUN_ERROR', message: 'Connection timeout' },
      ];

      mockFetch.mockResolvedValue({
        ok: true,
        body: createMockAgUiStream(agUiEvents),
      });

      const stream = await transport.sendMessages({
        trigger: 'submit-message',
        chatId: 'chat-1',
        messageId: undefined,
        messages,
        abortSignal: undefined,
      });

      const chunks = await collectChunks(stream);

      const errorChunk = chunks.find((c: any) => c.type === 'error');
      expect(errorChunk).toEqual({
        type: 'error',
        errorText: 'Connection timeout',
      });
    });

    it('should handle state snapshots', async () => {
      const messages: UIMessage[] = [
        {
          id: '1',
          role: 'user',
          content: 'Update state',
          parts: [{ type: 'text', text: 'Update state' }],
        },
      ];

      const agUiEvents = [
        { type: 'RUN_STARTED', runId: 'run-1' },
        {
          type: 'STATE_SNAPSHOT',
          snapshot: { counter: 5, status: 'active' },
        },
        { type: 'RUN_FINISHED', runId: 'run-1', threadId: 'thread-1', outcome: { type: 'success' } },
      ];

      mockFetch.mockResolvedValue({
        ok: true,
        body: createMockAgUiStream(agUiEvents),
      });

      const stream = await transport.sendMessages({
        trigger: 'submit-message',
        chatId: 'chat-1',
        messageId: undefined,
        messages,
        abortSignal: undefined,
      });

      const chunks = await collectChunks(stream);

      const stateChunk = chunks.find((c: any) => c.type === 'data-state');
      expect(stateChunk).toMatchObject({
        type: 'data-state',
        data: { counter: 5, status: 'active' },
      });
    });

    it('should handle reasoning events', async () => {
      const messages: UIMessage[] = [
        {
          id: '1',
          role: 'user',
          content: 'Solve this problem',
          parts: [{ type: 'text', text: 'Solve this problem' }],
        },
      ];

      const agUiEvents = [
        { type: 'RUN_STARTED', runId: 'run-1' },
        { type: 'REASONING_START', messageId: 'reasoning-1' },
        { type: 'REASONING_MESSAGE_CONTENT', messageId: 'reasoning-1', delta: 'Let me think...' },
        { type: 'REASONING_MESSAGE_CONTENT', messageId: 'reasoning-1', delta: ' step by step' },
        { type: 'REASONING_END', messageId: 'reasoning-1' },
        { type: 'TEXT_MESSAGE_START', messageId: 'msg-1' },
        { type: 'TEXT_MESSAGE_CONTENT', messageId: 'msg-1', delta: 'Here is the solution' },
        { type: 'TEXT_MESSAGE_END', messageId: 'msg-1' },
        { type: 'RUN_FINISHED', runId: 'run-1', threadId: 'thread-1', outcome: { type: 'success' } },
      ];

      mockFetch.mockResolvedValue({
        ok: true,
        body: createMockAgUiStream(agUiEvents),
      });

      const stream = await transport.sendMessages({
        trigger: 'submit-message',
        chatId: 'chat-1',
        messageId: undefined,
        messages,
        abortSignal: undefined,
      });

      const chunks = await collectChunks(stream);

      const reasoningStart = chunks.find((c: any) => c.type === 'reasoning-start');
      expect(reasoningStart).toEqual({ type: 'reasoning-start', id: 'reasoning-1' });

      const reasoningDeltas = chunks.filter((c: any) => c.type === 'reasoning-delta');
      expect(reasoningDeltas).toHaveLength(2);
      expect(reasoningDeltas[0]).toMatchObject({
        type: 'reasoning-delta',
        id: 'reasoning-1',
        delta: 'Let me think...',
      });

      const reasoningEnd = chunks.find((c: any) => c.type === 'reasoning-end');
      expect(reasoningEnd).toEqual({ type: 'reasoning-end', id: 'reasoning-1' });
    });

    it('should handle abort signals', async () => {
      const messages: UIMessage[] = [
        {
          id: '1',
          role: 'user',
          content: 'Test',
          parts: [{ type: 'text', text: 'Test' }],
        },
      ];

      const abortController = new AbortController();

      mockFetch.mockImplementation(() => {
        abortController.abort();
        return Promise.reject(new Error('Aborted'));
      });

      await expect(
        transport.sendMessages({
          trigger: 'submit-message',
          chatId: 'chat-1',
          messageId: undefined,
          messages,
          abortSignal: abortController.signal,
        }),
      ).rejects.toThrow('Aborted');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          signal: abortController.signal,
        }),
      );
    });

    it('should handle HTTP errors', async () => {
      const messages: UIMessage[] = [
        {
          id: '1',
          role: 'user',
          content: 'Test',
          parts: [{ type: 'text', text: 'Test' }],
        },
      ];

      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'Internal Server Error',
      });

      await expect(
        transport.sendMessages({
          trigger: 'submit-message',
          chatId: 'chat-1',
          messageId: undefined,
          messages,
          abortSignal: undefined,
        }),
      ).rejects.toThrow('Internal Server Error');
    });

    it('should handle custom headers', async () => {
      const transportWithHeaders = new AgUiChatTransport({
        api: 'http://localhost:8000/agent',
        headers: { Authorization: 'Bearer token123' },
        fetch: mockFetch as any,
      });

      const messages: UIMessage[] = [
        {
          id: '1',
          role: 'user',
          content: 'Test',
          parts: [{ type: 'text', text: 'Test' }],
        },
      ];

      mockFetch.mockResolvedValue({
        ok: true,
        body: createMockAgUiStream([
          { type: 'RUN_STARTED', runId: 'run-1' },
          { type: 'RUN_FINISHED', outcome: { type: 'success' } },
        ]),
      });

      await transportWithHeaders.sendMessages({
        trigger: 'submit-message',
        chatId: 'chat-1',
        messageId: undefined,
        messages,
        abortSignal: undefined,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            authorization: 'Bearer token123',
          }),
        }),
      );
    });

    it('should handle function-based headers', async () => {
      const headersFn = vi.fn().mockResolvedValue({ 'X-Custom': 'value' });
      const transportWithFnHeaders = new AgUiChatTransport({
        api: 'http://localhost:8000/agent',
        headers: headersFn,
        fetch: mockFetch as any,
      });

      const messages: UIMessage[] = [
        {
          id: '1',
          role: 'user',
          content: 'Test',
          parts: [{ type: 'text', text: 'Test' }],
        },
      ];

      mockFetch.mockResolvedValue({
        ok: true,
        body: createMockAgUiStream([
          { type: 'RUN_STARTED', runId: 'run-1' },
          { type: 'RUN_FINISHED', outcome: { type: 'success' } },
        ]),
      });

      await transportWithFnHeaders.sendMessages({
        trigger: 'submit-message',
        chatId: 'chat-1',
        messageId: undefined,
        messages,
        abortSignal: undefined,
      });

      expect(headersFn).toHaveBeenCalled();
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-custom': 'value',
          }),
        }),
      );
    });

    it('should handle token usage in finish event', async () => {
      const messages: UIMessage[] = [
        {
          id: '1',
          role: 'user',
          content: 'Test',
          parts: [{ type: 'text', text: 'Test' }],
        },
      ];

      const agUiEvents = [
        { type: 'RUN_STARTED', runId: 'run-1' },
        { type: 'TEXT_MESSAGE_START', messageId: 'msg-1' },
        { type: 'TEXT_MESSAGE_CONTENT', messageId: 'msg-1', delta: 'Response' },
        { type: 'TEXT_MESSAGE_END', messageId: 'msg-1' },
        {
          type: 'RUN_FINISHED',
          runId: 'run-1',
          threadId: 'thread-1',
          outcome: {
            type: 'success',
          },
          usage: [
            {
              inputTokens: 10,
              outputTokens: 20,
              totalTokens: 30,
            },
          ],
        },
      ];

      mockFetch.mockResolvedValue({
        ok: true,
        body: createMockAgUiStream(agUiEvents),
      });

      const stream = await transport.sendMessages({
        trigger: 'submit-message',
        chatId: 'chat-1',
        messageId: undefined,
        messages,
        abortSignal: undefined,
      });

      const chunks = await collectChunks(stream);

      const usageChunk = chunks.find((c: any) => c.type === 'data-usage');
      expect(usageChunk).toBeDefined();
      expect(usageChunk).toHaveProperty('data');
      expect((usageChunk as any).data).toEqual([
        {
          inputTokens: 10,
          outputTokens: 20,
          totalTokens: 30,
        },
      ]);
    });
  });
});
