import type { RenameCompanyMercurialePayload } from "@lfd/contracts";

/** Renommer une mercuriale. Le libellé ne participe à aucun calcul. */
export class RenameCompanyMercurialeCommand {
  constructor(
    readonly companyId: string,
    readonly payload: RenameCompanyMercurialePayload,
    readonly staffUserId: string,
  ) {}
}
