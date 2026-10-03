'use client';

import { useChat } from '@ai-sdk/react';
import { AgUiChatTransport } from 'ag-ui-chat-transport';
import { useState, useMemo } from 'react';

export default function Home() {
  // Create the transport inside the component
  const transport = useMemo(() => {
    console.log('[Page] Creating AgUiChatTransport instance');
    return new AgUiChatTransport({
      api: '/api/agent',
    });
  }, []);

  const { messages, sendMessage, status, error } = useChat({
    id: 'demo-chat',
    transport,
  });

  const [input, setInput] = useState('');
  const isLoading = status === 'submitted' || status === 'streaming';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    
    const userMessage = input;
    setInput('');
    
    console.log('[Page] Calling sendMessage with:', userMessage);
    await sendMessage({ role: 'user', content: userMessage });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
            AG-UI Chat Transport Demo
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Vercel AI SDK UI powered by AG-UI protocol
          </p>
        </div>

        {/* Chat Container */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden">
          {/* Messages */}
          <div className="h-[600px] overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && (
              <div className="text-center text-gray-500 dark:text-gray-400 mt-10">
                <p className="text-lg mb-4">👋 Welcome! Start a conversation.</p>
                <div className="space-y-2 text-sm">
                  <p>Try asking:</p>
                  <ul className="space-y-1">
                    <li>• "What's the weather like?"</li>
                    <li>• "Hello, how are you?"</li>
                    <li>• "Tell me a joke"</li>
                  </ul>
                </div>
              </div>
            )}

            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-2 ${
                    message.role === 'user'
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white'
                  }`}
                >
                  <div className="text-xs font-semibold mb-1 opacity-70">
                    {message.role === 'user' ? 'You' : 'AG-UI Agent'}
                  </div>
                  
                  {/* Main content */}
                  <div className="whitespace-pre-wrap break-words">
                    {message.parts
                      ?.filter((part) => part.type === 'text')
                      .map((part: any, idx: number) => (
                        <span key={idx}>{part.text}</span>
                      )) || message.content}
                  </div>

                  {/* Tool invocations */}
                  {message.toolInvocations && message.toolInvocations.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {message.toolInvocations.map((tool: any) => (
                        <div
                          key={tool.toolCallId}
                          className="text-xs bg-gray-200 dark:bg-gray-600 rounded p-2"
                        >
                          <div className="font-semibold mb-1">
                            🔧 Tool: {tool.toolName}
                          </div>
                          {tool.state === 'result' && tool.result && (
                            <div className="opacity-80">
                              Result: {JSON.stringify(tool.result, null, 2)}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Data parts (state, usage, etc.) */}
                  {message.parts
                    ?.filter((part: any) => part.type?.startsWith('data-'))
                    .map((part: any, idx: number) => (
                      <div
                        key={idx}
                        className="mt-2 text-xs bg-gray-200 dark:bg-gray-600 rounded p-2"
                      >
                        <div className="font-semibold">{part.type}</div>
                        <pre className="mt-1 opacity-80 overflow-x-auto">
                          {JSON.stringify(part.data, null, 2)}
                        </pre>
                      </div>
                    ))}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 dark:bg-gray-700 rounded-lg px-4 py-2">
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100" />
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200" />
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 rounded-lg px-4 py-2">
                <div className="font-semibold">Error</div>
                <div className="text-sm">{error.message}</div>
              </div>
            )}
          </div>

          {/* Input Form */}
          <form onSubmit={handleSubmit} className="border-t border-gray-200 dark:border-gray-700 p-4">
            <div className="flex space-x-2">
              <input
                type="text"
                value={input}
                onChange={handleInputChange}
                placeholder="Type your message..."
                disabled={isLoading}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={isLoading || !input || !input.trim()}
                className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? 'Sending...' : 'Send'}
              </button>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
          <p>
            Built with{' '}
            <a
              href="https://sdk.vercel.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:underline"
            >
              Vercel AI SDK
            </a>{' '}
            and{' '}
            <a
              href="https://github.com/ag-ui-protocol/ag-ui"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:underline"
            >
              AG-UI Protocol
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
