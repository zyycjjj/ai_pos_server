# Task-039B Whole Project Code Review & Architecture Audit Report

## 1. 最终状态

PASS WITH FOLLOW-UP ITEMS。

本次完成了 `ai-pos-server`、`ai-pos-admin`、`ai-pos-app` 的整体代码 review、架构审计、文件大小审计、关键字符串搜索、必要注释补充、架构边界脚本小修、整体架构文档和 Mermaid 流程图补充。

## 2. Review 范围

- Backend：auth、store/staff/RBAC、products/modifiers、orders/checkout/payment/refund、shift/cash session、print/printer runtime、analytics、AI Copilot、campaign/promotion、tables/business-day、schema、tests、smoke、deploy。
- Admin：Login、Dashboard、Products、Orders、Shifts、Kitchen、Printers、Analytics、AI Center、Campaigns、Tables、Staff、services、types、i18n。
- POS App：auth、sell/cart/payment、orders/products/shifts/tables/settings、printer native bridge、boot autostart、i18n、API base/client。
- Docs/scripts：`scripts/check-architecture-boundaries.mjs`、`scripts/smoke/*`、deployment docs、harness reports。

## 3. 总体结论

当前 AI-POS 可以继续承载 Task-040 前的迭代，核心闭环没有发现必须立即阻塞的 P0 架构问题。后端已经形成领域模块化单体，RBAC 和 Store isolation 主路径清晰，金额持久化以服务端为准。主要风险是局部文件偏大、部分业务规则集中在 service/page 中、ZenStack policy 仍然 permissive、部署版本可见性不足。

## 4. 代码规范符合度

- 强领域驱动设计倾向：基本符合。Backend 按模块组织；Admin/App 也按页面/模块组织。
- 每个文件一个主要职责：中等符合。多数文件 OK，但 `checkout.service.ts`、`admin.service.ts`、`SellScreen.tsx`、`businessApi.ts` 已超过合理维护阈值。
- 金额计算服务端为准：主 checkout/refund/shift 符合；table checkout 当前金额逻辑较轻，仍应后续统一到 checkout pricing path。
- Store isolation/RBAC：主 API 符合；风险在 ZenStack `@@allow("all", true)` 和 nullable legacy `storeId` 字段。
- AI 后续迭代友好性：中等偏好。模块边界可读，但大文件需要逐步抽出 pricing/payment/table operations。

## 5. Backend Review

### 5.1 模块边界

Backend 采用 NestJS modular monolith。`auth` + `AuthMiddleware` + `StoreContextService` 提供用户/门店上下文，`RolesGuard` 负责 route-level RBAC。`checkout` 承担下单、支付、退款、促销、厨房票、打印任务、班次现金联动，能力完整但职责偏重。`tables` 承担桌台配置、开台、加菜、结账、换台、并台、拆单，MVP 可接受但后续应拆 table catalog / table order operations。`analytics` 已拆 repository/domain math，边界健康。`ai/copilot` 已拆 context/router/provider/parser/execution/conversation，健康度较好。

### 5.2 文件职责

文件大小审计，排除 ZenStack 生成的 `ai-pos-app/src/_/hook/*` 后：

- >800 行：`ai-pos-app/src/modules/sell/SellScreen.tsx` 1503，`ai-pos-server/src/modules/checkout/checkout.service.ts` 992，`ai-pos-app/src/services/businessApi.ts` 979，`ai-pos-admin/src/i18n/index.tsx` 859，`ai-pos-server/src/modules/admin/admin.service.ts` 823。
- 500-800 行：`ai-pos-server/src/modules/print/print.service.ts` 747，`ai-pos-app/src/modules/ai/AiCreateScreen.tsx` 670，`ai-pos-server/src/modules/checkout/checkout.service.test.ts` 619，`ai-pos-server/src/modules/ai/ai.service.ts` 569，`ai-pos-server/src/modules/tables/tables.service.ts` 522。
- 300-500 行：`ProductsPage.tsx` 486，`admin.ts` 468，`kitchen.service.ts` 430，`SettingsScreen.tsx` 417，`adminApi.ts` 397，`PrintersPage.tsx` 390，`OrdersScreen.tsx` 388，`shifts.service.ts` 356，`ProductsScreen.tsx` 350，`ShiftScreen.tsx` 321，`TablesScreen.tsx` 318。

