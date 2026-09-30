// Il piano alimentare generato da /v1/plan. A differenza della vecchia
// dieta in prosa (una singola stringa di testo dal modello, senza alcuna
// verifica), qui ogni grammo che vedi è stato validato server-side contro
// i target calcolati dal motore deterministico — il modello ha scelto gli
// alimenti, non i numeri.

const SLOT_LABELS = {
  breakfast: 'Colazione',
  morning_snack: 'Spuntino di metà mattina',
  lunch: 'Pranzo',
  afternoon_snack: 'Spuntino di metà pomeriggio',
  dinner: 'Cena'
}

const STATUS_BANNER = {
  ok: null, // il piano ha già centrato i target, nessun avviso necessario
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

export default function PlanCard ({ planStatus, plan }) {
  const banner = STATUS_BANNER[planStatus]

  if (!plan) {
    return banner ? <p className={`text-sm ${banner.tone}`}>{banner.text}</p> : null
  }

  return (
    <div className="text-sm leading-relaxed text-gray-100">
      <p className="mb-3 font-medium">Ecco il tuo piano alimentare:</p>

      {banner && <p className={`text-xs mb-3 ${banner.tone}`}>{banner.text}</p>}

      {plan.days.map((day, dayIdx) => (
        <div key={dayIdx} className="space-y-3">
          {day.meals.map((meal, mealIdx) => (
            <div key={mealIdx} className="bg-slate-800/60 rounded-lg px-3 py-2">
              <span className="text-xs font-semibold text-purple-300 uppercase tracking-wide">
                {SLOT_LABELS[meal.slot] || meal.slot}
              </span>
              <ul className="mt-1 space-y-0.5">
                {meal.items.map((item, itemIdx) => (
                  <li key={itemIdx} className="text-gray-200">
                    {item.name || item.food_key} — {Math.round(item.grams)} g
                    {item.note ? <span className="text-gray-400"> ({item.note})</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
