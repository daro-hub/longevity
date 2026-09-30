'use client'

// Cattura errori nel root layout stesso, dove error.jsx non basta (deve
// fornire il proprio <html>/<body> perché sostituisce l'intero root layout).
export default function GlobalError ({ reset }) {
  return (
    <html lang="it">
      <body className="bg-slate-900 min-h-screen flex items-center justify-center">
        <div className="text-center px-4">
          <h2 className="text-xl font-semibold text-white mb-2">Qualcosa è andato storto</h2>
          <button
            onClick={() => reset()}
            className="px-6 py-2 bg-gradient-to-r from-purple-500 to-blue-500 text-white rounded-lg font-medium"
          >
            Riprova
          </button>
        </div>
      </body>
    </html>
  )
}
