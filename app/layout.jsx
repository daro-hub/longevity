import './globals.css'
import Image from 'next/image'

const SITE_URL = 'https://longevity-alpha.vercel.app'
const DESCRIPTION =
  'Chat con la tua nutrizionista AI: target nutrizionali calcolati da un motore deterministico e testato, risposte fondate su fonti scientifiche.'

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'Longevity',
  description: DESCRIPTION,
  icons: {
    icon: '/favicon-64.png',
    shortcut: '/favicon-64.png',
    apple: '/favicon-64.png'
  },
  openGraph: {
    title: 'Longevity',
    description: DESCRIPTION,
    url: SITE_URL,
    siteName: 'Longevity',
    images: ['/longevity.png'],
    locale: 'it_IT',
    type: 'website'
  },
  twitter: {
    card: 'summary',
    title: 'Longevity',
    description: DESCRIPTION,
    images: ['/longevity.png']
  }
}

export const viewport = {
  width: 'device-width',
  initialScale: 1
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