结论：不是所有大文件都要立刻拆，但 `SellScreen.tsx`、`businessApi.ts`、`checkout.service.ts` 已明显影响 AI 后续迭代。

### 5.3 金额计算

普通 checkout 的可信金额入口在 `CheckoutService.buildOrderDraft`：服务端按 active store product、modifier option、manual adjustment、promotion、tax/service charge/tip 重算并持久化 snapshot。payment line 由服务端校验等于 total。refund 通过已持久化 refund 汇总计算剩余可退金额。shift expected cash 来自 cash movements，未信任前端 actual cash。

风险：table checkout 目前基于桌台 order subtotal + tip，未复用 promotion/tax/service charge 的完整 checkout pricing path；后续 table post-pay 扩展折扣/税费时应统一。

### 5.4 RBAC / Store Isolation

抽样模块均有 route `@Roles` 或 service `storeId` 过滤。Auth middleware 支持 `X-Store-Id`，但会校验 membership，不能随意跨 store。Campaign/promotion 查询按 storeId 过滤。AI conversation/history 同时按 storeId/userId 过滤。Analytics repository 由 service context 提供 storeId。

风险：`schema.zmodel`/`prisma/schema.prisma` 仍普遍 `@@allow("all", true)`，模型级策略没有兜底；`Product.storeId`、`Order.storeId`、`AiDraft.storeId` 仍 nullable，后续应消除历史兼容口子。

### 5.5 测试覆盖

Backend 测试覆盖 money、checkout、shift、print、analytics、AI campaign/copilot、kitchen。缺口：tables transfer/merge/split 还缺 service-level 单测；promotion usage limit/stacking 有 checkout 覆盖但可更独立；RBAC/store isolation 主要靠 smoke 和手写 route 约束，缺负向单测。

### 5.6 风险与建议

优先拆 `checkout` 的 pricing/payment/promotion/refund 纯函数或 domain service；将 `tables` 的状态迁移抽到 table-order operations；给 ZenStack policy 加 store-aware 规则或减少 RPC 暴露面。

## 6. Admin Review

### 6.1 页面职责

Admin 以页面为主，Products/Printers 页面较大但未超过 500 行。Analytics 和 Copilot 已有 feature hooks/components，模式较健康。Products 页面包含表格、drawer、modifier/category management，后续应拆 `ProductEditor`、`CategoryManager`、`ModifierGroupEditor`。

### 6.2 API / 类型 / i18n

`adminApi.ts` 集中 API 调用，`types/admin.ts` 集中类型，清晰但文件逐渐偏大。i18n 在单文件 `index.tsx`，中文化覆盖较多但 859 行已成为维护风险，建议按 namespace 拆分。Admin 本地 fallback 为 `http://127.0.0.1:4100/api`，对本地开发合理；生产构建必须显式 `VITE_API_BASE_URL=/ai-pos/api`。

### 6.3 UI 可维护性

重复 UI 主要在 table/filter/status action、drawer form field。建议后续建立 Admin FormField、StatusAction、ResourceTable 级别的小组件，不做大改版。

### 6.4 风险与建议

`PrintersPage` 仍有 `127.0.0.1` LAN 示例/历史本机打印路由识别逻辑，应保留为本机测试说明，但线上默认不要创建此类路由。

## 7. POS App Review

### 7.1 模块职责

App 目录按 auth/sell/products/orders/shifts/tables/settings/receipts/customerDisplay/native 组织。`SellScreen.tsx` 是最大风险，承载搜索、类目、购物车、modifier、discount、promo、payment modal、held orders、receipt print 等大量 UI 状态。`businessApi.ts` 集中所有业务 API/types，已接近 1000 行。

