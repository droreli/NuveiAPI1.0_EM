# Nuvei API Emulator

Browser-based emulator for testing Nuvei REST API 1.0 payment flows. Replaces Postman with a simple, non-technical UI that runs real API calls against the Nuvei sandbox.

## Features

- **6 Pre-built Scenarios**: 3DS Challenge, 3DS Frictionless, Simple Auth+Settle, External MPI, MPI-only, Recurring
- **Real API Calls**: Connects to `https://ppp-test.safecharge.com`
- **Automatic Checksum**: SHA-256/SHA-1 calculation handled by backend
- **3DS Challenge Support**: Built-in iframe for 3DS simulator
- **JSON Export**: Download sanitized results for sharing/debugging

## Project Structure

```
├── src/                    # Cloudflare Worker backend
│   ├── worker.ts          # Main request handler
│   ├── engine.ts          # Scenario execution engine
│   ├── checksum.ts        # Checksum calculation
│   ├── scenarios.ts       # Scenario definitions
│   └── types.ts           # TypeScript types
├── frontend/              # React frontend (Vite)
│   ├── src/
│   │   ├── App.tsx        # Main app component
│   │   ├── api.ts         # API client
│   │   ├── styles.css     # Nuvei-branded styles
│   │   └── main.tsx       # Entry point
│   └── index.html
├── wrangler.toml          # Cloudflare configuration
└── package.json
```

## Deployment to Cloudflare

### Prerequisites

1. [Cloudflare account](https://dash.cloudflare.com/sign-up)
2. [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)

### Branch Strategy

- **`main` branch**: Stable production version
- **`dev` branch**: Testing and development version

### Steps

1. **Install dependencies**:
   ```bash
   npm install
   cd frontend && npm install && cd ..
   ```

2. **Login to Cloudflare**:
   ```bash
   npx wrangler login
   ```

3. **Deploy to Development** (for testing new features):
   ```bash
   git checkout dev
   npm run deploy:dev
   ```
   Live at: `https://nuvei-api-emulator-dev.<your-subdomain>.workers.dev`

4. **Deploy to Production** (stable release):
   ```bash
   git checkout main
   npm run deploy:prod
   ```
   Live at: `https://nuvei-api-emulator.<your-subdomain>.workers.dev`

### Development Workflow

1. Make changes on the `dev` branch
2. Test by deploying to dev environment: `npm run deploy:dev`
3. When satisfied, merge `dev` → `main`
4. Deploy to production: `npm run deploy:prod`

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/env/test` | POST | Test sandbox credentials |
| `/api/scenarios` | GET | List all scenarios |
| `/api/scenarios/:id` | GET | Get scenario details |
| `/api/scenarios/:id/run` | POST | Run full scenario |
| `/api/scenarios/:id/step/:stepId/run` | POST | Run single step |

## Test Cards

| Card Number | Type | Behavior |
|-------------|------|----------|
| `4000020951595032` | Visa | 3DS Challenge |
| `4000027891380961` | Visa | 3DS Frictionless |

## Usage

1. Enter your Nuvei sandbox credentials (Merchant ID, Site ID, Secret Key)
2. Click "Test Connection" to verify
3. Select a scenario from the grid
4. Click "Run All Steps" or run individual steps
5. View request/response JSON for each step
6. Export results as JSON for documentation

## Security Notes

- Credentials are sent per-request, never stored on server
- Checksums calculated server-side (secrets not exposed to frontend)
- Card numbers masked in exported JSON
- Only sandbox environment supported

## License

Internal Nuvei tool.
