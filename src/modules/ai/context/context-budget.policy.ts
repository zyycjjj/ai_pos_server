export function compactAnalyticsContext<T extends Record<string, unknown>>(context: T): T {
  // Keep AI context bounded and evidence-friendly: prompts get recent representative slices, while backend code remains the source of numeric truth.
  return {
    ...context,
    daily: Array.isArray(context.daily) ? context.daily.slice(-14) : context.daily,
    hourly: Array.isArray(context.hourly) ? context.hourly.slice(0, 24) : context.hourly,
    topProducts: Array.isArray(context.topProducts) ? context.topProducts.slice(0, 8) : context.topProducts,
    decliningProducts: Array.isArray(context.decliningProducts) ? context.decliningProducts.slice(0, 8) : context.decliningProducts,
    categories: Array.isArray(context.categories) ? context.categories.slice(0, 8) : context.categories,
    modifiers: Array.isArray(context.modifiers) ? context.modifiers.slice(0, 10) : context.modifiers,
    shifts: Array.isArray(context.shifts) ? context.shifts.slice(0, 8) : context.shifts,
    kitchen: Array.isArray(context.kitchen) ? context.kitchen.slice(0, 8) : context.kitchen,
    customers:
      context.customers && typeof context.customers === 'object'
        ? {
            ...(context.customers as Record<string, unknown>),
            topCustomers: Array.isArray((context.customers as Record<string, unknown>).topCustomers)
              ? ((context.customers as Record<string, unknown>).topCustomers as unknown[]).slice(0, 5)
              : (context.customers as Record<string, unknown>).topCustomers,
          }
        : context.customers,
    signals: Array.isArray(context.signals) ? context.signals.slice(0, 8) : context.signals,
  };
}
