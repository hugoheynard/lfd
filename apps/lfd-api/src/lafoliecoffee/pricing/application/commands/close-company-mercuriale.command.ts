import type { CloseCompanyMercurialePayload } from "@lfd/contracts";

/** Clore une mercuriale : elle est archivée, jamais effacée. */
export class CloseCompanyMercurialeCommand {
  constructor(
    readonly companyId: string,
    readonly payload: CloseCompanyMercurialePayload,
    readonly staffUserId: string,
  ) {}
}
