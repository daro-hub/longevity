'use client'

import { useState } from 'react'

// Il piano alimentare generato da /v1/plan, con la possibilità di
// modificarlo: scambiare un ingrediente (con alternative proposte senza
// alcuna chiamata al modello — pura distanza di macro), rigenerare un
// pasto/giorno/tutto il piano, o chiedere qualsiasi cosa in linguaggio
// naturale. Ogni modifica, qualunque sia la via con cui arriva, passa
// dalla stessa pipeline di validazione del piano iniziale: nessuna
// scorciatoia rende una modifica meno verificata di una generazione.

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || 'https://longevity-backend-07su.onrender.com'
const PLAN_EDIT_ENDPOINT = `${API_BASE_URL}/v1/plan/edit`
const PLAN_CHAT_ENDPOINT = `${API_BASE_URL}/v1/plan/chat`
const PLAN_ALTERNATIVES_ENDPOINT = `${API_BASE_URL}/v1/plan/alternatives`

const SLOT_LABELS = {
  breakfast: 'Colazione',
  morning_snack: 'Spuntino di metà mattina',
  lunch: 'Pranzo',
  afternoon_snack: 'Spuntino di metà pomeriggio',
  dinner: 'Cena'
}

const STATUS_BANNER = {
  ok: null,
  repaired: {
    text: 'Il piano è stato leggermente corretto per centrare meglio i tuoi target.',
    tone: 'text-blue-300'
  },
  targets_only: {
    text:
      'Non sono riuscito a generare un piano che rispettasse i target con sufficiente precisione. I valori calcolati restano comunque corretti.',
    tone: 'text-amber-300'
  }
}

