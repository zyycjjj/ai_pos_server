export class InvalidCustomerPhoneError extends Error {
  readonly code = 'INVALID_CUSTOMER_PHONE';

  constructor() {
    super('Customer phone must contain 6 to 20 digits.');
  }
}

export function normalizePhone(input: string) {
  const trimmed = input.trim();
  const prefix = trimmed.startsWith('+') ? '+' : '';
  const digits = trimmed.replace(/\D/g, '');
  const normalized = `${prefix}${digits}`;

  if (normalized.length < 6 || normalized.length > 20) {
    throw new InvalidCustomerPhoneError();
  }

  return normalized;
}
