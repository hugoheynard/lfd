import type { AmendCompanyMercurialePayload } from "@lfd/contracts";

/**
 * Amender la mercuriale `mercurialeId` de ce client : un avenant daté qui
 * ajoute des prix et/ou arrête des lignes (`plan-tarif-date-sur-une-reference.md`).
 */
export class AmendCompanyMercurialeCommand {
  constructor(
    readonly companyId: string,
    readonly mercurialeId: string,
    readonly payload: AmendCompanyMercurialePayload,
    readonly staffUserId: string,
  ) {}
}
