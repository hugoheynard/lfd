/**
 * La feuille de route des livraisons pour un jour de service (`AAAA-MM-JJ`).
 *
 * `withProcedures` dit si le lecteur a `delivery_procedures:read`
 * (`plan-droits-par-geste.md`, DG-D8) : la feuille s'ouvre sous
 * `delivery_run_sheet`, support compris, mais le texte et les photos des
 * procédures relèvent d'un autre droit. Sans lui, la procédure part VIDE.
 */
export class GetDeliveryRunSheetQuery {
  constructor(
    readonly day: string,
    readonly withProcedures: boolean,
  ) {}
}
