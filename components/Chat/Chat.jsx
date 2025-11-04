'use client'

import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'

const API_ENDPOINT = 'https://longevity-backend-07su.onrender.com/ask'
                    
// Fasi della chat
const CHAT_PHASES = {
  INTRODUCTION: 'introduction',
  DATA_COLLECTION: 'data_collection',
  REVIEW: 'review',
  CHAT: 'chat'
}

// Struttura delle domande per la raccolta dati
const DATA_COLLECTION_QUESTIONS = [
  {
    id: 'age',
    text: 'Quanti anni hai?',
    type: 'number',
    placeholder: 'Inserisci la tua età'
  },
  {
    id: 'gender',
    text: 'Qual è il tuo sesso biologico?',
    type: 'buttons',
    options: [
      { label: 'Maschio', value: 'male' },
      { label: 'Femmina', value: 'female' }
    ]
  },
  {
    id: 'weight',
    text: 'Qual è il tuo peso attuale? (in kg)',
    type: 'number',
    placeholder: 'Es. 70'
  },
  {
    id: 'height',
    text: 'Qual è la tua altezza? (in cm)',
    type: 'number',
    placeholder: 'Es. 175'
  },
  {
    id: 'activity',
    text: 'Quanto sei attivo fisicamente?',
    type: 'text',
    placeholder: 'Descrivi il tuo livello di attività fisica'
  },
  {
    id: 'goal',
    text: 'Qual è il tuo obiettivo principale?',
    type: 'text',
    placeholder: 'Descrivi il tuo obiettivo principale'
  },
  {
    id: 'dietary_preferences',
    text: 'Hai preferenze alimentari o allergie?',
    type: 'text',
    placeholder: 'Es. vegetariano, vegano, intollerante al lattosio, allergico alle noci... (lascia vuoto se non hai preferenze)'
  }
]
                    
