'use client'

import { useState, useRef, useEffect } from 'react'

function Chat () {
  const [messages, setMessages] = useState([
    {
      id: 1,
      text: 'Ciao! Sono la tua nutrizionista AI. Come posso aiutarti oggi?',
      sender: 'ai'
    }
  ])
  const [inputValue, setInputValue] = useState('')
  const messagesEndRef = useRef(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSend = () => {
    if (!inputValue.trim()) return

    const userMessage = {
      id: messages.length + 1,
      text: inputValue,
      sender: 'user'
    }

    setMessages(prev => [...prev, userMessage])
    setInputValue('')

    // Simula risposta AI dopo un breve delay
    setTimeout(() => {
      const aiMessage = {
        id: messages.length + 2,
        text: 'Certo! Ti aiuto subito 😊',
        sender: 'ai'
      }
      setMessages(prev => [...prev, aiMessage])
    }, 500)
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="w-full max-w-4xl h-[calc(100vh-200px)] flex flex-col bg-white rounded-lg shadow-lg border border-gray-200">
      {/* Area messaggi */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-lg px-4 py-2 ${
                message.sender === 'user'
                  ? 'bg-green-100 text-gray-800'
                  : 'bg-gray-200 text-gray-800'
              }`}
            >
              <p className="text-sm leading-relaxed">{message.text}</p>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-gray-200 p-4 bg-white rounded-b-lg">
        <div className="flex gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Scrivi un messaggio..."
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
          <button
            onClick={handleSend}
            disabled={!inputValue.trim()}
            className="px-6 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            Invia
          </button>
        </div>
      </div>
    </div>
  )
}

export default Chat

