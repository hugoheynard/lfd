import type { AmendCompanyMercurialePayload } from "@lfd/contracts";

/**
 * « Que paierait ce client si cet avenant était enregistré ? » — l'aperçu
 * d'un avenant (`l-avenant-date.md`, § 8.2). Une lecture : l'avenant
 * est appliqué à une copie en mémoire, rien n'est écrit.
 */
export class PreviewMercurialeAmendmentQuery {
  constructor(
    readonly companyId: string,
    readonly mercurialeId: string,
    readonly payload: AmendCompanyMercurialePayload,
  ) {}
}