### 7.2 Checkout / Payment / Table 数据流

Sell 页只提交 productId、quantity、modifier selection、adjustment intent、promo code、taxRate/serviceChargeRate/tip/payment lines；后端重算金额。前端本地 `checkoutMath` 仅用于展示和支付输入辅助，不应作为可信来源。Tables App 当前是基础 UX；后续 table checkout 应减少前端金额推导。

### 7.3 Android Native

Printer native module 边界清楚：JS typed wrapper 调用 Android `PrinterModule.kt`，native 层管理 vendor SDK connection、status、print mapping。`BootCompletedReceiver` 已说明开机后回到收银工作流，失败只记录日志不阻塞系统 boot。

### 7.4 风险与建议

App API base 默认：web 使用 local，native 使用 `http://49.235.186.154:4100`；当前公网任务口径是 Android API Base `http://49.235.186.154/ai-pos`，实际打包/部署时必须通过 `EXPO_PUBLIC_API_BASE_URL` 覆盖，避免旧端口默认值进入 release。代码中未发现 `/api/api` runtime 命中。API debug logs 已改为 production 关闭。

## 8. Schema / Data Model Review

模型覆盖 Store/User/StoreUser、Product/Category/Modifier、Order/OrderItem/OrderPayment/Refund/RefundItem/AuditLog、Shift/CashMovement、Kitchen、Printer/PrintJob、Campaign、BusinessDay、DiningArea/DiningTable、AI Conversation/Message/Execution。新增字段多数有 default 或 nullable。枚举命名整体一致。

主要风险：`Product.storeId`、`Order.storeId`、`AiDraft.storeId` nullable；`Campaign.discountType` 为 String 而非 enum；ZenStack `@@allow("all", true)` 缺模型层隔离兜底；`BusinessDay` 有聚合字段但联动更新路径需要后续验证。

## 9. Test / Smoke Review

已存在 smoke：

- `scripts/smoke/task-037b-full-payment-refund-shift-smoke.mjs`
- `scripts/smoke/task-037-commercial-core-smoke.mjs`
- `scripts/smoke/task-038-table-postpay-smoke.mjs`
- `scripts/smoke/task-038b-table-operations-smoke.mjs`
- `scripts/smoke/task-039-promotion-engine-smoke.mjs`

这些脚本可复用，但会写入测试数据，应继续使用明确测试命名、幂等 key 和非生产验证库。建议后续统一 smoke runner，支持只读 health/version 检查和写入型业务 smoke 分组。

## 10. Deployment / Version Review

部署文档说明了 `/ai-pos/` Admin、`/ai-pos/api` API proxy、systemd、Nginx、禁止 `--force-reset`/`--accept-data-loss`。Admin 专用构建命令明确。当前仍缺线上运行 commit 的机器可读文件，例如 `/api/version`、Admin `version.json` 或 release manifest。HEAD 当前无 tag 命中：server `138f1d7`、admin `522a459`、app `0794344`。

## 11. 已补充注释

- `checkout.service.ts`：核心金额计算入口、Promotion Engine 入口、Refund 可退金额。
- `tables.service.ts`：transfer / merge / split 核心状态变更。
- `shifts.service.ts`：expected cash calculation。
- `context-budget.policy.ts` / `copilot.application.service.ts`：AI context budget 和 backend evidence。
- `PrinterModule.ts` / `PrinterModule.kt`：Android printer native boundary。
- `BootCompletedReceiver.kt`：boot autostart 行为说明。

## 12. 已补充流程图和文档

新增：`ai-pos-server/doc/architecture/ai-pos-overall-architecture.md`。

包含 Mermaid 图：

- Overall System Architecture
- Backend Domain Modules
- Checkout Amount Calculation Flow
- Table Post-pay Flow
- Promotion Engine Flow
- AI Analytics Flow

## 13. 已修复的小问题

