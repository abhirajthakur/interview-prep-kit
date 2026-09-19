# Starter Template

A production-ready TypeScript Express.js starter template with PostgreSQL, structured logging, environment validation, versioned routers, and more.
## Tech Stack

| Category     | Technology                                    |
| ------------ | --------------------------------------------- |
| Runtime      | Node.js                                       |
| Framework    | Express 5                                     |
| Language     | TypeScript (strict mode)                      |
| Database     | PostgreSQL                                    |
| ORM          | Drizzle ORM                                   |
| Logging      | Winston (structured, correlation IDs)         |
| Validation   | Zod (env + schemas)                           |
| Package Mgr  | pnpm                                          |

## Project Structure

```
src/
├── app.ts                  # Express app setup & middleware
├── index.ts                # Entry point — starts server & handles shutdown
├── config/
│   └── env.ts              # Environment variable validation (Zod)
├── db/
│   ├── client.ts           # Database connection
│   ├── schema.ts           # Drizzle table definitions
│   └── relations.ts        # Drizzle relations
├── lib/
│   ├── logger.ts            # Winston logger (dev/json formats, correlation ID)
│   └── async-context.ts     # AsyncLocalStorage for request context
├── middlewares/
│   ├── correlation-id.ts   # Attaches correlation ID to each request
│   ├── error-handler.ts     # Centralized error handling
│   ├── route-not-found.ts  # 404 handler
│   └── validate.ts          # Request validation middleware
├── routers/
│   └── v1/
│       ├── index.router.ts # API v1 router mount
│       └── [resource].router.ts  # Resource routes (add your own)
├── controllers/            # Route handlers
├── services/               # Business logic
├── repositories/           # Data access layer
├── schemas/                # Zod validation schemas
└── utils/
    ├── api-error.ts         # Custom API error class
    └── api-response.ts      # Standardized response helper
```

## Getting Started

### Prerequisites

- Node.js 22+
- PostgreSQL 16+
- pnpm 12+

### Installation

```bash
pnpm install
```

### Environment Setup

Copy the example environment file and fill in your values:

```bash
cp .env.example .env
```

| Variable       | Description              | Default                    |
| -------------- | ------------------------ | -------------------------- |
| `NODE_ENV`     | Environment              | `development`              |
| `PORT`         | Server port              | `3000`                     |
| `DATABASE_URL` | PostgreSQL connection URL| _(required)_               |
| `CORS_ORIGIN`  | Allowed CORS origin      | `http://localhost:5173`    |

### Database

Generate and run migrations:

```bash
pnpm db:generate
pnpm db:migrate
```

Open Drizzle Studio for visual DB management:

```bash
pnpm db:studio
```

## Scripts

| Command         | Description                       |
| --------------- | --------------------------------- |
| `pnpm dev`      | Start dev server with hot reload  |
| `pnpm build`    | Compile TypeScript to `dist/`     |
| `pnpm start`    | Run production build              |
| `pnpm typecheck`| Run TypeScript type checking      |
| `pnpm clean`    | Remove `dist/` directory          |
| `pnpm db:generate` | Generate Drizzle migrations    |
| `pnpm db:migrate`  | Run Drizzle migrations          |
| `pnpm db:studio`   | Open Drizzle Studio            |

## API

| Method | Endpoint         | Description       |
| ------ | ---------------- | ----------------- |
| GET    | `/health`        | Health check      |
| *      | `/api/v1/*`      | Versioned API     |

## Features

- **Structured Logging** — Winston logger with colorized dev output and JSON production logs, with correlation IDs tracked across async contexts
- **Environment Validation** — All env variables validated at startup with Zod, failing fast on missing/invalid config
- **Graceful Shutdown** — Handles SIGTERM/SIGINT, closes HTTP server before exiting
- **Error Handling** — Centralized error middleware with custom API error types
- **Request Validation** — Zod-powered schema validation for requests
- **Correlation IDs** — AsyncLocalStorage-based correlation ID propagated through all request logs
- **Versioned Routers** — API versioning built into router structure (`/api/v1/...`)
- **CORS** — Configurable CORS origins
- **Drizzle ORM** — Type-safe SQL with migration support and Studio IDE
