/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async headers () {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // NOT X-Frame-Options: SAMEORIGIN — this site is deliberately
          // embedded in an <iframe> as a live preview on
          // https://daro-hub.github.io/francesco-portfolio/. CSP
          // frame-ancestors is the modern replacement and, unlike
          // X-Frame-Options, supports naming that one external origin
          // explicitly instead of choosing between "nobody" and "anybody".
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors 'self' https://daro-hub.github.io"
          }
        ]
      }
    ]
  }
}

module.exports = nextConfig
