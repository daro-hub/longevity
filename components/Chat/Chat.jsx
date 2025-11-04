'use client'

import { useState, useRef, useEffect } from 'react'

const API_ENDPOINT = 'https://longevity-backend-07su.onrender.com/ask'

function Chat () {
  const [messages, setMessages] = useState([
    {
      id: 1,
      text: 'Ciao! Sono la tua nutrizionista AI. Come posso aiutarti oggi?',
      sender: 'ai'
    }
  ])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSend = async () => {
    if (!inputValue.trim() || isLoading) return

    const questionText = inputValue.trim()

    const userMessage = {
      id: messages.length + 1,
      text: questionText,
      sender: 'user'
    }

    setMessages(prev => [...prev, userMessage])
    setInputValue('')
    setIsLoading(true)

    // Mostra un messaggio di loading
    const loadingMessage = {
      id: messages.length + 2,
      text: 'Sto pensando...',
      sender: 'ai',
      isLoading: true
    }
    setMessages(prev => [...prev, loadingMessage])

    try {
      const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          question: questionText
        })
      })

      if (!response.ok) {
        throw new Error(`Errore: ${response.status}`)
      }

      const data = await response.json()

      // Rimuove il messaggio di loading e aggiunge la risposta
      setMessages(prev => {
        const withoutLoading = prev.filter(msg => !msg.isLoading)
        return [
          ...withoutLoading,
          {
            id: withoutLoading.length + 1,
            text: data.answer,
            sender: 'ai'
          }
        ]
      })
    } catch (error) {
      console.error('Errore nella richiesta:', error)
      
      // Rimuove il messaggio di loading e aggiunge un messaggio di errore
      setMessages(prev => {
        const withoutLoading = prev.filter(msg => !msg.isLoading)
        return [
          ...withoutLoading,
          {
            id: withoutLoading.length + 1,
            text: 'Mi dispiace, si è verificato un errore. Riprova più tardi.',
            sender: 'ai'
          }
        ]
      })
    } finally {
      setIsLoading(false)
    }
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
            disabled={isLoading}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
          />
          <button
            onClick={handleSend}
            disabled={!inputValue.trim() || isLoading}
            className="px-6 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? 'Invio...' : 'Invia'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default Chat

