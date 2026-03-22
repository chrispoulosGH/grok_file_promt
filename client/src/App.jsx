import React, { useState, useEffect, useRef } from 'react'
import axios from 'axios'

const API_BASE = 'http://localhost:4000'

const TAG_OFF   = 0
const TAG_QUERY = 2

export default function App() {
  const [selectedFiles, setSelectedFiles]     = useState([])
  const [uploaded, setUploaded]               = useState([])
  const [prompt, setPrompt]                   = useState('')
  const [selectedFileIds, setSelectedFileIds] = useState([])
  const [conversation, setConversation]       = useState([])
  const [loading, setLoading]                 = useState(false)
  const [allTags, setAllTags]                 = useState([])
  const [tagStates, setTagStates]             = useState({})
  const [newTag, setNewTag]                   = useState('')
  const [taggingFileId, setTaggingFileId]     = useState(null)
  const [showUntagged, setShowUntagged]       = useState(false)
  const [deleteIds, setDeleteIds]             = useState([])
  const [voices, setVoices]                   = useState([])
  const [selectedVoice, setSelectedVoice]     = useState('')
  const [isListening, setIsListening]         = useState(false)
  const [speakingIdx, setSpeakingIdx]         = useState(null)
  const [voiceMode, setVoiceMode]             = useState(false)
  const [voiceStatus, setVoiceStatus]         = useState('')  // 'listening' | 'thinking' | 'speaking' | ''

  const recognitionRef  = useRef(null)
  const chatEndRef      = useRef(null)
  const textareaRef     = useRef(null)
  const convRef         = useRef([])       // mirror of conversation for use in async callbacks
  const voiceModeRef    = useRef(false)
  const loadingRef      = useRef(false)

  // Keep convRef in sync; use this instead of setConversation directly
  function setConv(updater) {
    setConversation(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      convRef.current = next
      return next
    })
  }

  useEffect(() => {
    fetchFiles()
    fetchTags()
  }, [])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [conversation, loading])

  useEffect(() => {
    function loadVoices() {
      const v = window.speechSynthesis.getVoices()
      if (v.length) setVoices(v)
    }
    loadVoices()
    window.speechSynthesis.addEventListener('voiceschanged', loadVoices)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', loadVoices)
  }, [])

  async function fetchFiles() {
    const resp = await axios.get(`${API_BASE}/files`)
    setUploaded(resp.data.files || [])
  }

  async function fetchTags() {
    const resp = await axios.get(`${API_BASE}/tags`)
    setAllTags(resp.data.tags || [])
  }

  function onFileChange(e) { setSelectedFiles(Array.from(e.target.files)) }

  async function uploadFiles() {
    if (selectedFiles.length === 0) return
    const form = new FormData()
    selectedFiles.forEach(f => form.append('files', f))
    await axios.post(`${API_BASE}/upload`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
    setSelectedFiles([])
    fetchFiles()
    fetchTags()
  }

  function cycleTag(tag) {
    const current   = tagStates[tag] || TAG_OFF
    const next      = (current + 1) % 4
    const newStates = { ...tagStates, [tag]: next }
    const tagFileIds = uploaded.filter(f => f.tags?.includes(tag)).map(f => f.fileId)
    if (next === TAG_QUERY) {
      setSelectedFileIds(ids => [...new Set([...ids, ...tagFileIds])])
    } else if (current === TAG_QUERY) {
      const stillGreen = new Set(
        uploaded.filter(f => f.tags?.some(t => (newStates[t] || TAG_OFF) === TAG_QUERY)).map(f => f.fileId)
      )
      setSelectedFileIds(ids => ids.filter(id => stillGreen.has(id)))
    }
    setTagStates(newStates)
  }

  function toggleFileId(fileId) {
    setSelectedFileIds(ids =>
      ids.includes(fileId) ? ids.filter(id => id !== fileId) : [...ids, fileId]
    )
  }

  async function deleteAll() {
    if (!deleteIds.length) return
    if (!window.confirm(`Delete ${deleteIds.length} file${deleteIds.length !== 1 ? 's' : ''}?`)) return
    for (const fileId of deleteIds) {
      try { await axios.delete(`${API_BASE}/files/${fileId}`) } catch {}
    }
    setSelectedFileIds(ids => ids.filter(id => !deleteIds.includes(id)))
    setDeleteIds([])
    fetchFiles()
    fetchTags()
  }

  function toggleDeleteId(fileId) {
    setDeleteIds(ids => ids.includes(fileId) ? ids.filter(id => id !== fileId) : [...ids, fileId])
  }

  async function addTag(fileId, tag) {
    if (!tag.trim()) return
    try {
      await axios.post(`${API_BASE}/files/${fileId}/tags`, { tags: [tag.trim()] })
      fetchFiles(); fetchTags(); setNewTag(''); setTaggingFileId(null)
    } catch (err) { alert(`Error adding tag: ${err.message}`) }
  }

  async function removeTag(fileId, tag) {
    try {
      await axios.delete(`${API_BASE}/files/${fileId}/tags`, { data: { tags: [tag] } })
      fetchFiles(); fetchTags()
    } catch (err) { alert(`Error removing tag: ${err.message}`) }
  }

  // ── Text generation (manual send) ─────────────────────────────────────────
  async function generate() {
    if (!prompt.trim() || loadingRef.current) return
    const text = prompt.trim()
    setPrompt('')
    textareaRef.current?.focus()
    await sendMessage(text)
  }

  // Core send — used by both manual and voice paths
  async function sendMessage(text) {
    loadingRef.current = true
    setLoading(true)

    const apiContent = [{ type: 'text', text }]
    selectedFileIds.forEach(fileId => {
      const file = uploaded.find(f => f.fileId === fileId)
      const isImage = file?.contentType?.startsWith('image/')
      apiContent.push(isImage
        ? { type: 'image',    source: { type: 'file', file_id: fileId } }
        : { type: 'document', source: { type: 'file', file_id: fileId } }
      )
    })

    const userMsg = { role: 'user', displayText: text, fileCount: selectedFileIds.length, apiContent }
    const updatedConv = [...convRef.current, userMsg]
    setConv(updatedConv)

    try {
      const messages = updatedConv.map(m => ({ role: m.role, content: m.apiContent }))
      const resp = await axios.post(`${API_BASE}/generate`, { messages })
      const data = resp.data

      const displayText = data.content?.filter(b => b.type === 'text').map(b => b.text).join('\n\n') || ''
      const webSearches = data.content?.filter(
        b => (b.type === 'server_tool_use' || b.type === 'tool_use') && b.name === 'web_search'
      ) || []
      const historyContent = data.content?.filter(b => b.type === 'text') || []

      setConv(prev => [...prev, {
        role: 'assistant', displayText, apiContent: historyContent, webSearches, stopReason: data.stop_reason
      }])

      loadingRef.current = false
      setLoading(false)

      // In voice mode: auto-speak then restart listening
      if (voiceModeRef.current && displayText) {
        const idx = convRef.current.length - 1
        speakThenListen(displayText, idx)
      } else if (voiceModeRef.current) {
        setVoiceStatus('listening')
        listenOnce()
      }
    } catch (err) {
      setConv(prev => [...prev, {
        role: 'assistant', displayText: null, apiContent: [], webSearches: [],
        error: err.response?.data?.error || err.message
      }])
      loadingRef.current = false
      setLoading(false)
      if (voiceModeRef.current) { setTimeout(() => { setVoiceStatus('listening'); listenOnce() }, 1000) }
    }
  }

  function handleKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); generate() }
  }

  // ── Manual mic (single utterance → appends to textarea) ───────────────────
  function startListening() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { alert('Speech recognition not supported. Use Chrome or Edge.'); return }
    const r = new SR()
    r.continuous     = true
    r.interimResults = false
    r.lang           = 'en-US'
    r.onresult = e => {
      const latest = e.results[e.results.length - 1][0].transcript.trim()
      if (latest) setPrompt(prev => prev ? prev + ' ' + latest : latest)
    }
    r.onerror = () => setIsListening(false)
    r.onend   = () => setIsListening(false)
    r.start()
    recognitionRef.current = r
    setIsListening(true)
  }

  function stopListening() {
    recognitionRef.current?.stop()
    setIsListening(false)
  }

  // ── Voice conversation mode ────────────────────────────────────────────────
  function startVoiceMode() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { alert('Speech recognition not supported. Use Chrome or Edge.'); return }
    voiceModeRef.current = true
    setVoiceMode(true)
    startVoiceRecognition()
  }

  function stopVoiceMode() {
    voiceModeRef.current = false
    setVoiceMode(false)
    setVoiceStatus('')
    recognitionRef.current?.stop()
    window.speechSynthesis.cancel()
    setIsListening(false)
    setSpeakingIdx(null)
  }

  function startVoiceRecognition() {
    if (!voiceModeRef.current) return
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return

    const r = new SR()
    r.continuous     = true   // stay open; we stop manually on first final result
    r.interimResults = true   // fire frequently so the status bar feels alive
    r.lang           = 'en-US'

    r.onresult = e => {
      // Process the newest results
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          const text = e.results[i][0].transcript.trim()
          if (text && voiceModeRef.current && !loadingRef.current) {
            r.stop()                   // stop listening while Claude thinks
            setVoiceStatus('thinking')
            sendMessage(text)
          }
        }
      }
    }

    r.onerror = e => {
      console.warn('Voice recognition error:', e.error)
      setIsListening(false)
      if (voiceModeRef.current && !loadingRef.current) {
        setTimeout(startVoiceRecognition, 800)
      }
    }

    r.onend = () => setIsListening(false)

    r.start()
    recognitionRef.current = r
    setIsListening(true)
    setVoiceStatus('listening')
  }

  function speakThenListen(text, idx) {
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    if (selectedVoice) {
      const voice = voices.find(v => v.name === selectedVoice)
      if (voice) utterance.voice = voice
    }
    setSpeakingIdx(idx)
    setVoiceStatus('speaking')
    utterance.onend = () => {
      setSpeakingIdx(null)
      if (voiceModeRef.current) startVoiceRecognition()
    }
    utterance.onerror = () => {
      setSpeakingIdx(null)
      if (voiceModeRef.current) startVoiceRecognition()
    }
    window.speechSynthesis.speak(utterance)
  }

  // Manual speak (non-voice-mode)
  function speakMessage(text, idx) {
    if (!text) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    if (selectedVoice) {
      const voice = voices.find(v => v.name === selectedVoice)
      if (voice) utterance.voice = voice
    }
    utterance.onend   = () => setSpeakingIdx(null)
    utterance.onerror = () => setSpeakingIdx(null)
    window.speechSynthesis.speak(utterance)
    setSpeakingIdx(idx)
  }

  function stopSpeaking() {
    window.speechSynthesis.cancel()
    setSpeakingIdx(null)
    setVoiceStatus(voiceModeRef.current ? 'listening' : '')
    if (voiceModeRef.current) listenOnce()
  }

  function clearConversation() {
    stopVoiceMode()
    setConv([])
  }

  const activeTags    = Object.entries(tagStates).filter(([, s]) => s !== TAG_OFF).map(([t]) => t)
  const untaggedFiles = uploaded.filter(f => !f.tags || f.tags.length === 0)
  const visibleFiles  = [
    ...uploaded.filter(f => f.tags?.some(t => activeTags.includes(t))),
    ...(showUntagged ? untaggedFiles : [])
  ]

  return (
    <div className="app-shell">
      <h1 className="app-title">Grok File Manager & Query</h1>

      <div className="two-col">

        {/* ══ LEFT PANEL ══ */}
        <div className="panel panel-left">
          <section>
            <h2>Upload</h2>
            <p className="info">📄 PDF, Word, txt · 🖼 Images (jpg/png/gif/webp) · 🎤 Audio (mp3/wav/m4a) — transcribed</p>
            <div className="upload-row">
              <label className="btn-choose-files">
                📂 Choose Files
                <input type="file" multiple onChange={onFileChange} accept=".pdf,.txt,.docx,.jpg,.jpeg,.png,.gif,.webp,.mp3,.wav,.m4a,.webm,.ogg" hidden />
              </label>
              <button className="btn-upload" onClick={uploadFiles} disabled={selectedFiles.length === 0}>
                ⬆ Upload{selectedFiles.length > 0 ? ` (${selectedFiles.length})` : ''}
              </button>
            </div>
            {selectedFiles.length > 0 && (
              <div className="file-list">
                {selectedFiles.map(f => <div key={f.name} className="file-item">{f.name}</div>)}
              </div>
            )}
          </section>

          <section>
            <h2>Files</h2>
            <div className="tag-pill-row">
              {allTags.map(tag => {
                const state = tagStates[tag] || TAG_OFF
                const cls = state === TAG_QUERY ? 'tag-pill tag-pill-query'
                          : state !== TAG_OFF   ? 'tag-pill tag-pill-show'
                          :                       'tag-pill tag-pill-off'
                return <button key={tag} className={cls} onClick={() => cycleTag(tag)}>{tag}</button>
              })}
              <button
                className={showUntagged ? 'tag-pill tag-pill-show' : 'tag-pill tag-pill-off'}
                onClick={() => setShowUntagged(v => !v)}
                disabled={untaggedFiles.length === 0}
                title={untaggedFiles.length === 0 ? 'No untagged files' : `${untaggedFiles.length} untagged`}
              >
                No Tags{untaggedFiles.length > 0 ? ` (${untaggedFiles.length})` : ''}
              </button>
            </div>
            {allTags.length === 0 && untaggedFiles.length === 0 && <p className="muted">No files uploaded yet.</p>}

            {visibleFiles.length > 0 && (
              <div className="file-list-section">
                <div className="delete-col-header">
                  <span className="delete-col-label">File Name</span>
                  <div className="delete-col-actions">
                    <button className="btn-small btn-secondary" onClick={() => {
                      const allSel = visibleFiles.every(f => deleteIds.includes(f.fileId))
                      setDeleteIds(allSel ? [] : visibleFiles.map(f => f.fileId))
                    }}>
                      {visibleFiles.every(f => deleteIds.includes(f.fileId)) ? 'Deselect All' : 'Select All'}
                    </button>
                    <button className="btn-delete btn-small" onClick={deleteAll} disabled={deleteIds.length === 0}>
                      Delete Selected{deleteIds.length > 0 ? ` (${deleteIds.length})` : ''}
                    </button>
                  </div>
                </div>

                {visibleFiles.map((u, i) => (
                  <div key={i} className="file-card">
                    <div className="file-card-header">
                      <label className="file-checkbox-label">
                        <input type="checkbox" checked={selectedFileIds.includes(u.fileId)} onChange={() => toggleFileId(u.fileId)} />
                        <strong>{u.localFilename}</strong>
                      </label>
                      <div className="file-card-actions">
                        <a href={`${API_BASE}/files/${u.fileId}/download`} download={u.localFilename} className="btn-download btn-small" title="Download">⬇</a>
                        <input type="checkbox" checked={deleteIds.includes(u.fileId)} onChange={() => toggleDeleteId(u.fileId)} title="Mark for deletion" className="delete-checkbox" />
                      </div>
                    </div>
                    {u.contentType?.startsWith('image/') && (
                      <img
                        src={`${API_BASE}/files/${u.fileId}/download`}
                        alt={u.localFilename}
                        className="file-thumb"
                      />
                    )}

                    <div className="file-tags">
                      {u.tags && u.tags.length > 0 ? u.tags.map(tag => (
                        <span key={tag} className="tag">
                          {tag}
                          <button onClick={() => removeTag(u.fileId, tag)} className="tag-remove">×</button>
                        </span>
                      )) : <span className="no-tags">No tags</span>}
                      {taggingFileId === u.fileId ? (
                        <span className="add-tag">
                          <input type="text" value={newTag} onChange={e => setNewTag(e.target.value)} placeholder="New tag"
                            onKeyDown={e => e.key === 'Enter' && addTag(u.fileId, newTag)} />
                          <button onClick={() => addTag(u.fileId, newTag)}>Add</button>
                          <button onClick={() => setTaggingFileId(null)}>Cancel</button>
                        </span>
                      ) : (
                        <button onClick={() => setTaggingFileId(u.fileId)} className="btn-add-tag">+ Tag</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* ══ RIGHT PANEL — chat ══ */}
        <div className="panel panel-right">

          {/* Header */}
          <div className="chat-header">
            <span className="chat-header-title">
              Conversation
              {selectedFileIds.length > 0 && (
                <span className="query-count"> — {selectedFileIds.length} file{selectedFileIds.length !== 1 ? 's' : ''} selected</span>
              )}
            </span>
            <div className="chat-header-actions">
              {conversation.length > 0 && (
                <button className="btn-small btn-secondary" onClick={clearConversation}>New</button>
              )}
            </div>
          </div>

          {/* Chat thread */}
          <div className="chat-thread">
            {conversation.length === 0 && !loading && (
              <div className="chat-empty">
                <p>Ask Grok anything — type or use voice.</p>
                <p className="muted">Ctrl+Enter to send · 🎙 for hands-free conversation</p>
              </div>
            )}

            {conversation.map((msg, i) => (
              <div key={i} className={`chat-row chat-row-${msg.role}`}>
                <div className={`chat-bubble chat-bubble-${msg.role}`}>
                  {msg.role === 'user' ? (
                    <div>
                      <div className="chat-user-text">{msg.displayText}</div>
                      {msg.fileCount > 0 && (
                        <div className="chat-file-badge">📎 {msg.fileCount} file{msg.fileCount !== 1 ? 's' : ''}</div>
                      )}
                    </div>
                  ) : msg.error ? (
                    <div className="error">{String(msg.error)}</div>
                  ) : (
                    <div>
                      {msg.webSearches?.length > 0 && (
                        <div className="tool-usage">
                          <strong>🔍</strong>{' '}
                          {msg.webSearches.map((t, j) => (
                            <span key={j} className="search-query">{t.input?.query}</span>
                          ))}
                        </div>
                      )}
                      {msg.stopReason === 'max_tokens' && (
                        <div className="warning" style={{ marginBottom: 6 }}>⚠️ Response truncated.</div>
                      )}
                      <div className="chat-assistant-text">{msg.displayText}</div>
                      {msg.displayText && !voiceMode && (
                        <button
                          className={`btn-speak${speakingIdx === i ? ' btn-speak-active' : ''}`}
                          onClick={speakingIdx === i ? stopSpeaking : () => speakMessage(msg.displayText, i)}
                        >
                          {speakingIdx === i ? '⏹ Stop' : '🔊 Speak'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="chat-row chat-row-assistant">
                <div className="chat-bubble chat-bubble-assistant chat-thinking">
                  <span className="thinking-dot" /><span className="thinking-dot" /><span className="thinking-dot" />
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Voice mode status bar */}
          {voiceMode && (
            <div className={`voice-status-bar voice-status-${voiceStatus}`}>
              {voiceStatus === 'listening' && <><span className="voice-pulse" />Listening…</>}
              {voiceStatus === 'thinking'  && <><span className="thinking-dot" /><span className="thinking-dot" /><span className="thinking-dot" />&nbsp;Thinking…</>}
              {voiceStatus === 'speaking'  && <><span className="voice-pulse voice-pulse-speak" />Speaking…</>}
            </div>
          )}

          {/* Input area */}
          <div className="chat-input-area">
            {voices.length > 0 && (
              <div className="voice-picker-row">
                <label className="voice-picker-label">🔊 Voice</label>
                <select value={selectedVoice} onChange={e => setSelectedVoice(e.target.value)} className="voice-picker-select">
                  <option value="">— Browser default —</option>
                  {voices.map(v => (
                    <option key={v.name} value={v.name}>{v.name}{v.localService ? '' : ' ☁'}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="prompt-input-row">
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={conversation.length > 0 ? 'Follow up…' : 'Enter your prompt here…'}
                rows={3}
                disabled={voiceMode}
              />
              <div className="prompt-btn-col">
                <button
                  onClick={isListening ? stopListening : startListening}
                  className={`btn-mic${isListening ? ' btn-mic-active' : ''}`}
                  title={isListening ? 'Stop' : 'Dictate into prompt'}
                  disabled={voiceMode}
                >
                  {isListening ? '⏹' : '🎤'}
                </button>
                <button
                  onClick={voiceMode ? stopVoiceMode : startVoiceMode}
                  className={`btn-voice-conv${voiceMode ? ' btn-voice-conv-active' : ''}`}
                  title={voiceMode ? 'Stop voice conversation' : 'Start voice conversation'}
                >
                  {voiceMode ? '⏹' : '🎙'}
                </button>
              </div>
            </div>

            <button onClick={generate} disabled={!prompt.trim() || loading || voiceMode} className="btn-generate">
              {loading && !voiceMode ? 'Generating…' : conversation.length > 0 ? 'Send' : 'Generate Response'}
            </button>
          </div>

        </div>
      </div>
    </div>
  )
}
