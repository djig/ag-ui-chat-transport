import type { ChatTransport, UIMessage, UIMessageChunk } from 'ai';
import type { ChatRequestOptions } from 'ai';
import type { AGUIEvent, State } from '@ag-ui/core';

/**
 * Configuration options for the AG-UI Chat Transport.
 */
export interface AgUiChatTransportOptions {
  /**
   * The URL of the AG-UI agent endpoint.
   * This should point to your AG-UI protocol server (e.g., LangGraph, Mastra, ADK, etc.)
   */
  url: string;

  /**
   * Optional custom headers to include in all requests.
   * Can be a static object or a function that returns headers.
   */
  headers?: Record<string, string> | (() => Record<string, string> | Promise<Record<string, string>>);

  /**
   * Optional custom fetch implementation.
   * Useful for testing or middleware.
   */
  fetch?: typeof fetch;

  /**
   * Optional credentials mode for fetch requests.
   * @default 'same-origin'
   */
  credentials?: RequestCredentials;

  /**
   * Optional thread ID for the AG-UI session.
   * If not provided, the chatId will be used as the threadId.
   */
  threadId?: string;
}

/**
 * ChatTransport implementation that bridges Vercel AI SDK UI (useChat, AI Elements)
 * to AG-UI protocol agents (LangGraph, Mastra, Google ADK, CrewAI, etc.)
 *
 * @example
 * ```tsx
 * import { useChat } from '@ai-sdk/react';
 * import { AgUiChatTransport } from 'ag-ui-chat-transport';
 *
 * function ChatComponent() {
 *   const { messages, input, handleInputChange, handleSubmit } = useChat({
 *     transport: new AgUiChatTransport({
 *       url: 'http://localhost:8000/agent',
 *     }),
 *   });
 *
 *   // Use with AI Elements or custom UI
 *   return (
 *     <form onSubmit={handleSubmit}>
 *       {messages.map(m => <div key={m.id}>{m.content}</div>)}
 *       <input value={input} onChange={handleInputChange} />
 *     </form>
 *   );
 * }
 * ```
 */
