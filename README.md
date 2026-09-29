# Longevity — AI Nutrition Assistant

Longevity is a nutrition-focused chat assistant that answers questions using only real scientific sources — not generic AI guesses.

**Live demo:** https://longevity-alpha.vercel.app
**Backend repository:** https://github.com/daro-hub/longevity-backend

## The idea

Everything a nutritionist knows, they ultimately learned from documents — scientific papers, guidelines, studies. That's exactly the kind of knowledge a RAG (retrieval-augmented generation) system can consult and answer from, grounded in real sources instead of guessing.

## How it works

Nutrition documents are indexed in a vector database ([Pinecone](https://www.pinecone.io/)); when a question comes in, the [backend](https://github.com/daro-hub/longevity-backend) retrieves the most relevant passages and asks GPT-4 to answer using only that context. On top of the Q&A core, the chat runs a short intake (age, weight, height, activity level, goals) and uses that profile to personalize the guidance it gives.

The one part of an in-person nutritionist visit that can't be replicated is the physical exam — letting users optionally upload a file with fuller biometric data for an even more accurate result is the next planned refinement.

## Stack

- Next.js + React (chat UI, `components/Chat`)
- Talks directly to the [longevity-backend](https://github.com/daro-hub/longevity-backend) API
- Deployed on Vercel

## Local setup

```bash
npm install
npm run dev
```

Open http://localhost:3000. The chat talks to the live backend by default — run [longevity-backend](https://github.com/daro-hub/longevity-backend) locally too if you want to point it at your own instance.