- `scripts/check-architecture-boundaries.mjs` 增加新模块存在性和 controller Prisma import 规则。
- `ai-pos-app/src/services/apiClient.ts` 将 API debug logs 改为 production 关闭。
- 补充关键业务边界注释。

## 14. 未修复但已记录的问题

- 未大规模拆分 `SellScreen.tsx`、`businessApi.ts`、`checkout.service.ts`。
- 未修改 nullable storeId schema，避免数据库迁移风险。
- 未修改公网路径、Android API Base、部署环境。
- 未执行部署。

## 15. Refactor Backlog

### P0 必须处理

- 无直接阻塞继续 Task-040 的 P0。

### P1 建议近期处理

- 将 `CheckoutService` 的 pricing、payment validation、promotion evaluation、refund plan 抽成可单测 domain/service 文件。
- 将 `SellScreen.tsx` 拆成 `SellWorkspace`、`CartPanel`、`PaymentModal`、`ModifierModal`、`HeldOrdersPanel` 和 `useSellCheckout`。
- 将 `businessApi.ts` 按 checkout/products/shifts/tables/print/ai 拆分，保留统一 apiClient。
- 给 `TablesService` 的 transfer/merge/split 增加单元测试，并抽 `tableOrderOperations`。
- 给线上部署补 `/api/version` 或 release manifest，记录 commit、build time、admin base path。

### P2 后续优化

- 将 Admin i18n 按 namespace 拆分。
- 将 Admin Products/Printers 页面抽 FormField/ResourceTable/StatusAction。
- 将 ZenStack policy 从 `@@allow("all", true)` 逐步收紧为 store-aware rules。
- 将 `Campaign.discountType` 收敛为 enum。
- 建立统一 smoke runner，区分只读 smoke 和写入型 smoke。

## 16. 测试命令和结果

- `node scripts/check-architecture-boundaries.mjs`：PASS，`Architecture boundary check passed.`
- `cd ai-pos-server && pnpm typecheck`：PASS。
- `cd ai-pos-server && pnpm test`：PASS，41 tests passed。
- `cd ai-pos-server && pnpm build`：PASS。
- `cd ai-pos-admin && pnpm typecheck`：PASS。
- `cd ai-pos-admin && pnpm build`：PASS，Vite production build succeeded。
- `cd ai-pos-admin && VITE_API_BASE_URL=/ai-pos/api pnpm exec vite build --base=/ai-pos/`：PASS，Vite `/ai-pos/` build succeeded。
- `cd ai-pos-app && pnpm typecheck`：PASS。
- `cd ai-pos-app && pnpm test`：PASS，16 tests passed。
- `rg "/api/api" ai-pos-server/src ai-pos-admin/src ai-pos-app/src ai-pos-app/android/app/src/main/java`：PASS，无 runtime 命中。
- `rg "TODO|FIXME|console.log|localhost|127.0.0.1|192.168"`：已审计；命中为本地开发 fallback、打印机本机测试路线、测试用例和架构脚本输出。

## 17. Commit / Push

- Server：`4da5458 docs(architecture): add whole project review and diagrams`，已 push 到 `develop`。
- App：`97bb715 refactor(app): clarify POS printer boundaries`，已 push 到 `develop`。
- Admin：无源码变更，无需提交。
- 根目录不是 Git 仓库；server/admin/app 是独立 Git 仓库。`scripts/check-architecture-boundaries.mjs` 位于非 Git 根目录，已本地小修但无法随子仓库提交。

## 18. 下一步建议

若继续产品功能，建议进入 Task-039C Promotion Preview & Campaign UX Polish 或 Task-040 Customer / Loyalty Lite。若先压维护风险，建议先做 P1 backlog 的 Sell/Checkout/API 拆分和 version endpoint。

## 19. 最终结论

当前 AI-POS 主架构方向正确，核心 Store isolation、RBAC、服务端金额可信边界成立。最大问题是复杂度开始集中到少数服务和页面，需要在后续两三个任务内持续拆小，否则 AI 后续迭代会越来越容易误改。
