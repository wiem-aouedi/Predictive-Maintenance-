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
  Trash2,
  AlertCircle,
  Sparkles,
} from 'lucide-react'
import { useToast } from '../components/Toast'

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

function friendlyError(status, detail) {
  const text = (detail || '').toLowerCase()
  const isRateLimit = status === 429 || /\btpm\b|\btpd\b|tokens per (minute|day)/.test(text)
  const isTooLarge = status === 413 || text.includes('reduce your message size')

  if (isRateLimit) {
    return "The assistant is at capacity right now (rate limit reached). Please wait a minute and try again."
  }
  if (isTooLarge) {
    return 'This conversation has grown too large for one request. Start a new conversation or ask a narrower question.'
  }
  if (status === 404) {
    return 'This conversation may have been deleted. Start a new one.'
  }
  if (status >= 500) {
    return detail || `The backend hit an unexpected error (status ${status}).`
  }
  return detail || `The backend returned an unexpected error (status ${status}).`
}

async function postChat(conversationId, message) {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversation_id: conversationId, message }),
  })
  if (!response.ok) {
    let detail = null
    try {
      const body = await response.json()
      detail = body?.detail
    } catch {
      // response body wasn't JSON - fall through with detail = null
    }
    throw new Error(friendlyError(response.status, detail))
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
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <span className="flex items-center gap-2 text-xs font-medium text-accent">
          <Wrench className="h-3.5 w-3.5" />
          <span className="font-mono-data">{step.tool}</span>
        </span>
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted" />
        )}
      </button>
      {expanded && (
        <div className="space-y-2 border-t border-slate-200 px-3 py-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Input</p>
            <pre className="mt-1 overflow-x-auto rounded bg-accent-dark px-2 py-1.5 font-mono-data text-[11px] text-white/90">
              {JSON.stringify(step.input, null, 2)}
            </pre>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Output</p>
            <pre className="mt-1 max-h-40 overflow-auto rounded bg-accent-dark px-2 py-1.5 font-mono-data text-[11px] text-white/90">
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
        className="flex items-center gap-1.5 text-xs font-medium text-muted hover:text-accent"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <span className="font-mono-data">{trace.length}</span> tool call{trace.length > 1 ? 's' : ''}
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
          isUser
            ? 'bg-accent ring-1 ring-white/20'
            : isError
            ? 'bg-red-100 ring-1 ring-red-200'
            : 'bg-accent/10 ring-1 ring-accent/10'
        }`}
      >
        {isUser ? (
          <User className="h-4 w-4 text-white" />
        ) : isError ? (
          <AlertCircle className="h-4 w-4 text-red-600" />
        ) : (
          <Bot className="h-4 w-4 text-accent" />
        )}
      </div>
      <div className={`flex max-w-[75%] flex-col ${isUser ? 'items-end' : 'items-start'}`}>
        <div
          className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
            isUser
              ? 'rounded-tr-sm bg-accent text-white shadow-sm'
              : isError
              ? 'rounded-tl-sm border border-red-200 bg-red-50 text-red-700'
              : 'rounded-tl-sm border border-slate-200 bg-white text-ink shadow-sm'
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
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-accent/10 ring-1 ring-accent/10">
        <Bot className="h-4 w-4 text-accent" />
      </div>
      <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <Loader2 className="h-4 w-4 animate-spin text-accent" />
        <span className="text-xs text-muted">Thinking...</span>
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
  const showToast = useToast()

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
          content: error.message,
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

  async function handleDeleteConversation(id, event) {
    event.stopPropagation()
    const confirmed = window.confirm('Delete this conversation? This cannot be undone.')
    if (!confirmed) return

    try {
      const response = await fetch(`/api/conversations/${id}`, { method: 'DELETE' })
      if (!response.ok) {
        throw new Error(`Backend responded with status ${response.status}`)
      }
      if (id === conversationId) {
        handleNewConversation()
      }
      refreshConversationList()
      showToast('Conversation deleted.', 'success')
    } catch (error) {
      setConversationsError(error.message)
      showToast(`Could not delete conversation. ${error.message}`, 'error')
    }
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSend(inputValue)
    }
  }

  return (
    <div className="flex h-[calc(100vh-64px)] bg-canvas">
      <aside className="hidden w-72 flex-shrink-0 flex-col border-r border-slate-200 bg-white sm:flex">
        <div className="border-b border-slate-200 p-4">
          <button
            type="button"
            onClick={handleNewConversation}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-accent/90"
          >
            <Plus className="h-4 w-4" />
            New conversation
          </button>
        </div>

        <div className="thin-scrollbar flex-1 overflow-y-auto p-2">
          {loadingConversations && (
            <div className="space-y-1.5 p-1">
              <div className="skeleton h-10 w-full rounded-lg" />
              <div className="skeleton h-10 w-full rounded-lg" />
              <div className="skeleton h-10 w-full rounded-lg" />
            </div>
          )}
          {conversationsError && !loadingConversations && (
            <p className="px-3 py-2 text-xs text-amber-600">
              Could not load history. ({conversationsError})
            </p>
          )}
          {!loadingConversations && !conversationsError && conversations.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted">No conversations yet.</p>
          )}
          {conversations.map((conversation) => {
            const isActive = conversation.id === conversationId
            return (
              <div
                key={conversation.id}
                className={`group relative mb-1 flex min-w-0 items-center gap-1 rounded-lg pr-1 transition-colors ${
                  isActive ? 'bg-accent/10' : 'hover:bg-slate-50'
                }`}
              >
                {isActive && (
                  <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-accent" />
                )}
                <button
                  type="button"
                  onClick={() => handleSelectConversation(conversation.id)}
                  className={`flex min-w-0 flex-1 items-start gap-2 rounded-lg px-3 py-2.5 text-left text-sm ${
                    isActive ? 'text-accent' : 'text-ink'
                  }`}
                >
                  <MessageSquare className={`mt-0.5 h-4 w-4 flex-shrink-0 ${isActive ? 'text-accent' : 'text-muted'}`} />
                  <span className="min-w-0 flex-1 overflow-hidden">
                    <span className="block truncate font-medium">
                      {conversation.title || 'New conversation'}
                    </span>
                    <span className="font-mono-data block text-xs text-muted">
                      {formatConversationDate(conversation.updated_at)}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={(event) => handleDeleteConversation(conversation.id, event)}
                  title="Delete conversation"
                  className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-slate-300 opacity-0 transition-opacity hover:bg-red-100 hover:text-red-600 group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            )
          })}
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        <div className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-4xl">
            <h1 className="font-display text-lg font-bold text-ink">AI Assistant</h1>
            <p className="text-xs text-muted">
              Agent reasoning over MCP tools backed by live fleet data.
            </p>
          </div>
        </div>

        <div className="thin-scrollbar flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-4xl space-y-5">
            {displayMessages.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 ring-1 ring-accent/10">
                  <Sparkles className="h-6 w-6 text-accent" />
                </div>
                <p className="font-display mt-4 text-sm font-medium text-ink">
                  Ask about fleet health, a specific machine, or a failure prediction.
                </p>
                <p className="mt-1 text-xs text-muted">
                  The assistant will call MCP tools as needed and show its reasoning trace.
                </p>
                <div className="mt-6 flex flex-wrap justify-center gap-2">
                  {QUICK_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => handleSend(prompt)}
                      className="rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-medium text-accent shadow-sm hover:bg-accent/5"
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

        <div className="border-t border-slate-200 bg-white px-4 py-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-4xl">
            {displayMessages.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {QUICK_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => handleSend(prompt)}
                    disabled={isLoading}
                    className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-accent hover:bg-accent/5 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-end gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm focus-within:border-accent focus-within:ring-1 focus-within:ring-accent/20">
              <textarea
                value={inputValue}
                onChange={(event) => setInputValue(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about fleet health, a specific machine, or a failure prediction..."
                rows={1}
                className="max-h-32 flex-1 resize-none border-0 bg-transparent px-2 py-1.5 text-sm text-ink placeholder:text-slate-400 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => handleSend(inputValue)}
                disabled={isLoading || !inputValue.trim()}
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-accent text-white hover:bg-accent/90 disabled:cursor-not-allowed disabled:bg-slate-200"
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