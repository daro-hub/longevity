import './globals.css'
import Image from 'next/image'

export const metadata = {
  title: 'Longevity',
  description: 'Chat con la tua nutrizionista AI',
  icons: {
    icon: '/longevity.png',
    shortcut: '/longevity.png',
    apple: '/longevity.png'
  }
}

export default function RootLayout ({ children }) {
  return (
    <html lang="it">
      <body className="bg-slate-900 min-h-screen">
        <nav className="bg-slate-800 shadow-lg border-b border-slate-700">
          <div className="max-w-4xl mx-auto px-4 py-4">
            <div className="flex items-center gap-3">
              <Image
                src="/longevity.png"
                alt="Longevity Logo"
                width={32}
                height={32}
                className="rounded"
              />
              <h1 className="text-2xl font-semibold bg-gradient-to-r from-purple-500 to-blue-500 bg-clip-text text-transparent">
                Longevity
              </h1>
            </div>
          </div>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  )
}

