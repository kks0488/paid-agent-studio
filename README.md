# Paid Agent Studio

Turn product facts into English or Korean content, with PayPal Sandbox checkout and a refund after two failed content checks.

**[Try it](https://paid-agent-studio.vercel.app)** · [Source](https://github.com/kks0488/paid-agent-studio)

- Choose a fixed-price product page, ad copy and short-video script package.
- Pay through PayPal Sandbox, then generate and review live Nebius content.
- Download Markdown/JSON and inspect the payment, content-check and refund timeline.

Use fictional product facts and Sandbox test payments. Guest checkout uses PayPal’s [Sandbox card generator](https://developer.paypal.com/sandbox-testing/card-testing/); a Sandbox personal buyer is the alternative. The labeled refund scenario deliberately fails both checks.

```mermaid
flowchart LR
  Seller --> Studio --> PayPal[PayPal Sandbox capture]
  PayPal --> Claim[One-time job claim in existing AWS DynamoDB]
  Claim --> Nebius[Live Nebius copy] --> QC[Content checks]
  QC --> Delivery[Stored bundle and downloads]
  QC --> Refund[Full Sandbox refund after two failures]
```

Sponsor technology:

- **PayPal Orders v2 / Payments v2:** create, retrieve and capture orders; check captures/refunds; refund the original capture. Server rules fix prices and refund eligibility. Financial requests keep stable idempotency keys. PayPal verifies webhook signatures.
- **[Nebius Token Factory](https://docs.tokenfactory.nebius.com/quickstart):** OpenAI-compatible structured generation in English/Korean. Prompts use seller facts; rejected passages are corrected without replacing the rest of the draft. Checks flag specified unsupported claims. With no LLM key, content is labeled deterministic demo mode.

## Quick start

Node 22. Run installs, builds and browser checks on pilot/Linux.

```sh
npm ci
cp .env.example .env.local
npm test
npm run build
npm start
```

Set PayPal Sandbox credentials, webhook ID and a signing secret. `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` select the model. `STATE_URL` and `STATE_SECRET` use the authenticated CAS endpoint in our existing Shorts QC AWS stack (`CommerceStateSecrets` parameter). Keep secrets server-side; `.env.example` has empty credential values.

Each one-time nonce is bound to the product brief, PayPal order and capture. Old receipts recover the stored result; they cannot generate again or refund completed work. Successful delivery blocks automatic refunds; downloading records acceptance. The app checks current PayPal capture/refund state before fulfillment, refunds and downloads. Financial completion records do not expire. Storage outages fail closed; interrupted generation needs seller review. Legacy receipts cannot start new work.

Receipts are signed and tied to the browser cookie. Keep that browser for recovery. This is a Sandbox prototype. Automated checks catch specified claims and unfinished sentences; sellers still review every draft before publishing.

Tests cover payment identity, prices, webhook signatures, replay after memory reset, concurrent claims, changed captures, acceptance, refunds, provider failures and observed English/Korean copy errors. GitHub Actions runs tests, build and secret scanning. Real screenshots are in `media/`; live copy and production samples are outside the repo in `hackathons/paypal/samples/`. A narrated video and Devpost submission remain owner tasks.

## What was built during the hackathon

Studio UI, fixed-price packages, PayPal tools/webhooks, live structured copy, source/claim checks, durable fulfillment, browser ledger, exports, tests, CI and deployment. The prompt/parser base reuses our own MIT commerce-content-engine code.

[MIT](LICENSE) · Copyright (c) 2026 Kyoungsoo Kim.