export default function PlanCard ({ planStatus, plan, profile, onPlanUpdated }) {
  const [openAlternativesFor, setOpenAlternativesFor] = useState(null) // {dayIdx, mealIdx, itemIdx, foodKey}
  const [alternatives, setAlternatives] = useState([])
  const [loadingAction, setLoadingAction] = useState(null) // chiave dell'azione in corso, per disabilitare i bottoni
  const [chatInput, setChatInput] = useState('')
  const [chatReply, setChatReply] = useState('')

  const banner = STATUS_BANNER[planStatus]

  const postJson = async (url, body) => {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    if (!response.ok) throw new Error(`Errore: ${response.status}`)
    return response.json()
  }

  const runEdit = async (actionKey, scope, instruction) => {
    if (!profile || loadingAction) return
    setLoadingAction(actionKey)
    try {
      const data = await postJson(PLAN_EDIT_ENDPOINT, { ...profile, plan, scope, instruction })
      if (data.plan) onPlanUpdated(data.plan, data.plan_status)
    } catch (error) {
      console.error('Errore nella modifica del piano:', error)
    } finally {
      setLoadingAction(null)
      setOpenAlternativesFor(null)
    }
  }

  const regenerateWhole = () =>
    runEdit('plan', { kind: 'plan' }, 'proponi un piano diverso, con alimenti differenti')

  const regenerateDay = (dayIdx) =>
    runEdit(`day-${dayIdx}`, { kind: 'day', day_index: dayIdx }, 'proponi una giornata diversa')

  const regenerateMeal = (dayIdx, mealIdx) =>
    runEdit(
      `meal-${dayIdx}-${mealIdx}`,
      { kind: 'meal', day_index: dayIdx, meal_index: mealIdx },
      'proponi un pasto diverso'
    )

  const swapItem = (dayIdx, mealIdx, itemIdx, newFoodKey, newName) =>
    runEdit(
      `item-${dayIdx}-${mealIdx}-${itemIdx}`,
      { kind: 'item', day_index: dayIdx, meal_index: mealIdx, item_index: itemIdx },
      `sostituisci con ${newName || newFoodKey}`
    )

  const showAlternatives = async (dayIdx, mealIdx, itemIdx, foodKey) => {
    const key = `alt-${dayIdx}-${mealIdx}-${itemIdx}`
    setOpenAlternativesFor({ dayIdx, mealIdx, itemIdx, foodKey })
    setLoadingAction(key)
    try {
      const data = await postJson(PLAN_ALTERNATIVES_ENDPOINT, { food_key: foodKey, n: 3 })
      setAlternatives(data.alternatives || [])
    } catch (error) {
      console.error('Errore nel recupero delle alternative:', error)
      setAlternatives([])
    } finally {
      setLoadingAction(null)
    }
  }

  const sendChatMessage = async () => {
    const message = chatInput.trim()
    if (!message || !profile || loadingAction) return
    setLoadingAction('chat')
    setChatReply('')
    try {
      const data = await postJson(PLAN_CHAT_ENDPOINT, { ...profile, plan, message })
      setChatReply(data.reply || '')
      if (data.plan) onPlanUpdated(data.plan, data.plan_status)
      setChatInput('')
    } catch (error) {
      console.error('Errore nella chat sul piano:', error)
      setChatReply('Mi dispiace, si è verificato un errore. Riprova.')
    } finally {
      setLoadingAction(null)
    }
  }

  if (!plan) {
    return banner ? <p className={`text-sm ${banner.tone}`}>{banner.text}</p> : null
  }

  return (
    <div className="text-sm leading-relaxed text-gray-100">
      <div className="flex items-center justify-between mb-3">
        <p className="font-medium">Ecco il tuo piano alimentare:</p>
        <button
          onClick={regenerateWhole}
          disabled={!!loadingAction}
          className="text-xs px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded disabled:opacity-50 transition-colors"
        >
          {loadingAction === 'plan' ? 'Rigenero...' : '🔄 Rigenera tutto'}
        </button>
      </div>

      {banner && <p className={`text-xs mb-3 ${banner.tone}`}>{banner.text}</p>}

      {plan.days.map((day, dayIdx) => (
        <div key={dayIdx} className="space-y-3 mb-3">
          {plan.days.length > 1 && (
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-400">Giorno {dayIdx + 1}</span>
              <button
                onClick={() => regenerateDay(dayIdx)}
                disabled={!!loadingAction}
                className="text-xs px-2 py-0.5 bg-slate-700 hover:bg-slate-600 rounded disabled:opacity-50 transition-colors"
              >
                {loadingAction === `day-${dayIdx}` ? '...' : '🔄 giornata'}
              </button>
            </div>
          )}
          {day.meals.map((meal, mealIdx) => (
            <div key={mealIdx} className="bg-slate-800/60 rounded-lg px-3 py-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-purple-300 uppercase tracking-wide">
                  {SLOT_LABELS[meal.slot] || meal.slot}
                </span>
                <button
                  onClick={() => regenerateMeal(dayIdx, mealIdx)}
                  disabled={!!loadingAction}
                  className="text-xs text-gray-400 hover:text-white disabled:opacity-50 transition-colors"
                  title="Rigenera questo pasto"
                >
                  {loadingAction === `meal-${dayIdx}-${mealIdx}` ? '...' : '🔄'}
                </button>
              </div>
              <ul className="mt-1 space-y-1">
                {meal.items.map((item, itemIdx) => {
                  const altKey = `alt-${dayIdx}-${mealIdx}-${itemIdx}`
                  const isOpen =
                    openAlternativesFor &&
                    openAlternativesFor.dayIdx === dayIdx &&
                    openAlternativesFor.mealIdx === mealIdx &&
                    openAlternativesFor.itemIdx === itemIdx

                  return (
                    <li key={itemIdx}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-gray-200">
                          {item.name || item.food_key} — {Math.round(item.grams)} g
                          {item.note ? <span className="text-gray-400"> ({item.note})</span> : null}
                        </span>
                        <button
                          onClick={() => showAlternatives(dayIdx, mealIdx, itemIdx, item.food_key)}
                          disabled={!!loadingAction}
                          className="text-xs text-gray-400 hover:text-white disabled:opacity-50 transition-colors shrink-0"
                          title="Vedi alternative"
                        >
                          {loadingAction === altKey ? '...' : '⇄'}
                        </button>
                      </div>
                      {isOpen && (
                        <div className="mt-1 ml-2 flex flex-wrap gap-1">
                          {alternatives.length === 0 && loadingAction !== altKey && (
                            <span className="text-xs text-gray-500">Nessuna alternativa trovata.</span>
                          )}
                          {alternatives.map((alt) => (
                            <button
                              key={alt.food_key}
                              onClick={() => swapItem(dayIdx, mealIdx, itemIdx, alt.food_key, alt.name)}
                              disabled={!!loadingAction}
                              className="text-xs px-2 py-0.5 bg-purple-600/40 hover:bg-purple-600/70 rounded disabled:opacity-50 transition-colors"
                            >
                              {alt.name}
                            </button>
                          ))}
                          <button
                            onClick={() => setOpenAlternativesFor(null)}
                            className="text-xs px-2 py-0.5 text-gray-500 hover:text-gray-300"
                          >
                            annulla
                          </button>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      ))}

      {/* Chat libera sul piano — "qualsiasi cosa farebbe una nutrizionista" */}
      <div className="mt-3 pt-3 border-t border-slate-700">
        {chatReply && <p className="text-xs text-gray-300 mb-2 italic">{chatReply}</p>}
        <div className="flex gap-2">
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                sendChatMessage()
              }
            }}
            placeholder="Es. 'scambia il pollo con qualcosa di più leggero', 'fai un solo pasto al giorno'..."
            disabled={!!loadingAction}
            className="flex-1 px-3 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-xs placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
          />
          <button
            onClick={sendChatMessage}
            disabled={!!loadingAction || !chatInput.trim()}
            className="text-xs px-3 py-1.5 bg-gradient-to-r from-purple-500 to-blue-500 rounded-lg disabled:opacity-50 transition-all"
          >
            {loadingAction === 'chat' ? 'Invio...' : 'Chiedi'}
          </button>
        </div>
      </div>
    </div>
  )
}
