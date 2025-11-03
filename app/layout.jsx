import './globals.css'

export const metadata = {
  title: 'Nutrizionista AI',
  description: 'Chat con la tua nutrizionista AI'
}

export default function RootLayout ({ children }) {
  return (
    <html lang="it">
      <body className="bg-gray-50 min-h-screen">
        <nav className="bg-white shadow-sm border-b border-gray-200">
          <div className="max-w-4xl mx-auto px-4 py-4">
            <h1 className="text-2xl font-semibold text-gray-800">
              Nutrizionista AI
            </h1>
          </div>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  )
}

