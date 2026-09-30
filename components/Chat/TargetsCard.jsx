// "Come è stato calcolato" — il pannello che rende leggibile in pochi
// secondi il pezzo genuinamente nuovo del progetto: questi numeri non li
// ha inventati un modello linguistico, li ha calcolati un motore
// deterministico e testato (vedi longevity-backend/app/domain/). Ogni
// costante usata ha una citazione, consultabile su GET /v1/references.

function StatPill ({ label, value, sublabel }) {
  return (
    <div className="bg-slate-800/60 rounded-lg px-3 py-2 flex flex-col">
      <span className="text-xs text-gray-400">{label}</span>
      <span className="text-lg font-semibold text-white">{value}</span>
      {sublabel && <span className="text-xs text-gray-400">{sublabel}</span>}
    </div>
  )
}

export default function TargetsCard ({ data }) {
  if (!data || data.refused || !data.targets) {
    return null
  }

  const { targets, disclaimer } = data
  const { calories, macros, bmi, hydration_ml: hydrationMl, warnings } = targets

  return (
    <div className="text-sm leading-relaxed text-gray-100">
      <p className="mb-3 font-medium">
        Ecco i tuoi valori calcolati (BMI {bmi}, formula di Mifflin-St Jeor):
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
        <StatPill
          label="Calorie giornaliere"
          value={`${Math.round(calories.kcal)} kcal`}
          sublabel={calories.floor_applied ? 'soglia di sicurezza applicata' : undefined}
        />
        <StatPill label="Proteine" value={`${macros.protein_g} g`} />
        <StatPill label="Carboidrati" value={`${macros.carb_g} g`} />
        <StatPill label="Grassi" value={`${macros.fat_g} g`} />
        <StatPill label="Fibre" value={`${macros.fiber_g} g`} />
        <StatPill label="Acqua" value={`${(hydrationMl / 1000).toFixed(1)} L`} />
      </div>

      <p className="text-xs text-gray-400 mb-2">
        Il fabbisogno calorico (TDEE stimato: {Math.round(calories.tdee_kcal)} kcal) è una
        stima, tipicamente accurata entro ±{Math.round(calories.uncertainty_pct * 100)}%
        per una singola persona.
      </p>

      {warnings && warnings.length > 0 && (
        <ul className="text-xs text-amber-300 mb-2 list-disc pl-4 space-y-1">
          {warnings.map((w) => (
            <li key={w.code}>{w.message}</li>
          ))}
        </ul>
      )}

      {disclaimer && <p className="text-xs text-gray-500 italic">{disclaimer}</p>}
    </div>
  )
}
