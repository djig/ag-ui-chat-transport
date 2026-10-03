# AG-UI Chat Transport Demo - Test Results

## Test Date
Saturday, October 3, 2026 - 6:05 PM

## Test Scenario
Sent message: **"What is the weather?"** to test basic chat and tool calling functionality.

---

## ✅ **WORKING FEATURES**

### 1. **Chat Messaging** ✓
- User can type messages in the input field
- Messages are sent when clicking "Send" button
- User messages appear in the chat (blue bubble)
- Assistant responses stream back and display correctly

### 2. **Text Streaming** ✓
- Assistant response streams word-by-word from the backend
- Text appears progressively in the UI
- Confirmed by EventStream showing multiple `TEXT_MESSAGE_CONTENT` events
- Response: "Based on the weather data, it looks like it's a beautiful sunny day in San Francisco with a temperature of 72°F and 45% humidity. Perfect weather for outdoor activities!"

### 3. **Backend Tool Calling** ✓
- The `get_weather` tool was successfully invoked by the backend
- Confirmed in Network tab → EventStream showing:
  - `TOOL_CALL_START`
  - `TOOL_CALL_ARGS` (multiple events)
  - `TOOL_CALL_END`
  - `TOOL_CALL_RESULT`
- Tool returned weather data: 72°F temperature, 45% humidity for San Francisco

### 4. **HTTP Communication** ✓
- POST request to `/api/agent` endpoint works correctly
- Status: 200 OK
- Content-Type: `text/event-stream` (proper SSE streaming)
- Request payload correctly formatted with threadId and messages

### 5. **AG-UI Protocol Integration** ✓
- Backend correctly implements AG-UI protocol
- Streams all required event types:
  - `RUN_STARTED`
  - `TOOL_CALL_*` events
  - `TEXT_MESSAGE_*` events  
  - `RUN_FINISHED`
- Token usage tracking works (inputTokens: 5, outputTokens: 42, totalTokens: 47)

### 6. **Transport Implementation** ✓
- `AgUiChatTransport` constructor executes successfully
- Console logs show:
  - `[Page] Creating AgUiChatTransport instance`
  - `[AgUiChatTransport] Constructor called with options`
  - `[AgUiChatTransport] Constructor complete, api: /api/agent`
  - `[Page] Calling sendMessage with: What is the weather?`
  - `[AgUiChatTransport] prepareSendMessagesRequest called with 1 messages`
  - `[AgUiChatTransport] processResponseStream called`
- All transport methods are now being invoked correctly

### 7. **Data Parts Display** ✓
- Usage data appears in a grey box labeled "data-usage"
- Shows token counts in JSON format
- Properly styled and formatted

---

## ❌ **NOT WORKING / MISSING FEATURES**

### 1. **Tool Invocation UI Display** ✗
**Issue**: Tool calls are NOT displayed in the chat UI as separate boxes/components.

**Expected**: Should show a box like:
```
🔧 Tool: get_weather
Args: { location: "San Francisco" }
Result: { temperature: 72, condition: "sunny", humidity: 45 }
```

**Actual**: No tool invocation box appears in the UI at all.

**Why**: The page.tsx component checks for `message.toolInvocations` array to render tool boxes, but this property is not being populated by the transport. The AG-UI protocol emits tool events, but they're not being converted into the `toolInvocations` format expected by the Vercel AI SDK's UIMessage structure.

**Impact**: Users cannot see:
- Which tools were called
- What parameters were passed to tools
- What results the tools returned

The assistant's text response mentions "based on the weather data" but users have no visibility into the actual tool execution.

---

## 📊 **Detailed Observations**

### Console Logs (Full Sequence)
```
[Page] Creating AgUiChatTransport instance
[AgUiChatTransport] Constructor called with options: { api: "/api/agent" }
[AgUiChatTransport] Constructor complete, api: /api/agent
[Page] Calling sendMessage with: What is the weather?
[AgUiChatTransport] prepareSendMessagesRequest called with 1 messages
[AgUiChatTransport] processResponseStream called
```

### Network Activity
- **Request**: POST http://localhost:3456/api/agent
- **Request Body**:
  ```json
  {
    "threadId": "demo-chat",
    "messages": [{
      "role": "user",
      "content": "What is the weather?"
    }]
  }
  ```
- **Response**: 200 OK, text/event-stream
- **Size**: 5.1 kB
- **Timing**: ~2 seconds