export class AgUiChatTransport<UI_MESSAGE extends UIMessage = UIMessage>
  implements ChatTransport<UI_MESSAGE>
{
  private readonly url: string;
  private readonly headers?: Record<string, string> | (() => Record<string, string> | Promise<Record<string, string>>);
  private readonly customFetch: typeof fetch;
  private readonly credentials: RequestCredentials;
  private readonly threadId?: string;

  // Track active streams for reconnection
  private activeStreams = new Map<string, ReadableStream<UIMessageChunk>>();

  constructor(options: AgUiChatTransportOptions) {
    this.url = options.url;
    this.headers = options.headers;
    this.customFetch = options.fetch ?? fetch;
    this.credentials = options.credentials ?? 'same-origin';
    this.threadId = options.threadId;
  }

  /**
   * Sends messages to the AG-UI agent endpoint and returns a streaming response.
   */
  async sendMessages(
    options: {
      trigger: 'submit-message' | 'regenerate-message';
      chatId: string;
      messageId: string | undefined;
      messages: UI_MESSAGE[];
      abortSignal: AbortSignal | undefined;
    } & ChatRequestOptions,
  ): Promise<ReadableStream<UIMessageChunk>> {
    const { chatId, messages, abortSignal, headers: optionHeaders, body: optionBody } = options;

    // Resolve headers
    const resolvedHeaders = await this.resolveHeaders();
    const mergedHeaders = {
      'Content-Type': 'application/json',
      ...resolvedHeaders,
      ...optionHeaders,
    };

    // Convert AI SDK messages to AG-UI format
    const agUiMessages = this.convertToAgUiMessages(messages);

    // Prepare the AG-UI request payload
    const requestBody = {
      threadId: this.threadId ?? chatId,
      messages: agUiMessages,
      ...optionBody,
    };

    // Make the request
    const response = await this.customFetch(this.url, {
      method: 'POST',
      headers: mergedHeaders,
      body: JSON.stringify(requestBody),
      credentials: this.credentials,
      signal: abortSignal,
    });

    if (!response.ok) {
      throw new Error(`AG-UI request failed: ${response.status} ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error('AG-UI response has no body');
    }

    // Create a transform stream that converts AG-UI events to AI SDK chunks
    const stream = this.transformAgUiStream(response.body, chatId);

    // Store the stream for potential reconnection
    this.activeStreams.set(chatId, stream);

    return stream;
  }

  /**
   * Reconnects to an existing streaming response for the specified chat session.
   */
  async reconnectToStream(
    options: {
      chatId: string;
      abortSignal?: AbortSignal;
    } & ChatRequestOptions,
  ): Promise<ReadableStream<UIMessageChunk> | null> {
    const { chatId } = options;

    // Check if we have an active stream for this chat
    const existingStream = this.activeStreams.get(chatId);

    if (existingStream) {
      return existingStream;
    }

    // No active stream found
    return null;
  }

  /**
   * Transforms an AG-UI event stream into an AI SDK UI message chunk stream.
   */
  private transformAgUiStream(
    agUiStream: ReadableStream<Uint8Array>,
    chatId: string,
  ): ReadableStream<UIMessageChunk> {
    const textDecoder = new TextDecoder();
    let buffer = '';
    let currentMessageId: string | undefined;
    let currentToolCallId: string | undefined;
    const toolCallStates = new Map<string, { name: string; args: string }>();

    return new ReadableStream<UIMessageChunk>({
      async start(controller) {
        const reader = agUiStream.getReader();

        try {
          while (true) {
            const { done, value } = await reader.read();

            if (done) {
              break;
            }

            // Decode and accumulate the chunk
            buffer += textDecoder.decode(value, { stream: true });

            // Process complete lines (AG-UI events are typically newline-delimited JSON)
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? ''; // Keep incomplete line in buffer

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#')) {
                continue; // Skip empty lines and comments
              }

              try {
                const event: AGUIEvent = JSON.parse(trimmed);
                const chunks = convertAgUiEventToChunks(event, {
                  currentMessageId,
                  currentToolCallId,
                  toolCallStates,
                });

                // Update tracking state
                if (event.type === 'TEXT_MESSAGE_START') {
                  currentMessageId = event.messageId;
                }

                if (event.type === 'TOOL_CALL_START') {
                  currentToolCallId = event.toolCallId;
                  toolCallStates.set(event.toolCallId, {
                    name: event.toolCallName,
                    args: '',
                  });
                }

                if (event.type === 'TOOL_CALL_ARGS' && currentToolCallId) {
                  const state = toolCallStates.get(currentToolCallId);
                  if (state) {
                    state.args += event.delta;
                  }
                }

                // Enqueue all converted chunks
                for (const chunk of chunks) {
                  controller.enqueue(chunk);
                }
              } catch (err) {
                console.error('Failed to parse AG-UI event:', trimmed, err);
                // Continue processing other events
              }
            }
          }

          // Stream finished successfully
          controller.close();
        } catch (error) {
          controller.error(error);
        } finally {
          reader.releaseLock();
        }
      },
      cancel: () => {
        // Clean up the stored stream reference when the stream is cancelled
        this.activeStreams.delete(chatId);
      },
    });
  }

  /**
   * Converts AI SDK UI messages to AG-UI message format.
   */
  private convertToAgUiMessages(messages: UI_MESSAGE[]): any[] {
    return messages.map((message) => {
      const role = message.role === 'user' ? 'user' : message.role === 'assistant' ? 'assistant' : 'system';

      // Extract text content from parts or fallback to content
      let textContent = '';
      if (message.parts) {
        textContent = message.parts
          .filter((part) => part.type === 'text')
          .map((part: any) => part.text)
          .join('');
      } else if ('content' in message) {
        textContent = (message as any).content;
      }

      const result: any = {
        role,
        content: textContent,
      };

      // Include tool calls if present
      if ('toolInvocations' in message && (message as any).toolInvocations) {
        result.toolCalls = (message as any).toolInvocations.map((tool: any) => ({
          toolCallId: tool.toolCallId,
          toolName: tool.toolName,
          args: tool.args,
          result: tool.result,
        }));
      }

      return result;
    });
  }

  /**
   * Resolves headers from static object or function.
   */
  private async resolveHeaders(): Promise<Record<string, string>> {
    if (!this.headers) {
      return {};
    }

    if (typeof this.headers === 'function') {
      return await this.headers();
    }

    return this.headers;
  }
}

/**
 * Converts a single AG-UI event to one or more AI SDK UI message chunks.
 */
function convertAgUiEventToChunks(
  event: AGUIEvent,
  state: {
    currentMessageId?: string;
    currentToolCallId?: string;
    toolCallStates: Map<string, { name: string; args: string }>;
  },
): UIMessageChunk[] {
  const chunks: UIMessageChunk[] = [];

  switch (event.type) {
    case 'RUN_STARTED':
      // Start of a new message
      chunks.push({
        type: 'start',
        messageId: undefined, // Will be set by TEXT_MESSAGE_START
      });
      break;

    case 'TEXT_MESSAGE_START':
      chunks.push({
        type: 'text-start',
        id: event.messageId,
      });
      break;

    case 'TEXT_MESSAGE_CONTENT':
      chunks.push({
        type: 'text-delta',
        id: event.messageId,
        delta: event.delta,
      });
      break;

    case 'TEXT_MESSAGE_END':
      chunks.push({
        type: 'text-end',
        id: event.messageId,
      });
      break;

    case 'TOOL_CALL_START':
      chunks.push({
        type: 'tool-input-start',
        toolCallId: event.toolCallId,
        toolName: event.toolCallName,
      });
      break;

    case 'TOOL_CALL_ARGS':
      chunks.push({
        type: 'tool-input-delta',
        toolCallId: event.toolCallId,
        inputTextDelta: event.delta,
      });
      break;

    case 'TOOL_CALL_END':
      {
        const toolState = state.toolCallStates.get(event.toolCallId);
        if (toolState) {
          try {
            const parsedArgs = JSON.parse(toolState.args);
            chunks.push({
              type: 'tool-input-available',
              toolCallId: event.toolCallId,
              toolName: toolState.name,
              input: parsedArgs,
            });
          } catch {
            // If parsing fails, send error chunk
            chunks.push({
              type: 'tool-input-error',
              toolCallId: event.toolCallId,
              toolName: toolState.name,
              input: toolState.args,
              errorText: 'Failed to parse tool arguments',
            });
          }
        }
      }
      break;

    case 'TOOL_CALL_RESULT':
      chunks.push({
        type: 'tool-output-available',
        toolCallId: event.toolCallId,
        output: typeof event.content === 'string' ? event.content : event.content,
      });
      break;

    case 'STATE_SNAPSHOT':
      chunks.push({
        type: 'data-state',
        data: event.snapshot,
      } as any);
      break;

    case 'STATE_DELTA':
      // Convert state delta to data parts
      chunks.push({
        type: 'data-state-delta',
        data: event.delta,
      } as any);
      break;

    case 'RUN_FINISHED':
      {
        const finishReason = event.outcome?.type === 'success' ? 'stop' : 'error';
        chunks.push({
          type: 'finish',
          finishReason,
        });

        // Include token usage if available
        if (event.usage) {
          chunks.push({
            type: 'data-usage',
            data: event.usage,
          } as any);
        }
      }
      break;

    case 'RUN_ERROR':
      chunks.push({
        type: 'error',
        errorText: event.message || 'Unknown error',
      });
      break;

    case 'REASONING_START':
      if (event.messageId) {
        chunks.push({
          type: 'reasoning-start',
          id: event.messageId,
        });
      }
      break;

    case 'REASONING_MESSAGE_CONTENT':
      if (event.messageId) {
        chunks.push({
          type: 'reasoning-delta',
          id: event.messageId,
          delta: event.delta,
        });
      }
      break;

    case 'REASONING_END':
      if (event.messageId) {
        chunks.push({
          type: 'reasoning-end',
          id: event.messageId,
        });
      }
      break;

    case 'SUBAGENT_STARTED':
    case 'SUBAGENT_FINISHED':
    case 'SUBAGENT_ERROR':
      // Map subagent events to custom data parts
      chunks.push({
        type: 'data-subagent',
        data: {
          type: event.type,
          subagentId: (event as any).subagentId,
          outcome: (event as any).outcome,
        },
      } as any);
      break;

    // Other AG-UI events can be added as needed
    default:
      // For unhandled events, optionally emit as custom chunks
      break;
  }

  return chunks;
}

/**
 * Hook to access AG-UI shared state from a useChat instance.
 * Use this alongside useChat to access the AG-UI agent's shared state.
 *
 * @example
 * ```tsx
 * const { messages } = useChat({ transport });
 * const state = useAgUiState(messages);
 * ```
 */
export function useAgUiState(messages: UIMessage[]): State | null {
  // Extract the latest state from data parts
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.parts) {
      for (const part of message.parts) {
        if ((part as any).type === 'data-state') {
          return (part as any).data;
        }
      }
    }
  }
  return null;
}