function Chat () {
  const [phase, setPhase] = useState(CHAT_PHASES.INTRODUCTION)
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [collectedData, setCollectedData] = useState({})
  const [editingField, setEditingField] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [messages, setMessages] = useState([])
  const [inputValue, setInputValue] = useState('')
  const [numberInputValue, setNumberInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isProcessingResponse, setIsProcessingResponse] = useState(false)
  const messagesEndRef = useRef(null)

  // Inizializzazione con messaggio di presentazione
  useEffect(() => {
    const introMessage = {
      id: 1,
      text: 'Ciao! Sono la tua nutrizionista AI. Prima di iniziare a creare la tua dieta personalizzata, ho bisogno di raccogliere alcune informazioni su di te. Questo processo richiederà solo pochi minuti e mi permetterà di fornirti consigli nutrizionali su misura per le tue esigenze. Sei pronto?',
      sender: 'ai'
    }
    setMessages([introMessage])
    setPhase(CHAT_PHASES.INTRODUCTION)
  }, [])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Gestisce la risposta durante la fase di introduzione
  const handleIntroductionResponse = (value) => {
    setMessages(prev => {
      const userMessage = {
        id: prev.length + 1,
        text: value === 'yes' ? 'Sì' : 'No, ho altre domande',
        sender: 'user'
      }
      return [...prev, userMessage]
    })

    if (value === 'yes') {
      setPhase(CHAT_PHASES.DATA_COLLECTION)
      setCurrentQuestionIndex(0)
      // Chiedi la prima domanda dopo un breve delay
      setTimeout(() => {
        askNextQuestion(0)
      }, 500)
    } else {
      // Se l'utente ha altre domande, passa alla chat normale
      setPhase(CHAT_PHASES.CHAT)
    }
  }

  // Chiede la prossima domanda
  const askNextQuestion = (index) => {
    if (index >= DATA_COLLECTION_QUESTIONS.length) {
      return
    }

    const question = DATA_COLLECTION_QUESTIONS[index]
    
    // Resetta l'input numerico se la nuova domanda è di tipo number
    if (question.type === 'number') {
      setNumberInputValue('')
    }
    
    // Usa il callback per assicurarsi di avere l'ultimo stato dei messaggi
    setMessages(prev => {
      // Verifica che non ci sia già una domanda con questo questionId
      const existingQuestion = prev.find(msg => msg.questionId === question.id && msg.sender === 'ai')
      if (existingQuestion) {
        return prev
      }
      
      const questionMessage = {
        id: prev.length + 1,
        text: question.text,
        sender: 'ai',
        questionId: question.id,
        questionType: question.type
      }
      return [...prev, questionMessage]
    })
    
    // Aggiorna l'indice corrente
    setCurrentQuestionIndex(index)
  }

  // Gestisce la risposta a una domanda durante la raccolta dati
  const handleDataCollectionResponse = (questionId, value, displayText) => {
    // Evita chiamate multiple
    if (isProcessingResponse) return
    
    setIsProcessingResponse(true)

    // Trova l'indice della domanda corrente
    const currentQuestionIndexFound = DATA_COLLECTION_QUESTIONS.findIndex(q => q.id === questionId)
    if (currentQuestionIndexFound === -1) {
      setIsProcessingResponse(false)
      return
    }

    // Aggiunge il messaggio dell'utente
    setMessages(prev => {
      // Verifica che non ci sia già un messaggio utente identico subito dopo l'ultima domanda AI
      const lastAIMsg = prev.filter(m => m.sender === 'ai' && m.questionId === questionId).pop()
      if (lastAIMsg) {
        const msgAfterAI = prev.find(m => m.id > lastAIMsg.id && m.sender === 'user')
        if (msgAfterAI && msgAfterAI.text === (displayText || value.toString())) {
          return prev
        }
      }
      
      const userMessage = {
        id: prev.length + 1,
        text: displayText || value.toString(),
        sender: 'user'
      }
      return [...prev, userMessage]
    })

    // Salva la risposta
    setCollectedData(prev => {
      if (prev[questionId]) {
        // La risposta è già stata salvata
        return prev
      }
      return {
        ...prev,
        [questionId]: value
      }
    })

    // Calcola l'indice della prossima domanda
    const nextIndex = currentQuestionIndexFound + 1

    // Chiedi la prossima domanda dopo un breve delay
    setTimeout(() => {
      if (nextIndex < DATA_COLLECTION_QUESTIONS.length) {
        askNextQuestion(nextIndex)
      } else {
        // Raccolta completata - mostra il riepilogo
        showReviewPhase()
      }
      setIsProcessingResponse(false)
    }, 500)
  }

  // Mostra la fase di riepilogo
  const showReviewPhase = () => {
    setPhase(CHAT_PHASES.REVIEW)
    
    // Crea il messaggio di riepilogo
    setMessages(prev => {
      const reviewMessage = {
        id: prev.length + 1,
        text: 'Perfetto! Ecco un riepilogo delle informazioni che ho raccolto:',
        sender: 'ai',
        isReview: true
      }
      return [...prev, reviewMessage]
    })
  }

  // Gestisce la modifica di un campo nel riepilogo
  const handleEditField = (fieldId, currentValue) => {
    setEditingField(fieldId)
    setEditValue(currentValue)
  }

  // Salva la modifica di un campo
  const handleSaveEdit = (fieldId) => {
    const question = DATA_COLLECTION_QUESTIONS.find(q => q.id === fieldId)
    let displayText = editValue
    
    if (question && question.options) {
      const option = question.options.find(opt => opt.value === editValue)
      displayText = option ? option.label : editValue
    }
    
    setCollectedData(prev => ({
      ...prev,
      [fieldId]: editValue
    }))
    
    setEditingField(null)
    setEditValue('')
  }

  // Completa la raccolta dati e invia all'endpoint RAG
  const completeDataCollection = async () => {
    const collectedDataToSend = collectedData
    
    setMessages(prev => {
      const completionMessage = {
        id: prev.length + 1,
        text: 'Perfetto! Ho raccolto tutte le informazioni necessarie. Ora creerò la tua dieta personalizzata...',
        sender: 'ai'
      }
      return [...prev, completionMessage]
    })
    setIsLoading(true)

    try {
      // Mappa i valori per user_data
      const mapGender = (value) => {
        const genderMap = {
          'male': 'maschio',
          'female': 'femmina',
          'other': 'altro'
        }
        return genderMap[value] || value
      }

      // Costruisce l'oggetto user_data
      // Per activity, goal e dietary_preferences, usa direttamente il testo inserito dall'utente (non più mapping)
      const userData = {
        age: parseInt(collectedDataToSend.age) || null,
        weight: parseFloat(collectedDataToSend.weight) || null,
        height: parseInt(collectedDataToSend.height) || null,
        gender: collectedDataToSend.gender ? mapGender(collectedDataToSend.gender) : null,
        activity_level: collectedDataToSend.activity || null,
        goal: collectedDataToSend.goal || null,
        dietary_preferences: collectedDataToSend.dietary_preferences || null
      }

      // Prepara la question
      const question = 'Crea una dieta personalizzata basata su queste informazioni. Fornisci una dieta completa e dettagliata.'

      const payload = {
        question: question,
        user_data: userData
      }

      // Stampa il payload a console
      console.log('Payload inviato all\'endpoint:', JSON.stringify(payload, null, 2))

      const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        throw new Error(`Errore: ${response.status}`)
      }

      const responseData = await response.json()

      // Aggiunge la risposta della dieta
      setMessages(prev => {
        const dietMessage = {
          id: prev.length + 1,
          text: responseData.answer,
          sender: 'ai'
        }
        return [...prev, dietMessage]
      })

      // Passa alla fase di chat normale
      setPhase(CHAT_PHASES.CHAT)
    } catch (error) {
      console.error('Errore nella richiesta:', error)
      setMessages(prev => {
        const errorMessage = {
          id: prev.length + 1,
          text: 'Mi dispiace, si è verificato un errore durante la generazione della dieta. Riprova più tardi.',
          sender: 'ai'
        }
        return [...prev, errorMessage]
      })
      setPhase(CHAT_PHASES.CHAT)
    } finally {
      setIsLoading(false)
    }
  }

  // Gestisce l'invio del numero durante la raccolta dati
  const handleNumberSubmit = () => {
    if (!numberInputValue.trim() || isProcessingResponse) return

    // Trova l'ultima domanda AI non risposta usando lo stato corrente
    const lastAIQuestion = messages
      .filter(msg => msg.sender === 'ai' && msg.questionId && !collectedData[msg.questionId])
      .pop()
    
    if (lastAIQuestion && lastAIQuestion.questionId && !collectedData[lastAIQuestion.questionId]) {
      const value = numberInputValue.trim()
      setNumberInputValue('')
      handleDataCollectionResponse(
        lastAIQuestion.questionId,
        value,
        value
      )
    }
  }

  const handleSend = async () => {
    // Se siamo in fase DATA_COLLECTION e c'è una domanda di tipo text, gestisci la risposta
    if (phase === CHAT_PHASES.DATA_COLLECTION && inputValue.trim()) {
      const lastAIQuestion = messages
        .filter(msg => msg.sender === 'ai' && msg.questionId && !collectedData[msg.questionId])
        .pop()
      
      if (lastAIQuestion && lastAIQuestion.questionId && lastAIQuestion.questionType === 'text') {
        // Per dietary_preferences, accetta anche risposta vuota
        const value = inputValue.trim()
        setInputValue('')
        const finalValue = value || ''
        handleDataCollectionResponse(
          lastAIQuestion.questionId,
          finalValue,
          finalValue || '(nessuna preferenza)'
        )
        return
      }
    }
    
    // Se siamo in fase DATA_COLLECTION e la risposta è vuota, controlla se è per dietary_preferences
    if (phase === CHAT_PHASES.DATA_COLLECTION && !inputValue.trim()) {
      const lastAIQuestion = messages
        .filter(msg => msg.sender === 'ai' && msg.questionId && !collectedData[msg.questionId])
        .pop()
      
      if (lastAIQuestion && lastAIQuestion.questionId === 'dietary_preferences') {
        // Permetti risposta vuota per dietary_preferences
        setInputValue('')
        handleDataCollectionResponse(
          lastAIQuestion.questionId,
          '',
          '(nessuna preferenza)'
        )
        return
      }
    }
    
    // handleSend funziona solo nella fase CHAT
    if (phase !== CHAT_PHASES.CHAT) return
    if (!inputValue.trim() || isLoading) return

    const questionText = inputValue.trim()

    setMessages(prev => {
      const userMessage = {
        id: prev.length + 1,
        text: questionText,
        sender: 'user'
      }
      return [...prev, userMessage]
    })
    setInputValue('')
    setIsLoading(true)

    // Mostra un messaggio di loading
    setMessages(prev => {
      const loadingMessage = {
        id: prev.length + 1,
        text: 'Sto pensando...',
        sender: 'ai',
        isLoading: true
      }
      return [...prev, loadingMessage]
    })

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

  // Trova l'ultimo messaggio AI che richiede una risposta
  const getLastAIQuestion = () => {
    const aiMessages = messages.filter(msg => msg.sender === 'ai' && !msg.isLoading)
    if (aiMessages.length === 0) return null

    const lastMessage = aiMessages[aiMessages.length - 1]
    
    // Se è nella fase di introduzione o raccolta dati, e non è un messaggio di loading
    if ((phase === CHAT_PHASES.INTRODUCTION || phase === CHAT_PHASES.DATA_COLLECTION) && 
        lastMessage && 
        !lastMessage.isLoading) {
      return lastMessage
    }
    
    return null
  }

  const lastAIQuestion = getLastAIQuestion()
  const currentQuestion = lastAIQuestion && lastAIQuestion.questionId
    ? DATA_COLLECTION_QUESTIONS.find(q => q.id === lastAIQuestion.questionId)
    : null

  // Verifica se l'ultima domanda è stata già risposta
  const isQuestionAnswered = (questionId) => {
    if (!questionId) return false
    return collectedData.hasOwnProperty(questionId)
  }

  return (
    <div className="w-full max-w-4xl h-[calc(100vh-200px)] flex flex-col bg-slate-800 rounded-lg shadow-lg border border-slate-700">
      {/* Area messaggi */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-900">
        {messages.map((message, index) => {
          const isLastAI = index === messages.length - 1 && message.sender === 'ai'
          // Mostra gli input se:
          // 1. È l'ultimo messaggio AI
          // 2. Non è un messaggio di loading
          // 3. Siamo in fase INTRODUCTION o DATA_COLLECTION
          // 4. Se è una domanda della raccolta dati, non deve essere già risposta
          const showInputs = lastAIQuestion && 
                           message.id === lastAIQuestion.id && 
                           (phase === CHAT_PHASES.INTRODUCTION || 
                            (phase === CHAT_PHASES.DATA_COLLECTION && 
                             !isQuestionAnswered(message.questionId)))

          return (
            <div key={message.id}>
              <div
            className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-lg px-4 py-2 ${
                message.sender === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700 text-gray-100'
              }`}
            >
              {message.sender === 'ai' ? (
                message.isLoading ? (
                  <div className="flex items-center gap-1 text-sm text-gray-100">
                    <span>Sto pensando</span>
                    <span className="flex items-center gap-1 ml-1">
                      <span className="typing-dot"></span>
                      <span className="typing-dot"></span>
                      <span className="typing-dot"></span>
                    </span>
                  </div>
                    ) : message.isReview ? (
                      <div className="text-sm leading-relaxed text-gray-100">
                        <p className="mb-4">{message.text}</p>
                        <div className="space-y-3">
                          {DATA_COLLECTION_QUESTIONS.map((question) => {
                            const value = collectedData[question.id]
                            // Per dietary_preferences, mostra anche se è vuoto (con messaggio)
                            if (value === undefined || (value === '' && question.id !== 'dietary_preferences')) return null
                            
                            // Per campi di tipo text, mostra direttamente il valore
                            // Per campi con options (bottoni), mostra il label
                            // Per campi numerici, mostra il valore
                            const displayValue = question.type === 'text' 
                              ? (value || '(nessuna preferenza)')
                              : question.options
                                ? question.options.find(opt => opt.value === value)?.label || value
                                : value
                            
                            return (
                              <div key={question.id} className="flex items-center justify-between gap-3 p-2 bg-slate-600 rounded">
                                <div className="flex-1">
                                  <span className="text-gray-300">{question.text}: </span>
                                  {editingField === question.id ? (
                                    <div className="flex items-center gap-2 mt-1">
                                      {question.type === 'number' ? (
                                        <input
                                          type="number"
                                          value={editValue}
                                          onChange={(e) => setEditValue(e.target.value)}
                                          onKeyPress={(e) => {
                                            if (e.key === 'Enter') {
                                              e.preventDefault()
                                              handleSaveEdit(question.id)
                                            }
                                          }}
                                          className="w-20 px-2 py-1 bg-slate-700 border border-slate-500 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                          autoFocus
                                        />
                                      ) : question.type === 'text' ? (
                                        <input
                                          type="text"
                                          value={editValue}
                                          onChange={(e) => setEditValue(e.target.value)}
                                          onKeyPress={(e) => {
                                            if (e.key === 'Enter' && !e.shiftKey) {
                                              e.preventDefault()
                                              handleSaveEdit(question.id)
                                            }
                                          }}
                                          className="flex-1 px-2 py-1 bg-slate-700 border border-slate-500 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                                          autoFocus
                                        />
                                      ) : question.options ? (
                                        <select
                                          value={editValue}
                                          onChange={(e) => setEditValue(e.target.value)}
                                          className="px-2 py-1 bg-slate-700 border border-slate-500 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                                          autoFocus
                                        >
                                          {question.options.map(opt => (
                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                          ))}
                                        </select>
                                      ) : null}
                                      <button
                                        onClick={() => handleSaveEdit(question.id)}
                                        className="px-2 py-1 bg-gradient-to-r from-purple-500 to-blue-500 text-white rounded text-sm hover:from-purple-600 hover:to-blue-600 transition-all"
                                      >
                                        ✓
                                      </button>
                                      <button
                                        onClick={() => {
                                          setEditingField(null)
                                          setEditValue('')
                                        }}
                                        className="px-2 py-1 bg-slate-600 text-white rounded text-sm hover:bg-slate-500 transition-colors"
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  ) : (
                                    <span className="text-white font-medium">{displayValue}</span>
                                  )}
                                </div>
                                {editingField !== question.id && (
                                  <button
                                    onClick={() => handleEditField(question.id, value)}
                                    className="p-1 text-gray-400 hover:text-white transition-colors"
                                    title="Modifica"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                    </svg>
                                  </button>
                                )}
                              </div>
                            )
                          })}
                        </div>
                  </div>
                ) : (
                  <div className="text-sm leading-relaxed text-gray-100">
                    <ReactMarkdown
                      components={{
                        p: ({ children }) => <p className="mb-2 last:mb-0 text-gray-100">{children}</p>,
                        strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
                        ul: ({ children }) => <ul className="list-disc pl-5 mb-2 space-y-1 text-gray-100">{children}</ul>,
                        ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 space-y-1 text-gray-100">{children}</ol>,
                        li: ({ children }) => <li className="ml-2 text-gray-100">{children}</li>
                      }}
                    >
                      {message.text}
                    </ReactMarkdown>
                  </div>
                )
              ) : (
                <p className="text-sm leading-relaxed">{message.text}</p>
              )}
            </div>
          </div>

              {/* Input/Bottoni dinamici dopo l'ultimo messaggio AI */}
              {showInputs && (
                <div className="flex justify-end mt-2 mb-4">
                  <div className="max-w-[80%]">
                    {phase === CHAT_PHASES.INTRODUCTION ? (
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => handleIntroductionResponse('yes')}
                          className="px-4 py-2 bg-gradient-to-r from-purple-500 to-blue-500 text-white rounded-lg font-medium hover:from-purple-600 hover:to-blue-600 transition-all"
                        >
                          Sì
                        </button>
                        <button
                          onClick={() => handleIntroductionResponse('no')}
                          className="px-4 py-2 bg-slate-600 text-white rounded-lg font-medium hover:bg-slate-700 transition-colors"
                        >
                          No, ho altre domande
                        </button>
                      </div>
                    ) : message.questionType === 'buttons' && currentQuestion && currentQuestion.options ? (
                      <div className="flex flex-wrap gap-2">
                        {currentQuestion.options.map((option) => (
                          <button
                            key={option.value}
                            onClick={() => {
                              const question = DATA_COLLECTION_QUESTIONS.find(q => q.id === message.questionId)
                              const optionLabel = question?.options?.find(opt => opt.value === option.value)?.label || option.value
                              handleDataCollectionResponse(message.questionId, option.value, optionLabel)
                            }}
                            className="px-4 py-2 bg-gradient-to-r from-purple-500 to-blue-500 text-white rounded-lg font-medium hover:from-purple-600 hover:to-blue-600 transition-all"
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    ) : message.questionType === 'number' && currentQuestion ? (
                      <div className="flex gap-2">
                        <input
                          type="number"
                          value={numberInputValue}
                          onChange={(e) => setNumberInputValue(e.target.value)}
                          onKeyPress={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              handleNumberSubmit()
                            }
                          }}
                          placeholder={currentQuestion.placeholder || 'Inserisci un numero'}
                          maxLength={3}
                          className="w-24 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <button
                          onClick={handleNumberSubmit}
                          disabled={!numberInputValue.trim()}
                          className="px-6 py-2 bg-gradient-to-r from-purple-500 to-blue-500 text-white rounded-lg font-medium hover:from-purple-600 hover:to-blue-600 disabled:bg-slate-600 disabled:text-gray-400 disabled:cursor-not-allowed transition-all"
                        >
                          Invia
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              )}
              
              {/* Pulsante di conferma riepilogo */}
              {message.isReview && index === messages.length - 1 && (
                <div className="flex justify-center mt-4 mb-4">
                  <button
                    onClick={() => completeDataCollection()}
                    disabled={isLoading}
                    className="relative px-8 py-3 bg-gradient-to-r from-purple-500 to-blue-500 text-white rounded-lg font-medium hover:from-purple-600 hover:to-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all confirm-button-border"
                  >
                    <span className="relative z-10">
                      {isLoading ? 'Generazione...' : 'Conferma e genera la dieta'}
                    </span>
                  </button>
                </div>
              )}
            </div>
          )
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area - solo in fase CHAT o quando c'è una domanda di tipo text da rispondere */}
      {(() => {
        // Mostra la barra di input se siamo in fase CHAT
        if (phase === CHAT_PHASES.CHAT) {
          return true
        }
        
        // Mostra la barra di input se siamo in fase DATA_COLLECTION e c'è una domanda di tipo text non risposta
        if (phase === CHAT_PHASES.DATA_COLLECTION) {
          const lastAIQuestion = messages
            .filter(msg => msg.sender === 'ai' && msg.questionId && !collectedData[msg.questionId])
            .pop()
          return lastAIQuestion?.questionType === 'text'
        }
        
        return false
      })() && (
        <div className="border-t border-slate-700 p-4 bg-slate-800 rounded-b-lg">
          <div className="flex gap-2">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={
                phase === CHAT_PHASES.DATA_COLLECTION
                  ? (() => {
                      const lastAIQuestion = messages
                        .filter(msg => msg.sender === 'ai' && msg.questionId && !collectedData[msg.questionId])
                        .pop()
                      return lastAIQuestion?.questionType === 'text'
                        ? lastAIQuestion.text
                        : 'Scrivi un messaggio...'
                    })()
                  : 'Scrivi un messaggio...'
              }
              disabled={isLoading}
              className="flex-1 px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:bg-slate-600 disabled:cursor-not-allowed"
            />
            <button
              onClick={handleSend}
              disabled={
                isLoading || 
                (phase === CHAT_PHASES.DATA_COLLECTION
                  ? (() => {
                      const lastAIQuestion = messages
                        .filter(msg => msg.sender === 'ai' && msg.questionId && !collectedData[msg.questionId])
                        .pop()
                      // Permetti invio vuoto solo per dietary_preferences
                      return !inputValue.trim() && lastAIQuestion?.questionId !== 'dietary_preferences'
                    })()
                  : !inputValue.trim())
              }
              className="px-6 py-2 bg-gradient-to-r from-purple-500 to-blue-500 text-white rounded-lg font-medium hover:from-purple-600 hover:to-blue-600 disabled:bg-slate-600 disabled:text-gray-400 disabled:cursor-not-allowed transition-all"
            >
              {isLoading ? 'Invio...' : 'Invia'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default Chat

