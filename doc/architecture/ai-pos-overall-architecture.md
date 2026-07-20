# AI-POS Overall Architecture

Last reviewed: 2026-07-20

This document records the current AI-POS architecture after the whole-project review. The project remains a modular monolith with three deployable surfaces:

- `ai-pos-server`: NestJS API, Prisma/ZenStack, MySQL, domain services.
- `ai-pos-admin`: Vite/React Admin under `/ai-pos/`.
- `ai-pos-app`: React Native Android POS app with native printer bridge.

The production preview paths are intentionally split:

- Admin: `http://49.235.186.154/ai-pos/`
- API: `http://49.235.186.154/ai-pos/api`
- Android API base: `http://49.235.186.154/ai-pos`

The Admin build must keep `VITE_API_BASE_URL=/ai-pos/api` and Vite `--base=/ai-pos/`. The Android app must keep the base without the trailing `/api` to avoid `/api/api`.

## Overall System Architecture

```mermaid
flowchart TD
  POS["Android POS App"] --> API["Backend API"]
  Admin["Admin Web /ai-pos/"] --> API
  API --> DB[("MySQL")]
  API --> LLM["DeepSeek / AI Provider"]
  POS --> Printer["Built-in Printer Native Module"]
  API --> PrintJobs["Print Jobs"]
  POS --> PrintJobs
```

## Backend Domain Modules

```mermaid
flowchart LR
  Auth["Auth / Store Context"] --> Checkout["Checkout"]
  Products["Products / Modifiers"] --> Checkout
  Checkout --> Orders["Orders"]
  Checkout --> Payments["Payments"]
  Orders --> Refunds["Refunds"]
  Orders --> Print["Print"]
  Orders --> Analytics["Analytics"]
  Campaigns["Campaign / Promotion"] --> Checkout
  Tables["Tables / Dining"] --> Orders
  Shifts["Shift / Cash"] --> Payments
  Analytics --> AI["AI Copilot"]
```

## Checkout Amount Calculation Flow

```mermaid
flowchart TD
  A["Cart Items"] --> B["Server loads products and modifiers"]
  B --> C["Calculate subtotal"]
  C --> D["Apply promotion discount"]
  D --> E["Apply manual discount"]
  E --> F["Calculate tax"]
  F --> G["Calculate service charge"]
  G --> H["Add tip"]
  H --> I["Final total"]
  I --> J["Validate payments"]
  J --> K["Persist order snapshot"]
  K --> L["Create print jobs"]
```

## Table Post-pay Flow

```mermaid
stateDiagram-v2
  [*] --> AVAILABLE
  AVAILABLE --> OCCUPIED: open table
  OCCUPIED --> OCCUPIED: add items
  OCCUPIED --> OCCUPIED: transfer / merge / split
  OCCUPIED --> DIRTY: checkout
  DIRTY --> AVAILABLE: clear table
  OCCUPIED --> AVAILABLE: cancel open order
```

## Promotion Engine Flow

```mermaid
flowchart TD
  A["Checkout Request"] --> B["Promotion Engine"]
  B --> C["Load Active Campaigns by Store"]
  C --> D["Evaluate Rules"]
  D --> E["Apply Stacking Policy"]
  E --> F["Calculate Discount"]
  F --> G["Persist Applied Promotion Snapshot"]
```

## AI Analytics Flow

```mermaid
flowchart TD
  Orders["Orders"] --> Analytics["Analytics"]
  Refunds["Refunds"] --> Analytics
  Shifts["Shifts"] --> Analytics
  Promotions["Promotions"] --> Analytics
  Analytics --> Context["AI Context Adapter"]
  Context --> Prompt["Prompt Builder"]
  Prompt --> LLM["DeepSeek / Fallback"]
  LLM --> Response["Structured AI Response"]
  Response --> Conversation["Conversation Persistence"]
```

## Current Boundary Decisions

- Backend controllers are route and permission entry points; services still hold most orchestration.
- Store isolation is enforced by auth middleware, `StoreContextService`, and explicit `storeId` filters in services.
- RBAC is centralized with `RolesGuard` and route decorators.
- Checkout is the trusted money boundary. POS/Admin may preview totals, but persisted order totals are server recomputed.
- The Android printer bridge isolates vendor SDK calls from React Native screens and services.
- AI Copilot uses backend analytics evidence and bounded context slices; provider output does not own evidence numbers.

## Known Architecture Risks

- `checkout.service.ts`, `tables.service.ts`, `admin.service.ts`, `print.service.ts`, `SellScreen.tsx`, and `businessApi.ts` are large enough to slow future AI iteration.
- ZenStack model policies are permissive with `@@allow("all", true)`, so manual API routes must keep store filters correct.
- Some legacy nullable `storeId` fields remain on core models for early MVP compatibility.
- The root `scripts/check-architecture-boundaries.mjs` is useful but still shallow; it now recognizes newer modules, but does not yet enforce service size or money-boundary rules.