### AG-UI Events Received (from EventStream)
1. `TOOL_CALL_START`
2. `TOOL_CALL_ARGS` (multiple chunks)
3. `TOOL_CALL_END`
4. `TOOL_CALL_RESULT`
5. `TEXT_MESSAGE_START`
6. `TEXT_MESSAGE_CONTENT` (multiple chunks - streaming text)
7. `TEXT_MESSAGE_END`
8. `RUN_FINISHED`

### UI Message Structure
The assistant message displays:
- Role: "AG-UI Agent"
- Text content: Full response about weather
- Data part: "data-usage" with token counts

Missing:
- `toolInvocations` array
- Tool call visualization

---

## 🔍 **Root Cause Analysis**

### Why Tool Invocations Don't Display

The issue is in the `convertAgUiEventToChunks` function in `ag-ui-chat-transport.ts`. 

**Current behavior**: The function converts AG-UI events to UIMessageChunk types like:
- `tool-input-start`
- `tool-input-delta`
- `tool-input-available`
- `tool-output-available`

**Problem**: The Vercel AI SDK's `useChat` hook expects these chunks to be processed into a `toolInvocations` array on the message object. However, the current implementation may not be properly accumulating tool data or the AI SDK version being used may not support tool chunks in this format.

**From page.tsx** (lines 75-92):
```tsx
{message.toolInvocations && message.toolInvocations.length > 0 && (
  <div className="mt-3 space-y-2">
    {message.toolInvocations.map((tool: any) => (
      <div key={tool.toolCallId} className="text-xs bg-gray-200 dark:bg-gray-600 rounded p-2">
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
```

This code is never executed because `message.toolInvocations` is undefined or empty.

---

## 🎯 **Success Criteria Assessment**

| Criteria | Status | Notes |
|----------|--------|-------|
| Send message | ✅ PASS | Message sent successfully |
| Receive response | ✅ PASS | Response received and displayed |
| Text streaming | ✅ PASS | Text streams word-by-word |
| Tool called | ✅ PASS | Backend invoked get_weather tool |
| Tool result used | ✅ PASS | Response includes weather data |
| Tool UI display | ❌ FAIL | Tool box not shown in UI |
| Console logs | ✅ PASS | Transport logs appear correctly |
| Network request | ✅ PASS | POST to /api/agent successful |
| EventStream events | ✅ PASS | All AG-UI events present |

**Overall Status**: ⚠️ **PARTIAL SUCCESS** (7/9 criteria met)

---

## 📝 **Recommendations**

### Immediate Fixes Needed

1. **Fix Tool Invocation Display**
   - Debug why `message.toolInvocations` is not being populated
   - Check if the AI SDK version supports the tool chunk format being sent
   - May need to modify `convertAgUiEventToChunks` to match the expected format
   - Consider logging the full message object to see its structure

2. **Add Debug Logging**
   - Log the full message structure in the component
   - Log tool chunks as they're being processed
   - Verify the toolInvocations array is being created

3. **Test with Simple Tool Call**
   - Create a minimal test case with just tool display
   - Verify the AI SDK's expected format for toolInvocations

### Future Enhancements

1. **Error Handling**
   - Display errors if tool calls fail
   - Show loading state while tools execute

2. **Tool Call Transparency**
   - Always show which tools were invoked
   - Display tool execution time
   - Show intermediate results for multi-step tool chains

3. **Visual Polish**
   - Add icons for different tool types
   - Syntax highlighting for tool results
   - Expandable/collapsible tool details

---

## 📸 **Screenshots**

- **Working Chat**: `/workspace/artifacts/chat-working.png`
  - Shows user message, assistant response, and usage data
  - Tool invocation box is noticeably absent

- **Network EventStream**: Visible in DevTools
  - All AG-UI protocol events are present and correct
  - Confirms backend is functioning perfectly

---

## ✅ **Conclusion**

The AG-UI Chat Transport Demo is **MOSTLY WORKING**:

**✅ Core functionality**:
- Message sending/receiving ✓
- Text streaming ✓  
- Backend tool calling ✓
- Protocol integration ✓

**❌ Missing feature**:
- Tool invocation UI display ✗

The transport layer successfully bridges the Vercel AI SDK to the AG-UI protocol backend. The backend correctly executes tools and streams responses. However, the frontend UI fails to display tool invocation information, reducing transparency for users who need to understand what tools are being called and what data they're returning.

**Recommendation**: This is a **HIGH PRIORITY** fix as tool transparency is a core feature of agent UIs. Users should always be able to see what tools are being executed on their behalf.
