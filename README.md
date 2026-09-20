# CHIKILUKY.app — Beauty & Personal Care Booking Ecosystem

[![Astro](https://img.shields.io/badge/Astro-6.3-FF5D01?logo=astro&logoColor=white)](https://astro.build)
[![Preact](https://img.shields.io/badge/Preact-10-673AB8?logo=preact&logoColor=white)](https://preactjs.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.x-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres_%2B_Auth_%2B_Realtime-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com)
[![Vercel](https://img.shields.io/badge/Deploy-Vercel-000000?logo=vercel&logoColor=white)](https://vercel.com)
[![Node](https://img.shields.io/badge/Node-22.x-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![License](https://img.shields.io/badge/License-Proprietary-red)](#-license)

> **One ecosystem for booking beauty and personal-care services in Venezuela — no WhatsApp threads, no double-booked chairs, no currency guesswork.**

<details>
<summary><strong>📚 Table of contents</strong></summary>

1. [Short Pitch](#-short-pitch)
2. [Key Features](#-key-features)
3. [Tech Stack](#-tech-stack)
4. [Architecture & Workflow](#-architecture--workflow)
5. [Project Structure](#-project-structure)
6. [Data Model](#-data-model)
7. [Getting Started](#-getting-started)
8. [Usage Examples](#-usage-examples)
9. [Future Improvements / Roadmap](#-future-improvements--roadmap)
10. [Conventions & Contributing](#-conventions--contributing)
11. [License](#-license)

</details>

---

## 📌 Short Pitch

**CHIKILUKY** is a server-rendered, role-aware marketplace where clients discover salons and independent specialists, book real time slots, and pay with local methods (Pago Móvil, Zelle, cash) — while professionals manage their agenda, services, team, and payment methods from a dedicated dashboard. The core problem it solves is operational chaos: appointments live in chat threads and paper notebooks, and prices are quoted in USD while everything is actually paid in Bolivars at a moving rate.

The architecture is a **single Astro 6 application running in SSR mode** on Vercel, with **Supabase** (Postgres + Auth + Realtime) as the single source of truth. Interactive surfaces are **Preact islands** hydrated on demand, business rules that must not be bypassed are enforced in the database through **Row Level Security policies and PL/pgSQL triggers**, and the official **BCV exchange rate is scraped server-side** and pushed to every open session over Supabase Realtime.

---

## ✨ Key Features

### Booking & Marketplace
- **Salon / specialist discovery** with text search and 9 curated categories (Peluquería, Barbería, Uñas, Estética y Cejas, Masajes y Spa, Maquillaje, Tatuajes, Depilación, Podología).
- **4-step booking wizard** (`BookingFlow`): service → specialist → date & time → payment, dynamically collapsing the specialist step when the business has a single provider.
- **Real availability engine**: slot grid generated from each service's duration (30/60-min steps, 09:00–19:00) and cross-checked against **both** `reservas` and the legacy `citas` table to prevent double-booking.
- **Contextual specialist labels**: step 2 is renamed from the business category (*Barbero*, *Manicurista*, *Tatuador*, *Estilista*, *Masajista*, *Maquillador*, *Podólogo*, *Esteticista*).
- **Dual-write booking**: each booking is persisted to `reservas` **and** mirrored into the legacy `citas` agenda, keeping older dashboards consistent.
- **Auto-provisioned chat**: confirming a booking creates (or reuses) the client↔professional chat room and posts a system confirmation message.

### Payments & Currency
- **Native BCV web scraper** (`/api/update-bcv`) that reads the official `id="dolar"` container from `bcv.org.ve`, with an automatic **fallback to the last stored rate** when the portal is down or blocking requests.
- **Dual authorization model** for the scraper: a shared `CRON_SECRET` token (cron/automation) **or** an authenticated session whose role is `experto`, `soporte`, or `administrador`.
- **Live rate propagation**: booking flows, service managers, and pro dashboards subscribe to `configuracion_sistema` `UPDATE` events over Supabase Realtime and re-render Bolivar prices instantly.
- **Deterministic, locale-safe currency formatting** (`convertirRefABs`): rounds to 2 decimals and formats to Venezuelan notation (`1.250,50 Bs`) without depending on OS/ICU locale data.
- **Six payment methods** configurable per business: Pago Móvil, Zelle, cash, PayPal, Zinli, and Binance Pay — each with primary/secondary accounts, plus a "reserve without prepayment" switch.
- **Payment verification workflow** for professionals: `pendiente_verificacion` → `verificado` / `rechazado`, with reference and issuing-bank details surfaced on each agenda card.

### Chat & Support
- **Realtime chat** over Supabase Postgres Changes (`salas_chat` + `mensajes_chat`) with deduplicated message inserts and sticky auto-scroll.
- **Three room types**: `cliente_profesional`, `soporte`, and `soporte_anonimo`.
- **Anonymous support sessions**: unauthenticated visitors receive a generated `chikiluky_chat_session` identity (localStorage + 1-year cookie), so pre-sales questions never hit a login wall.
- **Floating support widget** on the landing page, lazily imported and hydrated on interaction to stay off the critical rendering path.
- **Unified agent inbox** (`SoporteAdminInbox`) listing every room with last-message previews, backed by two Realtime subscriptions (`admin-rooms`, `admin-messages`).
- **Business rule enforced in the database**: a trigger blocks a professional from opening a `cliente_profesional` conversation — the client must start it first.

### SaaS Plans & Limits
- **Three tiers**: `gratis` ($0), `plata` ($15 / 30 days), `oro` ($30 / 30 days).
- **Limits enforced twice**: in the UI (`GestionServicios`, `GestionEspecialistas`) and in the database via `trg_check_servicio_limit` / `trg_check_specialists_limit`.

  | Plan | Services | Specialists |
  | :--- | :--- | :--- |
  | **Gratis** | max **3** | max **1** |
  | **Plata** | unlimited | max **3** |
  | **Oro** | unlimited | unlimited |

- **Self-service upgrade flow** (`/app/experto/pagar?plan=plata|oro`): computes the Bolivar amount from the live BCV rate, validates the reference format (`^\d{4,12}$`), enforces unique references (Postgres `23505`), and files the report in `pagos_pendientes`.

### Dashboards & Accounts
- **Client dashboard**: reservations list, realtime chats, profile editing, password change gated by old-password re-authentication, and account deletion that requires typing the exact confirmation phrase `ELIMINAR MI CUENTA`.
- **Pro dashboard**: unified daily agenda (`reservas` + `citas`), daily revenue totals in USD/Bs, manual offline-turn registration, payment verification, and a one-click BCV sync.
- **Support console** (`/soporte` → `/app/soporte/escritorio`) with a dedicated public login entry point and role-gated access.
- **Cookie-based SSR sessions**: `sb-access-token` / `sb-refresh-token` (HttpOnly, SameSite=Lax, 7-day max age), validated per request against Supabase Auth, with profile reads performed under the user's own JWT so RLS applies.
- **Graceful build-time degradation**: a placeholder Supabase client keeps `astro build` green in CI/CD when secrets are absent at build time.

---

## 🧰 Tech Stack

### Core Application
| Layer | Technology | Version | Purpose |
| :--- | :--- | :--- | :--- |
| Framework | **Astro** | `^6.3.3` | SSR pages, file-based routing, API endpoints, islands |
| UI runtime | **Preact** | `^10.29.1` | Interactive islands via `@astrojs/preact` |
| Language | **TypeScript** | `^6.0.3` | Typed API routes; `astro/tsconfigs/strict` with `react-jsx` + `jsxImportSource: preact` |
| Styling | **Tailwind CSS** | `^4.3.0` | Utility engine wired through `@tailwindcss/vite` (v4, config-less) |
| Styling | Scoped / inline CSS | — | Gold-and-black design tokens (`--gold: #BA8F57`) in `LayoutBase.astro` |
| Adapter | **@astrojs/vercel** | `^10.0.7` | Serverless SSR deployment (`output: 'server'`) |

### Backend & Data
| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| Database | **Supabase Postgres** | 10 application tables, JSONB config columns, PL/pgSQL triggers |
| Auth | **Supabase GoTrue** | Email/password sign-up & sign-in, JWT sessions, admin user deletion |
| Authorization | **Row Level Security** | Owner/role-scoped policies on every business table |
| Realtime | **Supabase Realtime** | `postgres_changes` streams over WebSockets |
| SDK | `@supabase/supabase-js` `^2.105.4` | Anon-key, user-scoped, and service-role clients |
| HTTP | Native `fetch` (Node 22) | BCV scraping — zero external HTTP dependencies |

### Tooling & Platform
| Layer | Technology |
| :--- | :--- |
| Runtime | **Node.js 22.x** (declared in `engines`) |
| Package manager | **npm** (`package-lock.json` committed) |
| Type checking | `@astrojs/check` (`npm run astro -- check`) |
| Hosting | **Vercel** (SSR functions + static assets in `.vercel/output`) |
| Fonts | Self-hosted `woff2` in `public/fonts/` + `src/styles/google-fonts.css`, preloaded in the base layout |
| Maintenance scripts | `scratch/*.js` — one-off Supabase inspection / font-download utilities (outside the app bundle) |

> **AI/ML integrations:** none at this stage. Every decision path is deterministic (HTTP scraper + SQL constraints). See the [roadmap](#-future-improvements--roadmap) for the highest-leverage places to introduce LLMs.

---

## 🏗 Architecture & Workflow

### System Overview

```text
                            ┌───────────────────────────────────────────────┐
                            │            Vercel Edge / Node 22              │
   Browser (Client)         │        Astro 6 SSR  ·  output: 'server'       │
   ┌──────────────┐         │                                               │
   │  .astro HTML │◀──HTML──┤  src/pages/**        → SSR HTML (per request) │
   │  Preact      │         │  src/pages/api/**    → JSON endpoints         │
   │  islands     │◀──JS────┤  src/islands/*.jsx   → hydrated client widgets│
   └──────┬───────┘         └──────────────────────┬────────────────────────┘
          │                                        │
          │                            anon key │ user JWT │ service-role key
          │                                        ▼
          │                     ┌──────────────────────────────────────────┐
          │                     │              Supabase                    │
          │  WebSocket          │  ┌────────────────────────────────────┐  │
          │  (Realtime)         │  │ Postgres                           │  │
          └────────────────────▶│  │  perfiles · negocios · servicios   │  │
                                │  │  reservas · citas                  │  │
                                │  │  salas_chat · mensajes_chat        │  │
                                │  │  configuracion_sistema (singleton) │  │
                                │  │  pagos_pendientes                  │  │
                                │  │  + RLS policies + PL/pgSQL triggers│  │
                                │  ├────────────────────────────────────┤  │
                                │  │ GoTrue Auth (JWT)                  │  │
                                │  │ Realtime (postgres_changes)        │  │
                                │  └────────────────────────────────────┘  │
                                └──────────────────────────────────────────┘
                                                     ▲
                                     HTTPS scrape of │ id="dolar"
                                     the official    │ (fallback: last
                                     BCV portal      │  stored rate in DB)
                                              ┌──────┴───────┐
                                              │  bcv.org.ve  │
                                              └──────────────┘
```

### Booking Flow (happy path)

```text
1. /app/cliente/buscar          SSR lists negocios, filters by category/search
        │
2. /app/cliente/reservar?id=X   SSR fetches negocio + servicios + tasa_bcv (Promise.all)
        │                       → hydrates <BookingFlow client:load />
        ▼
3. Step 1  Service selected     → slot grid rebuilt from servicio.duracion_min
4. Step 2  Specialist chosen    → from negocio.config.specialists (or owner fallback)
5. Step 3  Date chosen          → parallel query of reservas + citas → occupied slots blocked
6. Step 4  Payment method/data  → Bs amount = precio_usd × tasa_bcv (formatted es-VE)
        │
        ▼
7. Confirm (client-side, under the user's JWT)
        ├── INSERT public.reservas            (estado='confirmada', pago_estado='pendiente_verificacion')
        ├── INSERT public.citas               (legacy mirror for existing agendas)
        ├── UPSERT public.salas_chat          (client ↔ professional room)
        └── INSERT public.mensajes_chat       (automatic confirmation message)
        │
        ▼
8. Pro dashboard    reads unified agenda → verifies payment → pago_estado='verificado'
   Client dashboard  reads reservas + realtime chat stream
```

### BCV Rate Synchronization

```text
Vercel Cron / authenticated user
        │  GET /api/update-bcv?secret=$CRON_SECRET   (or cookie session, role-gated)
        ▼
 ┌──────────────────────────┐   scrape bcv.org.ve  ┌────────────────────┐
 │  /api/update-bcv (route) │─────────────────────▶│  id="dolar" block  │
 └────────────┬─────────────┘                      └────────────────────┘
              │  parse + validate numeric value
              │  on failure ──▶ reuse last tasa_bcv from DB (never breaks)
              ▼
   UPDATE public.configuracion_sistema SET tasa_bcv, ultima_actualizacion  (id = 1)
              │
              ▼
   Supabase Realtime  ──▶  BookingFlow · GestionServicios · ProDashboard
                           (Bolivar prices re-render live, no page reload)
```

### Rendering & Data-Access Strategy

| Concern | Approach |
| :--- | :--- |
| **SSR reads** | Astro front-matter uses a shared anon-key client for public data (businesses, services, rate) and `getSession()` for user-scoped data. |
| **Authenticated reads/writes** | `getSession(request)` extracts `sb-access-token` from cookies, calls `auth.getUser(token)`, and fetches `perfiles` with a **request-scoped client carrying the user's JWT** so RLS is honored. |
| **Client-side writes** | Preact islands build their own Supabase client with the same JWT in the `Authorization` header. |
| **Privileged operations** | `SUPABASE_SERVICE_ROLE_KEY` is used **only server-side** for account deletion and when RLS would otherwise block the BCV write. Never exposed to the browser. |
| **Interaction model** | `client:load` for above-the-fold flows (booking), `client:only="preact"` for token-dependent dashboards, and dynamic `import()` for the landing-page support widget. |

---

## 📂 Project Structure

```text
Chikiluky.app/
├── astro.config.mjs              # output: 'server', Preact + Vercel + Tailwind v4
├── tsconfig.json                 # astro/tsconfigs/strict + Preact JSX
├── package.json                  # scripts, engines: node 22.x
├── .env.example                  # environment variable template
│
├── src/
│   ├── components/
│   │   └── Header.astro          # role-aware sticky header + dropdown
│   ├── islands/                  # Preact interactive widgets (hydrated)
│   │   ├── BookingFlow.jsx       # 4-step booking wizard + availability + payment
│   │   ├── ClientDashboard.jsx   # reservations, chat, profile, password, deletion
│   │   ├── ProDashboard.jsx      # unified agenda, manual turns, verification
│   │   ├── GestionServicios.jsx  # service CRUD + plan limit gating
│   │   ├── GestionEspecialistas.jsx  # team management inside negocios.config
│   │   ├── SoporteFlotante.jsx   # public/anon floating chat widget
│   │   └── SoporteAdminInbox.jsx # agent inbox with Realtime subscriptions
│   ├── layouts/
│   │   └── LayoutBase.astro      # <head>, font preloads, global design tokens
│   ├── lib/
│   │   ├── supabase.js           # anon client with build-time placeholder fallback
│   │   └── session.ts            # getSession(request) → user + perfil + token
│   ├── pages/
│   │   ├── index.astro           # landing page, pricing table, login/signup modal
│   │   ├── soporte.astro         # public support-team login
│   │   ├── tasa.astro            # public BCV rate viewer + conversion table
│   │   ├── api/
│   │   │   ├── update-bcv.ts     # BCV scraper (GET/POST, dual authorization)
│   │   │   └── auth/
│   │   │       ├── login.ts      # signInWithPassword + cookie issue + role redirect
│   │   │       ├── registro.ts   # signUp + perfiles upsert + auto-login
│   │   │       ├── logout.ts     # signOut + cookie clearing (302)
│   │   │       └── delete-account.ts  # service-role user deletion
│   │   ├── app/
│   │   │   ├── cliente/          # buscar · reservar · pago · escritorio
│   │   │   ├── experto/          # escritorio · servicios · especialistas
│   │   │   │                     # pagos · pagar · agenda · soporte
│   │   │   └── soporte/escritorio.astro
│   │   └── pro/dashboard.astro   # legacy entry point → redirects to /app/experto/escritorio
│   ├── styles/
│   │   ├── global.css            # @import "tailwindcss"
│   │   └── google-fonts.css      # self-hosted @font-face declarations
│   └── utils/currency.js         # convertirRefABs(montoRef, tasaBcv)
│
├── public/                       # favicon, logo, self-hosted woff2 fonts
├── scratch/                      # dev-only Supabase inspection / maintenance scripts
└── *.sql                         # Supabase schema, migrations, RLS, seeds
```

### Routes

| Route | Method | Access | Description |
| :--- | :--- | :--- | :--- |
| `/` | GET | Public | Landing page, pricing comparison, auth modal, floating support widget |
| `/tasa` | GET | Public | Official BCV rate + quick USD→Bs conversion table |
| `/soporte` | GET | Public | Support/admin login form |
| `/api/auth/login` | POST | Public | Form-data login; sets `sb-access-token` / `sb-refresh-token` |
| `/api/auth/registro` | POST | Public | Creates an account (role `cliente`) + profile upsert |
| `/api/auth/logout` | GET/POST | Session | Clears cookies and redirects to `/` |
| `/api/auth/delete-account` | POST | Session | Service-role deletion of the authenticated user |
| `/api/update-bcv` | GET/POST | `CRON_SECRET` **or** role `experto`/`soporte`/`administrador` | Scrapes and stores the BCV rate |
| `/app/cliente/buscar` | GET | `cliente`+ | Business directory with category filtering |
| `/app/cliente/reservar?id=<uuid>` | GET | `cliente`+ | Booking wizard for one business |
| `/app/cliente/pago` | GET/POST | `cliente`+ | Legacy payment page (writes directly to `citas`) |
| `/app/cliente/escritorio` | GET | Session | Client dashboard (`#reservas`, `#chats`, `#perfil`) |
| `/app/experto/escritorio` | GET | `experto`, `administrador` | Pro dashboard / daily agenda |
| `/app/experto/servicios` | GET/POST | `experto`, `administrador` | Service CRUD with plan limits |
| `/app/experto/especialistas` | GET | `experto`, `administrador` | Team management |
| `/app/experto/pagos` | GET/POST | `experto`, `administrador` | Configure payment methods |
| `/app/experto/pagar?plan=plata\|oro` | GET/POST | `experto`, `administrador` | Report a Pago Móvil subscription payment |
| `/app/experto/agenda` | GET | `experto`, `administrador` | Today's schedule and daily totals |
| `/app/experto/soporte` | GET | `experto`, `administrador` | Agent inbox |
| `/app/soporte/escritorio` | GET | `soporte`, `administrador` | Support console (chat operations) |
| `/pro/dashboard` | GET | — | Legacy redirect → `/app/experto/escritorio` |

---

## 🗄 Data Model

```text
auth.users ──1:1──▶ public.perfiles ──1:1──▶ public.perfiles_profesionales
                          │  (role · plan)
                          │
                          │ owner_id
                          ▼
                    public.negocios ──1:N──▶ public.servicios
                    (config JSONB)  │
                        │           │
        ┌───────────────┘           └──────────────┐
        │                                          │
        ▼                                          ▼
  public.citas (legacy)                    public.reservas
        ▲                                          ▲
        └──────────────┬───────────────────────────┘
                       │
              public.salas_chat ──1:N──▶ public.mensajes_chat

  public.configuracion_sistema   (singleton: id = 1, tasa_bcv, ultima_actualizacion)
  public.pagos_pendientes        (subscription payment reports awaiting review)
```

| Table | Key columns | Notes |
| :--- | :--- | :--- |
| `perfiles` | `id` → `auth.users`, `full_name`, `role` (`cliente`/`experto`/`soporte`/`administrador`), `telefono`, `plan` (`gratis`/`plata`/`oro`), `avatar_url` | Created by a trigger on sign-up; UPSERTed on registration |
| `negocios` | `id`, `owner_id` → `perfiles`, `name`, `descripcion`, `address`, `categoria`, `telefono`, `config` JSONB | `config.pagos` and `config.specialists` are the source of truth for payment methods and team members |
| `servicios` | `id`, `negocio_id`, `nombre`, `categoria`, `duracion_min`, `precio_usd`, `precio_bs` | `categoria` added by `migracion_servicios_categoria.sql`; insert limited by plan |
| `perfiles_profesionales` | `id` → `perfiles`, `pago_movil_*`, `zelle_*`, `efectivo_activo` | Read by `BookingFlow` to display payment instructions |
| `reservas` | `id`, `cliente_id`, `profesional_id`, `servicio_id`, `fecha`, `hora_inicio`, `estado`, `pago_metodo`, `pago_referencia`, `pago_banco_emisor`, `pago_estado` | Primary (modern) booking record |
| `citas` | `id`, `client_id`, `business_id`, `expert_id`, `servicio`, `start_time`, `end_time`, `status`, `price_usd`, `price_bs`, `comprobante_referencia`, `comprobante_fecha`, `notas` | Legacy agenda kept in sync for backward compatibility |
| `salas_chat` | `id`, `sala_type`, `cliente_id`, `profesional_id`, `anonimo_session_id` | `sala_type` ∈ `cliente_profesional` / `soporte` / `soporte_anonimo` |
| `mensajes_chat` | `id`, `sala_id`, `sender_id`, `sender_type`, `contenido` | Guarded by a trigger: a professional cannot open a client conversation |
| `configuracion_sistema` | `id` (CHECK `id = 1`), `tasa_bcv`, `ultima_actualizacion` | Singleton BCV rate; RLS disabled by design (write protected at the API layer) |
| `pagos_pendientes` | `user_id`, `plan`, `monto_usd`, `monto_bs`, `referencia` (UNIQUE), `banco_emisor`, `telefono_pagador`, `fecha_pago`, `estado` | Manual review queue for subscription upgrades |

**Security model**

- RLS is **enabled** on `perfiles_profesionales`, `reservas`, `salas_chat`, `mensajes_chat`, `pagos_pendientes`, and `citas`; every policy is scoped to `auth.uid()` ownership or to a privileged role (`soporte`, `administrador`, `experto`).
- Row **integrity rules** are enforced by triggers: service limits (`trg_check_servicio_limit`), specialist limits (`trg_check_specialists_limit`), and the professional-messaging restriction (`trg_check_profesional_message`).
- `configuracion_sistema` intentionally runs with RLS disabled (single public row) — the BCV endpoint is the only write path, protected by `CRON_SECRET` or a role check.

> ⚠️ **Repository note:** the base schema for `perfiles`, `negocios`, `servicios`, and `citas` lives in the Supabase project rather than in this repository. The `*.sql` files here are the **incremental** schema, RLS, and seed scripts (see the setup order below). Ensure the base tables exist before applying them.

---

## 🚀 Getting Started

### Prerequisites

| Requirement | Version / Notes |
| :--- | :--- |
| **Node.js** | `22.x` (enforced by `engines` in `package.json`) |
| **npm** | 9+ (a `package-lock.json` is committed — prefer `npm ci`) |
| **Supabase project** | Postgres + Auth + Realtime. Free tier is sufficient for development. |
| **Supabase CLI / SQL Editor** | To apply the `*.sql` scripts (the dashboard SQL Editor is enough) |
| **Vercel account** | Optional — only required for production deployment |

### 1. Clone and install

```bash
git clone https://github.com/jggalviz/Chikiluky.app.git
cd Chikiluky.app
npm ci          # or: npm install
```

### 2. Configure environment variables

Create `.env` from the template and fill in your project values:

```bash
cp .env.example .env
```

`.env.example`

```dotenv
# ── Server-side (SSR, API routes) ────────────────────────────────
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key

# ── Exposed to the browser (Preact islands) ──────────────────────
PUBLIC_SUPABASE_URL=https://your-project.supabase.co
PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# ── Privileged server-only operations (NEVER expose publicly) ────
# Required for /api/auth/delete-account and recommended for
# writing the BCV rate without tripping RLS.
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# ── Shared secret for the BCV sync endpoint (cron/automation) ────
# If omitted, the route falls back to a hard-coded development default.
CRON_SECRET=replace-with-a-long-random-string
```

| Variable | Scope | Required | Used by |
| :--- | :--- | :--- | :--- |
| `SUPABASE_URL` | Server | ✅ | `src/lib/session.ts`, API routes, SSR pages |
| `SUPABASE_ANON_KEY` | Server | ✅ | Same as above |
| `PUBLIC_SUPABASE_URL` | Browser | ✅ | `src/lib/supabase.js`, all Preact islands |
| `PUBLIC_SUPABASE_ANON_KEY` | Browser | ✅ | Same as above |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only | ⚠️ Recommended | `/api/auth/delete-account` (required), `/api/update-bcv` (bypasses RLS) |
| `CRON_SECRET` | Server-only | ⚠️ Recommended | `/api/update-bcv?secret=…` |

> **Security tip:** with `SUPABASE_SERVICE_ROLE_KEY` set, the BCV route writes with admin privileges and never triggers an RLS `42501` error. Without it, the write is attempted under the caller's JWT, which requires a matching RLS policy on `configuracion_sistema`.

### 3. Provision the database

Run the SQL scripts in the Supabase **SQL Editor**, in this exact order (later scripts depend on the earlier ones, and some of them `DROP` their tables first):

```text
1. configuracion_sistema.sql        # BCV rate singleton + seed row
2. chat_schema.sql                  # salas_chat, mensajes_chat, RLS, messaging trigger
3. migracion_servicios_categoria.sql# ALTER servicios ADD COLUMN categoria
4. reservas_y_pagos.sql             # perfiles_profesionales, reservas, RLS
5. suscripciones_y_limites.sql      # perfiles.plan, pagos_pendientes, plan-limit triggers
6. rls_manual_bookings.sql          # RLS for manual/offline bookings on reservas + citas
7. seed_carmen_margot.sql           # OPTIONAL demo data (test specialists)
```

Then verify the foundation in the Supabase dashboard:

- **Auth → Providers → Email** enabled (disable *Confirm email* for frictionless local sign-up, or keep it and use the `autoLogin: false` branch of `/api/auth/registro`).
- **Database → Replication** publications must include `configuracion_sistema`, `salas_chat`, and `mensajes_chat` so `postgres_changes` events reach the client. `UPDATE` streams on `configuracion_sistema` are what power live Bolivar re-pricing.
- **Database → Replication → `REPLICA IDENTITY FULL`** on `configuracion_sistema` is recommended so the old/new rows are streamed completely.

### 4. Run locally

```bash
npm run dev
# ➜ http://localhost:4321
```

### Available scripts

| Command | Action |
| :--- | :--- |
| `npm run dev` | Starts the Astro dev server at `http://localhost:4321` with HMR |
| `npm run build` | Production build (`output: 'server'` + Vercel adapter) into `dist/` + `.vercel/output/` |
| `npm run preview` | Serves the production build locally |
| `npm run astro -- check` | Runs `@astrojs/check` for TypeScript/Astro diagnostics |
| `npm run astro -- add <integration>` | Adds an Astro integration |
| `node scratch/list_experts.js` | Example maintenance script (requires a configured `.env`) |

> **Build-time behavior:** if `SUPABASE_*` variables are missing during `npm run build`, `src/lib/supabase.js` instantiates a placeholder client and logs a warning instead of failing the build. The site will build but every data-driven page will render empty — so **always verify your `.env` before a production build**.

---

## 💻 Usage Examples

### Authentication (HTTP API)

Register a new client (always created with the `cliente` role):

```bash
curl -i -X POST http://localhost:4321/api/auth/registro \
  -F "email=nueva@cliente.com" \
  -F "password=secreto123" \
  -F "full_name=Ana Pérez" \
  -F "telefono=04141234567"
```

```json
{ "ok": true, "autoLogin": true, "redirectTo": "/app/cliente/escritorio" }
```

Log in and capture the session cookies:

```bash
curl -i -c cookies.txt -X POST http://localhost:4321/api/auth/login \
  -F "email=barberia@chikiluky.app" \
  -F "password=tu-password" \
  -F "role=experto"
```

```json
{ "ok": true, "rol": "experto", "redirectTo": "/app/experto/escritorio" }
```

Reuse the session for authenticated requests:

```bash
curl -b cookies.txt http://localhost:4321/app/experto/escritorio -o dashboard.html
curl -b cookies.txt -X POST http://localhost:4321/api/auth/delete-account
```

### Synchronizing the BCV rate

```bash
# Automation / cron path — authorized by the shared secret
curl "http://localhost:4321/api/update-bcv?secret=$CRON_SECRET"

# Interactive path — authorized by an experto/soporte/administrador session
curl -b cookies.txt http://localhost:4321/api/update-bcv
```

Successful response:

```json
{
  "ok": true,
  "mensaje": "Tasa BCV actualizada directamente del sitio oficial con éxito.",
  "fuente": "Banco Central de Venezuela (bcv.org.ve)",
  "tasa_anterior": 40,
  "tasa_nueva": 42.7531,
  "metodo_autenticacion": "token_secreto",
  "usó_cliente_admin": true,
  "fecha_sincronizacion": "2026-09-19T02:10:44.512Z"
}
```

When the government portal is unreachable, the endpoint degrades gracefully instead of failing:

```json
{
  "ok": false,
  "error": "La web oficial del BCV no está respondiendo. Se mantuvo la última tasa guardada como respaldo de seguridad.",
  "tasa_actual": 42.7531
}
```

**Optional automation** — a Vercel Cron entry (not committed to the repo) can keep the rate fresh every morning:

```json
{
  "crons": [
    { "path": "/api/update-bcv?secret=YOUR_CRON_SECRET", "schedule": "0 12 * * 1-5" }
  ]
}
```

### Consuming the currency helper

```js
import { convertirRefABs } from '../utils/currency.js';

convertirRefABs(20, 42.7531);      // "855,06 Bs"
convertirRefABs('1250.5', 40);     // "50.020,00 Bs"
convertirRefABs(0, 40);            // "0,00 Bs"  (guards invalid input)
```

### Reading the live rate from a client island

```js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.PUBLIC_SUPABASE_URL,
  import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
  { global: { headers: { Authorization: `Bearer ${token}` } } }
);

const { data } = await supabase
  .from('configuracion_sistema')
  .select('tasa_bcv')
  .eq('id', 1)
  .maybeSingle();

const channel = supabase
  .channel('mi-tasa-en-vivo')
  .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'configuracion_sistema', filter: 'id=eq.1' },
      ({ new: row }) => console.log('Nueva tasa BCV:', row.tasa_bcv))
  .subscribe();

// Cleanup on unmount
// supabase.removeChannel(channel);
```

### Verifying plan limits at the database level

```sql
-- Set a test owner to the free tier
UPDATE public.perfiles SET plan = 'gratis' WHERE id = '<experto-uuid>';

-- The 4th service insert must fail with LIMIT_EXCEEDED
INSERT INTO public.servicios (negocio_id, nombre, categoria, duracion_min, precio_usd)
VALUES ('<negocio-uuid>', 'Servicio extra', 'Barbería', 60, 10);
-- ERROR:  LIMIT_EXCEEDED: El plan Gratis ($0) tiene un límite de 3 servicios.
```

### Manual bookkeeping / inspection scripts

The `scratch/` folder holds throwaway utilities used during development:

```bash
node scratch/list_experts.js          # list perfiles with role = 'experto'
node scratch/check_expert.js          # inspect negocios + perfiles_profesionales
node scratch/test_rls.js              # verify a config UPDATE passes RLS
node scratch/download_fonts.js        # refresh self-hosted woff2 files
```

### Deploying to Vercel

```bash
npm i -g vercel
vercel            # preview deployment
vercel --prod     # production deployment
```

Add the same environment variables in **Vercel → Project → Settings → Environment Variables** (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`) for both *Preview* and *Production*, and make sure `PUBLIC_*` variables are present at **build time** — Astro inlines them into the client bundle.

---

## 🗺 Future Improvements / Roadmap

### Payments & Billing
- [ ] **Automated plan activation**: add an admin review screen for `pagos_pendientes` (approve/reject) that promotes `perfiles.plan` atomically inside a Postgres function, instead of the current manual review.
- [ ] **Payment gateway integrations**: Bancamiga / Mercantil Pago Móvil C2P APIs, Stripe or PayPal SDK for card and international payments.
- [ ] **Billing lifecycle**: expiring subscriptions, grace periods, renewal reminders, invoices, and webhook-driven status transitions.
- [ ] **Reconciliation**: automatic matching of reported references against bank statements (CSV import + fuzzy matching).

### Scheduling & Operations
- [ ] **Per-business working hours**: replace the hard-coded 09:00–19:00 window with a schedule stored in `negocios.config.horarios` (per weekday, per specialist, holidays).
- [ ] **Buffers, deposits, and cancellation policies** encoded as database constraints.
- [ ] **Single source of truth for bookings**: finish migrating off the dual `reservas` + `citas` write model and add a compatibility view for legacy dashboards.
- [ ] **Google Calendar / ICS export** and push notifications (email + WhatsApp) for confirmations and reminders.
- [ ] **Optimistic concurrency**: a `UNIQUE (profesional_id, fecha, hora_inicio)` constraint (or an advisory lock) to make slot collisions impossible under concurrent requests, not just improbable.

### AI / ML (highest-leverage integrations)
- [ ] **Smart booking assistant**: an LLM agent (function calling over `servicios` + `reservas`) that answers "¿tienen hueco el sábado para uñas acrílicas?" and books it end-to-end.
- [ ] **No-show prediction**: a gradient-boosted model over historical `reservas`/`citas` features to flag risky appointments and auto-require a deposit.
- [ ] **Semantic salon search**: pgvector embeddings over `negocios.descripcion` + `servicios.nombre` to support natural-language queries ("algo para un evento de noche en Altamira") instead of keyword matching.
- [ ] **Support copilot**: retrieval-augmented drafting of replies inside `SoporteAdminInbox`, with the agent as the final approver.
- [ ] **Dynamic pricing**: demand-aware suggestions for `precio_usd` per slot, always displayed alongside the BCV-converted amount.

### Platform & Engineering
- [ ] **Automated tests**: Vitest unit tests for `convertirRefABs` and the scraper parser, Playwright end-to-end coverage of the booking wizard, and PGlite/Supabase local tests for RLS policies and triggers.
- [ ] **CI/CD pipeline**: GitHub Actions running `npm ci`, `astro check`, tests, and build on every pull request.
- [ ] **Replace `astro check` with a real type gate** for `.jsx` islands (currently JavaScript) by migrating islands to TypeScript.
- [ ] **Centralize `Database` types** generated from the Supabase schema (`supabase gen types typescript`) to remove ad-hoc `any` usage.
- [ ] **Validate the BCV scraper with zod** and remove `process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'` in favor of a scoped HTTPS agent, since disabling TLS verification globally is a security risk.
- [ ] **Remove the hard-coded `CRON_SECRET` fallback** (`chikiluky-sync-secret-123`) in `update-bcv.ts` so a missing variable fails closed instead of open.
- [ ] **Rate limiting + CAPTCHA** on `registro`, `update-bcv`, and anonymous chat creation.
- [ ] **Observability**: structured logging, Sentry error tracking, and alerts on scraper failures.
- [ ] **Housekeeping**: rename the package from `tmp-init` to `chikiluky-app`, add Prettier/ESLint, and document the base Supabase schema in this repository.

### UX & Growth
- [ ] **Multi-city / multi-country expansion** (currency and tax abstraction beyond the BCV rate).
- [ ] **PWA + offline mode** for professionals registering walk-in clients with poor connectivity.
- [ ] **Reviews and ratings** tied to completed, verified bookings only.
- [ ] **Referral program and analytics dashboard** for business owners.

---

## 🤝 Conventions & Contributing

- **Language**: UI copy, database comments, and commit messages are in **Spanish**; code identifiers, file names, and this README are in **English**. Keep it that way for consistency.
- **Roles**: `cliente`, `experto`, `soporte`, `administrador` — never hard-code a role check in the client without mirroring it in an RLS policy.
- **Money**: always store USD in `precio_usd` / `price_usd` and let the UI convert with `convertirRefABs`. Never persist a Bolivar amount that cannot be recomputed from `configuracion_sistema.tasa_bcv`.
- **Sessions**: read them with `getSession(Astro.request)` on the server and pass `token` down to islands; do not call `supabase.auth.getSession()` on the server.
- **RLS first**: any new table must ship with `ENABLE ROW LEVEL SECURITY`, explicit policies, and — if it enforces a business rule — a trigger.
- **Commits**: this project follows Conventional Commits (`feat:`, `fix:`, `style:`, `opt:`), as visible in the history.

---

## 📄 License

**Proprietary — all rights reserved.** This repository is not licensed for redistribution, resale, or derivative works without explicit written permission from the owner. Third-party dependencies remain under their respective licenses (Astro, Preact, Tailwind CSS, Supabase JS SDK, and their transitive packages).

---

<p align="center">
  <strong>CHIKILUKY</strong> · Caracas, Venezuela · <em>Ecosistema digital de imagen y cuidado personal</em>
</p>
