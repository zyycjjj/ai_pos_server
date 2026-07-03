import type { StoreRole } from '@prisma/client';

export type AuthRequestUser = {
  id: string;
  email: string;
  name: string | null;
  storeId: string;
  role: StoreRole;
};

export type AuthStoreContext = {
  storeId: string;
  role: StoreRole;
};
