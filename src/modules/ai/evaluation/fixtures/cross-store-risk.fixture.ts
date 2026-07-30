export const crossStoreRiskFixture = {
  currentStoreId: 'store_eval_a',
  otherStoreId: 'store_eval_b',
  leakedEvidence: {
    id: 'ev_other_store_sales',
    type: 'METRIC',
    title: 'Other store net sales',
    value: 9999,
    source: { storeId: 'store_eval_b' },
  },
  safeEvidenceIds: ['ev_sales'],
};
