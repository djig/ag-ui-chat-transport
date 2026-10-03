import { HttpChatTransport } from 'ai';
import type { UIMessage, UIMessageChunk } from 'ai';
import type { AGUIEvent, State } from '@ag-ui/core';

/**
 * Configuration options for the AG-UI Chat Transport.
 */
export interface AgUiChatTransportOptions {
  /**
   * The URL of the AG-UI agent endpoint.
   * This should point to your AG-UI protocol server (e.g., LangGraph, Mastra, ADK, etc.)
   */
  api?: string;

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
 *       api: 'http://localhost:8000/agent',
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
export class AgUiChatTransport<UI_MESSAGE extends UIMessage = UIMessage> extends HttpChatTransport<UI_MESSAGE> {
  private readonly threadId?: string;

  constructor(options: AgUiChatTransportOptions = {}) {
    super({
      api: options.api ?? '/api/agent',
      headers: options.headers,
      fetch: options.fetch,
      credentials: options.credentials,
      prepareSendMessagesRequest: (options) => {
        // Convert AI SDK messages to AG-UI format
        const agUiMessages = options.messages.map((message) => {
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

        return {
          body: {
            threadId: this.threadId ?? options.id,
            messages: agUiMessages,
            ...options.body,
          },
        };
      },
    });
    this.threadId = options.threadId;
  }

  /**
   * Processes the AG-UI SSE response stream and transforms it into AI SDK UI message chunks.
   * This method is called by HttpChatTransport.sendMessages after the fetch completes.
   */
  protected processResponseStream(
    agUiStream: ReadableStream<Uint8Array>,
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

            // Process SSE events (separated by double newlines)
            const parts = buffer.split('\n\n');
            buffer = parts.pop() ?? ''; // Keep incomplete event in buffer

            for (const part of parts) {
              const trimmed = part.trim();
              if (!trimmed) continue;

              // Parse SSE format: data: {...}
              const lines = trimmed.split('\n');
              const dataLines: string[] = [];
              
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  dataLines.push(line.slice(6)); // Remove 'data: ' prefix
                } else if (line.startsWith('data:')) {
                  dataLines.push(line.slice(5)); // Remove 'data:' prefix
                }
                // Ignore other SSE fields (event, id, retry, comments)
              }

              if (dataLines.length === 0) continue;

              // Join multi-line data fields
              const jsonStr = dataLines.join('\n');

              try {
                const event: AGUIEvent = JSON.parse(jsonStr);
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
                console.error('Failed to parse AG-UI event:', jsonStr, err);
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
        // Stream cancelled by the client
      },
    });
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
        dynamic: true,
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
              dynamic: true,
            });
          } catch {
            // If parsing fails, send error chunk
            chunks.push({
              type: 'tool-input-error',
              toolCallId: event.toolCallId,
              toolName: toolState.name,
              input: toolState.args,
              errorText: 'Failed to parse tool arguments',
              dynamic: true,
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
        dynamic: true,
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
