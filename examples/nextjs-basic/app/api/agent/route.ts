import { NextResponse } from 'next/server';

/**
 * Mock AG-UI agent endpoint
 * This simulates an AG-UI protocol server (like LangGraph, Mastra, etc.)
 * using the official SSE (Server-Sent Events) format.
 */
export async function POST(request: Request) {
  const body = await request.json();
  const { messages } = body;

  // Get the last user message
  const lastMessage = messages[messages.length - 1];
  const userInput = lastMessage?.content || '';

  // Create a streaming response with AG-UI events in SSE format
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    async start(controller) {
      // Helper to send SSE event
      const sendEvent = (data: any) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        // Send RUN_STARTED event
        sendEvent({
          type: 'RUN_STARTED',
          runId: `run-${Date.now()}`,
          timestamp: Date.now(),
        });

        await delay(100);

        // Check if user is asking about weather (tool call scenario)
        if (userInput.toLowerCase().includes('weather')) {
          const toolCallId = 'tool-' + Date.now();
          
          sendEvent({
            type: 'TOOL_CALL_START',
            toolCallId,
            toolCallName: 'get_weather',
            timestamp: Date.now(),
          });

          await delay(50);

          // Stream tool arguments
          const argsChunks = [`{"location": "`, 'San Francisco', `"}`];
          
          for (const chunk of argsChunks) {
            sendEvent({
              type: 'TOOL_CALL_ARGS',
              toolCallId,
              delta: chunk,
              timestamp: Date.now(),
            });
            await delay(30);
          }

          sendEvent({
            type: 'TOOL_CALL_END',
            toolCallId,
            timestamp: Date.now(),
          });

          await delay(100);

          // Return tool result
          sendEvent({
            type: 'TOOL_CALL_RESULT',
            toolCallId,
            messageId: 'tool-msg-' + Date.now(),
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
            timestamp: Date.now(),
          });

          await delay(50);
        }

        // Start text message
        const messageId = 'msg-' + Date.now();
        sendEvent({
          type: 'TEXT_MESSAGE_START',
          messageId,
          role: 'assistant',
          timestamp: Date.now(),
        });

        await delay(50);

        // Generate response based on input
        let response = '';
        if (userInput.toLowerCase().includes('weather')) {
          response = 'Based on the weather data, it looks like it\'s a beautiful sunny day in San Francisco with a temperature of 72°F and 45% humidity. Perfect weather for outdoor activities!';
        } else if (userInput.toLowerCase().includes('hello') || userInput.toLowerCase().includes('hi')) {
          response = 'Hello! I\'m an AG-UI agent connected through the ag-ui-chat-transport library. I can help you with various tasks. Try asking me about the weather!';
        } else {
          response = `You said: "${userInput}". I'm a demo AG-UI agent. Try asking me about the weather to see tool calls in action!`;
        }

        // Stream the response word by word
        const words = response.split(' ');
        for (let i = 0; i < words.length; i++) {
          const chunk = (i === 0 ? '' : ' ') + words[i];
          
          sendEvent({
            type: 'TEXT_MESSAGE_CONTENT',
            messageId,
            delta: chunk,
            timestamp: Date.now(),
          });

          await delay(50);
        }

        // End text message
        sendEvent({
          type: 'TEXT_MESSAGE_END',
          messageId,
          timestamp: Date.now(),
        });

        await delay(50);

        // Send RUN_FINISHED event
        sendEvent({
          type: 'RUN_FINISHED',
          runId: `run-${Date.now()}`,
          threadId: 'thread-1',
          outcome: {
            type: 'success',
          },
          usage: [
            {
              inputTokens: Math.floor(userInput.length / 4),
              outputTokens: Math.floor(response.length / 4),
              totalTokens: Math.floor((userInput.length + response.length) / 4),
            },
          ],
          timestamp: Date.now(),
        });

        controller.close();
      } catch (error) {
        sendEvent({
          type: 'RUN_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
          timestamp: Date.now(),
        });
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
