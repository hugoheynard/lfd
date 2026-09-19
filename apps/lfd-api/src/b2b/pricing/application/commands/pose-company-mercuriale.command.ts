import type { PoseCompanyMercurialePayload } from "@lfd/contracts";

/** Poser une mercuriale chez ce client, sur une fenêtre datée aux deux bouts. */
export class PoseCompanyMercurialeCommand {
  constructor(
    readonly companyId: string,
    readonly payload: PoseCompanyMercurialePayload,
    readonly staffUserId: string,
  ) {}
}
