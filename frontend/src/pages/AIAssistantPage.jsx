import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Bot,
  User,
  Send,
  Wrench,
  ChevronDown,
  ChevronRight,
  Loader2,
  Plus,
  MessageSquare,
  AlertCircle,
  Sparkles,
} from 'lucide-react'

const QUICK_PROMPTS = [
  'Give me the fleet health summary',
  'Analyze Machine-004 vibration trend',
  'Which machines need urgent attention?',
  'Check recent maintenance logs',
]

function createMessageId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function formatConversationDate(isoString) {
  return new Date(isoString).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

async function postChat(conversationId, message) {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversation_id: conversationId, message }),
  })
  if (!response.ok) {
    throw new Error(`Backend responded with status ${response.status}`)
  }
  return response.json()
}

async function fetchConversations() {
  const response = await fetch('/api/conversations')
  if (!response.ok) {
    throw new Error(`Backend responded with status ${response.status}`)
  }
  return response.json()
}

async function fetchConversationDetail(conversationId) {
  const response = await fetch(`/api/conversations/${conversationId}`)
  if (!response.ok) {
    throw new Error(`Backend responded with status ${response.status}`)
  }
  return response.json()
}

function ToolTraceItem({ step }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="overflow-hidden rounded-lg border border-blue-100 bg-blue-50/60">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <span className="flex items-center gap-2 text-xs font-medium text-blue-700">
          <Wrench className="h-3.5 w-3.5" />
          {step.tool}
        </span>
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-blue-400" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-blue-400" />
        )}
      </button>
      {expanded && (
        <div className="space-y-2 border-t border-blue-100 px-3 py-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-400">Input</p>
            <pre className="mt-1 overflow-x-auto rounded bg-blue-950 px-2 py-1.5 text-[11px] text-blue-100">
              {JSON.stringify(step.input, null, 2)}
            </pre>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-400">Output</p>
            <pre className="mt-1 max-h-40 overflow-auto rounded bg-blue-950 px-2 py-1.5 text-[11px] text-blue-100">
              {typeof step.output === 'string' ? step.output : JSON.stringify(step.output, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}

function ToolTracePanel({ trace }) {
  const [open, setOpen] = useState(false)

  if (!trace || trace.length === 0) return null

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-1.5 text-xs font-medium text-blue-500 hover:text-blue-700"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        {trace.length} tool call{trace.length > 1 ? 's' : ''}
      </button>
      {open && (
        <div className="mt-2 space-y-1.5">
          {trace.map((step, index) => (
            <ToolTraceItem key={`${step.tool}-${index}`} step={step} />
          ))}
        </div>
      )}
    </div>
  )
}

function ChatBubble({ message }) {
  const isUser = message.role === 'user'
  const isError = message.role === 'error'

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      <div
        className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${
          isUser ? 'bg-blue-600' : isError ? 'bg-red-100' : 'bg-blue-100'
        }`}
      >
        {isUser ? (
          <User className="h-4 w-4 text-white" />
        ) : isError ? (
          <AlertCircle className="h-4 w-4 text-red-600" />
        ) : (
          <Bot className="h-4 w-4 text-blue-600" />
        )}
      </div>
      <div className={`flex max-w-[75%] flex-col ${isUser ? 'items-end' : 'items-start'}`}>
        <div
          className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
            isUser
              ? 'rounded-tr-sm bg-blue-600 text-white'
              : isError
              ? 'rounded-tl-sm border border-red-200 bg-red-50 text-red-700'
              : 'rounded-tl-sm border border-blue-100 bg-white text-blue-950 shadow-sm'
          }`}
        >
          {isUser || isError ? (
            message.content
          ) : (
            <div className="markdown-body">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
            </div>
          )}
        </div>
        {!isUser && !isError && <ToolTracePanel trace={message.trace} />}
      </div>
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="flex gap-3">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue-100">
        <Bot className="h-4 w-4 text-blue-600" />
      </div>
      <div className="flex items-center gap-1 rounded-2xl rounded-tl-sm border border-blue-100 bg-white px-4 py-3 shadow-sm">
        <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
        <span className="text-xs text-blue-400">Thinking...</span>
      </div>
    </div>
  )
}

