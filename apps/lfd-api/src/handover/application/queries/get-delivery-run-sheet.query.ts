/**
 * La feuille de route des livraisons pour un jour de service (`AAAA-MM-JJ`).
 *
 * `withProcedures` dit si le lecteur a `delivery_procedures:read`
 * (`plan-droits-par-geste.md`, DG-D8) : la feuille s'ouvre sous
 * `delivery_run_sheet`, support compris, mais le texte et les photos des
 * procédures relèvent d'un autre droit. Sans lui, la procédure part VIDE.
 *
 * `alsoOrderIds` : des livraisons d'un AUTRE jour demandé que l'écran sait
 * placées ou à placer ce jour-là — les commandes rapportées
 * (`decisions-par-defaut-2026-10-02.md`, § 4). Vide : la feuille du jour seule.
 */
export class GetDeliveryRunSheetQuery {
  constructor(
    readonly day: string,
    readonly withProcedures: boolean,
    readonly alsoOrderIds: readonly string[] = [],
  ) {}
}
