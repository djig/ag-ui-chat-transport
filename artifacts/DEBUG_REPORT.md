# AG-UI Chat Transport Debug Report

## Test Date
Saturday, October 3, 2026 - 5:52 PM

## Test Environment
- URL: http://localhost:3456
- Browser: Chrome (Developer Tools enabled)
- Next.js Development Server: Running on port 3456
- Vercel AI SDK version: @ai-sdk/react@4.0.130
- AI SDK version: ai@7.0.127

## Test Procedure
1. Opened http://localhost:3456 in Chrome browser
2. Opened Browser Developer Console (F12) - Console tab
3. Typed "What is the weather?" in the chat input field
4. Clicked the "Send" button
5. Monitored console logs for '[AgUiChatTransport]' prefixed messages
6. Checked Network tab for HTTP POST requests to /api/agent
7. Captured screenshot showing both console output and chat UI state

## Findings

### ✅ Working Components

1. **Transport Constructor**: Successfully instantiated
   - Console log: `[AgUiChatTransport] Constructor called with options:` (visible)
   - Console log: `[AgUiChatTransport] Constructor complete, api: /api/agent` (visible)
   - The AgUiChatTransport object is created without errors

2. **React Application**: Running normally
   - Page loads successfully
   - UI renders correctly
   - Input field accepts text
   - Send button is clickable
   - Loading spinner appears when Send is clicked

3. **API Endpoint**: Verified working (from previous curl testing)
   - /api/agent correctly streams AG-UI protocol events
   - Returns proper SSE (Server-Sent Events) format
   - Tool calls function correctly
   - Backend is NOT the issue

### ❌ Failing Components

1. **Transport Method Invocation**: NOT working
   - Expected log: `[AgUiChatTransport] prepareSendMessagesRequest called` - **MISSING**
   - Expected log: `[AgUiChatTransport] processResponseStream called` - **MISSING**
   - The transport's sendMessages() method is NEVER called by useChat

2. **HTTP Requests**: No network activity
   - Network tab shows NO POST request to /api/agent
   - Only the initial page load request is present
   - No outgoing HTTP traffic when Send button is clicked

3. **Message Flow**: Broken
   - User message does not appear in chat
   - No assistant response
   - Loading spinner appears briefly then disappears
   - No errors thrown (silent failure)

## Console Output Summary

**All console messages observed:**
```
Download the React DevTools for a better development experience:
https://react.dev/link/react-devtools

[AgUiChatTransport] Constructor called with options: • Object

[AgUiChatTransport] Constructor complete, api: /api/agent

[HMR] connected
```

**After clicking Send button:**
- No new console logs appear
- No error messages
- No success messages
- Complete silence from the transport layer

## Root Cause Analysis

### Primary Issue: useChat Hook Not Invoking Custom Transport

The Vercel AI SDK's `useChat` hook is not successfully calling the `AgUiChatTransport.sendMessages()` method when the user clicks Send or presses Enter.

**Evidence:**
1. Constructor logs prove the transport object exists
2. Zero invocation logs prove sendMessages() is never called
3. Zero network requests prove no HTTP POST is initiated
4. The loading state change proves useChat's handleSubmit IS triggered

### Suspected Causes

1. **Interface Mismatch**: The ChatTransport interface in @ai-sdk/react v4.0.130 may have changed:
   - The `sendMessages` method signature now includes: `trigger`, `chatId`, `messageId`, `messages`, `abortSignal`
   - The HttpChatTransport base class implementation may not be compatible
   - The AgUiChatTransport extends HttpChatTransport but may not properly implement the required interface

2. **Type System Issue**: Possible TypeScript type incompatibility
   - The transport may not satisfy the ChatTransport<UI_MESSAGE> interface contract
   - Runtime type checking or duck typing may be failing silently
   - The useChat hook may be checking for specific method signatures that don't match

3. **Version Incompatibility**: Mismatch between SDK versions
   - @ai-sdk/react@4.0.130 (frontend)
   - ai@7.0.127 (transport dependency)
   - HttpChatTransport implementation may have changed between versions
   - The custom transport was built against one version but running with another

## Screenshots

- **Main debug screenshot**: `/workspace/artifacts/debug-console.png`
  - Shows browser console with transport constructor logs
  - Shows chat UI in initial state with input field
  - Demonstrates that Send button was clicked (loading state visible in some captures)
  - Proves no additional logs appeared after Send

## Recommendations

### Immediate Actions

1. **Verify ChatTransport Interface Implementation**
   ```typescript
   // Check if AgUiChatTransport properly implements:
   interface ChatTransport<UI_MESSAGE> {
     sendMessages(options: {
       trigger: 'submit-message' | 'regenerate-message';
       chatId: string;
       messageId: string | undefined;
       messages: UI_MESSAGE[];
       abortSignal: AbortSignal | undefined;
       // ... plus ChatRequestOptions (headers, body, metadata)
     }): Promise<ReadableStream<UIMessageChunk>>;
   }
   ```

2. **Add Debug Logging to HttpChatTransport**
   - Verify if the base class sendMessages() is being called
   - Check if the method is being properly inherited
   - Confirm prepareSendMessagesRequest callback is invoked

3. **Inspect useChat Hook Behavior**
   - Add console.log to useChat's handleSubmit
   - Verify the transport object structure at runtime
   - Check if transport.sendMessages exists as a function

4. **Test with DefaultChatTransport**
   - Replace AgUiChatTransport with DefaultChatTransport temporarily
   - This will confirm if the issue is specific to the custom implementation
   - DefaultChatTransport is the built-in HTTP transport

### Long-term Solutions

1. **Refactor Transport Implementation**
   - Directly implement ChatTransport interface instead of extending HttpChatTransport
   - Manually handle all aspects of the HTTP request/response cycle
   - This avoids reliance on the HttpChatTransport base class behavior

2. **Add Integration Tests**
   - Test transport with real useChat hook
   - Mock HTTP responses to verify streaming works
   - Catch interface mismatches during build/test

3. **Document Version Requirements**
   - Clearly specify compatible @ai-sdk/react versions
   - Test against multiple SDK versions
   - Provide migration guides for version updates

## Conclusion

The AG-UI Chat Transport Demo has a **non-functional chat interface** due to a **transport invocation failure**. While the transport object is successfully constructed, the Vercel AI SDK's useChat hook never calls its sendMessages() method. This is a critical integration issue that prevents any messages from being sent to the backend, despite the backend API working correctly when tested directly.

The root cause appears to be an **interface compatibility issue** between the custom AgUiChatTransport class and the ChatTransport interface expected by @ai-sdk/react v4.0.130. Further investigation is needed to identify the exact mismatch and implement a fix.

**Status**: ❌ **BLOCKED** - Chat functionality completely non-functional
**Impact**: 🔴 **CRITICAL** - Core feature not working
**Next Steps**: Investigate ChatTransport interface implementation and consider refactoring