export default function AIAssistantPage() {
  const [conversationId, setConversationId] = useState(null)
  const [displayMessages, setDisplayMessages] = useState([])
  const [conversations, setConversations] = useState([])
  const [loadingConversations, setLoadingConversations] = useState(true)
  const [conversationsError, setConversationsError] = useState(null)
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const scrollAnchorRef = useRef(null)
  const location = useLocation()

  const refreshConversationList = useCallback(async () => {
    setLoadingConversations(true)
    try {
      const data = await fetchConversations()
      setConversations(data)
      setConversationsError(null)
    } catch (error) {
      setConversationsError(error.message)
    } finally {
      setLoadingConversations(false)
    }
  }, [])

  useEffect(() => {
    refreshConversationList()
  }, [refreshConversationList])

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [displayMessages, isLoading])

  // Picks up a prefilled question passed via navigate('/assistant', { state: { prefill } })
  // - used by the Watchlist page's "Ask agent" button. Clears the nav state
  // afterward so it doesn't reappear on a later back/forward navigation.
  useEffect(() => {
    if (location.state?.prefill) {
      setInputValue(location.state.prefill)
      window.history.replaceState({}, document.title)
    }
  }, [location.state])

  async function handleSend(rawText) {
    const text = rawText.trim()
    if (!text || isLoading) return

    const optimisticUser = { id: createMessageId(), role: 'user', content: text }
    setDisplayMessages((prev) => [...prev, optimisticUser])
    setInputValue('')
    setIsLoading(true)

    try {
      const data = await postChat(conversationId, text)
      setConversationId(data.conversation_id)
      setDisplayMessages(data.display)
      refreshConversationList()
    } catch (error) {
      setDisplayMessages((prev) => [
        ...prev,
        {
          id: createMessageId(),
          role: 'error',
          content: `Could not reach the assistant backend. ${error.message}`,
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  async function handleSelectConversation(id) {
    if (id === conversationId || isLoading) return
    setIsLoading(true)
    try {
      const data = await fetchConversationDetail(id)
      setConversationId(data.id)
      setDisplayMessages(data.display)
    } catch (error) {
      setDisplayMessages([
        { id: createMessageId(), role: 'error', content: `Could not load that conversation. ${error.message}` },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  function handleNewConversation() {
    setConversationId(null)
    setDisplayMessages([])
    setInputValue('')
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSend(inputValue)
    }
  }

  return (
    <div className="flex h-[calc(100vh-64px)] bg-blue-50/40">
      <aside className="hidden w-72 flex-shrink-0 flex-col border-r border-blue-100 bg-white sm:flex">
        <div className="border-b border-blue-100 p-4">
          <button
            type="button"
            onClick={handleNewConversation}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500"
          >
            <Plus className="h-4 w-4" />
            New conversation
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {loadingConversations && (
            <p className="px-3 py-2 text-xs text-blue-400">Loading conversations...</p>
          )}
          {conversationsError && !loadingConversations && (
            <p className="px-3 py-2 text-xs text-amber-600">
              Could not load history. ({conversationsError})
            </p>
          )}
          {!loadingConversations && !conversationsError && conversations.length === 0 && (
            <p className="px-3 py-2 text-xs text-blue-400">No conversations yet.</p>
          )}
          {conversations.map((conversation) => (
            <button
              key={conversation.id}
              type="button"
              onClick={() => handleSelectConversation(conversation.id)}
              className={`mb-1 flex w-full items-start gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                conversation.id === conversationId
                  ? 'bg-blue-100 text-blue-900'
                  : 'text-blue-700 hover:bg-blue-50'
              }`}
            >
              <MessageSquare className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-400" />
              <span className="flex-1 overflow-hidden">
                <span className="block truncate font-medium">
                  {conversation.title || 'New conversation'}
                </span>
                <span className="block text-xs text-blue-400">
                  {formatConversationDate(conversation.updated_at)}
                </span>
              </span>
            </button>
          ))}
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        <div className="border-b border-blue-100 bg-white px-4 py-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-4xl">
            <h1 className="text-lg font-bold text-blue-950">AI Assistant</h1>
            <p className="text-xs text-blue-500">
              Agent reasoning over MCP tools backed by live fleet data.
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-4xl space-y-5">
            {displayMessages.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
                  <Sparkles className="h-6 w-6 text-blue-600" />
                </div>
                <p className="mt-4 text-sm font-medium text-blue-950">
                  Ask about fleet health, a specific machine, or a failure prediction.
                </p>
                <p className="mt-1 text-xs text-blue-400">
                  The assistant will call MCP tools as needed and show its reasoning trace.
                </p>
                <div className="mt-6 flex flex-wrap justify-center gap-2">
                  {QUICK_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => handleSend(prompt)}
                      className="rounded-full border border-blue-200 bg-white px-3.5 py-1.5 text-xs font-medium text-blue-600 shadow-sm hover:bg-blue-50"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {displayMessages.map((message) => (
              <ChatBubble key={message.id} message={message} />
            ))}

            {isLoading && <TypingIndicator />}
            <div ref={scrollAnchorRef} />
          </div>
        </div>

        <div className="border-t border-blue-100 bg-white px-4 py-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-4xl">
            {displayMessages.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {QUICK_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => handleSend(prompt)}
                    disabled={isLoading}
                    className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-600 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-end gap-2 rounded-xl border border-blue-200 bg-white p-2 shadow-sm focus-within:border-blue-400">
              <textarea
                value={inputValue}
                onChange={(event) => setInputValue(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about fleet health, a specific machine, or a failure prediction..."
                rows={1}
                className="max-h-32 flex-1 resize-none border-0 bg-transparent px-2 py-1.5 text-sm text-blue-950 placeholder:text-blue-300 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => handleSend(inputValue)}
                disabled={isLoading || !inputValue.trim()}
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-200"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}