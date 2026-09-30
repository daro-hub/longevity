'use client'

// Nessun error boundary esisteva prima: un throw a runtime (es. react-markdown
// che incontra un output malformato) azzerava l'intera app sulla schermata di
// errore generica di Next. Questo lo intercetta e offre un modo per riprovare.
export default function Error ({ error, reset }) {
  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-16 text-center">
      <h2 className="text-xl font-semibold text-white mb-2">Qualcosa è andato storto</h2>
      <p className="text-gray-400 mb-6">
        Si è verificato un errore imprevisto. Puoi riprovare oppure tornare alla home.
      </p>
      <button
        onClick={() => reset()}
        className="px-6 py-2 bg-gradient-to-r from-purple-500 to-blue-500 text-white rounded-lg font-medium hover:from-purple-600 hover:to-blue-600 transition-all"
      >
        Riprova
      </button>
    </div>
  )
}
