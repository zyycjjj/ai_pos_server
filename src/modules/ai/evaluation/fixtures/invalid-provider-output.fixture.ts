export const invalidProviderOutputs = {
  empty: '',
  nonJson: 'The answer is probably fine, but this is not JSON.',
  primitive: '"plain string"',
  fenced: '```json\n{"headline":"Recovered from fenced json","evidence":[]}\n```',
  wrapped: 'Here is the JSON: {"headline":"Recovered from wrapped json","evidence":[]} Thanks.',
  truncatedLongText: `${'x'.repeat(1000)} {"unterminated": true`,
};
