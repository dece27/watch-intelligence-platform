# Watch Intelligence Platform (WatchVault)

Watch Intelligence Platform is a collector-focused web application for managing luxury watch portfolios, tracking market signals, and making data-informed buy/sell decisions with AI-assisted insights.

## Project Goal

The goal of this project is to provide a single operating system for watch collectors:

- Maintain a structured, searchable collection vault
- Monitor portfolio performance and valuation trends
- Track market sentiment, auction outcomes, and price movers
- Discover and score deals based on portfolio fit
- Generate appraisal-ready watch reports
- Use AI to identify watches, analyze signals, and suggest rebalancing actions

## Main Features & Capabilities

### 1) Collection Vault
- Add, edit, remove, filter, and search watches
- Capture full watch metadata (brand, model, reference, condition, accessories, notes)
- Import collection data via CSV
- Upload photos with safe URL/data handling and persisted storage
- Share read-only collection links

### 2) Portfolio Intelligence
- Portfolio health scoring and ROI tracking
- Brand and allocation visualization
- Hold-period analysis and performance breakdowns
- Live market value enrichment for owned watches
- What-if sell scenario support

### 3) Market Intelligence
- Multi-brand trend and sentiment tracking
- Price alerts and top-mover monitoring
- Recent auction result aggregation and display
- Brand-level index snapshots for quick market context

### 4) AI Advisor
- AI Signal Engine for personalized market and portfolio signals
- Rebalancing recommendations (sell/buy guidance and strategic score)
- AI-assisted watch image identification with file upload/camera input
- Per-user caching for signal/deal analysis efficiency

### 5) Deals Discovery
- Deal sourcing with fallback data support
- Match and deal scoring based on user preferences and owned brands
- Filtering by budget, condition, box/papers, and preferred brands
- Deal detail views with contextual scoring signals

### 6) Appraisal Reporting
- Professional appraisal report generation for owned watches
- Market-value-backed valuation output when available
- Print-ready report experience

### 7) Authentication, Admin, and Analytics
- User login with persisted vault context
- Owner/admin-only dashboards for platform feedback and user analytics
- Admin controls for user-level cleanup and system resets (non-admin data)

## Tech Stack

- React + TypeScript + Vite
- Tailwind CSS + Radix UI primitives
- Spark KV storage (`window.spark.kv`) for persisted user and collection data
- Charting via Recharts and AI integrations through Spark-backed calls

## Local Development

```bash
npm install
npm run dev
```

Available scripts:

- `npm run dev` — start development server
- `npm run lint` — run ESLint
- `npm run build` — run TypeScript build and Vite production build
- `npm run preview` — preview production build

## License

This repository is licensed under the MIT License.
