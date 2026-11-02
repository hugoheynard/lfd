import type { StaffTrace } from "../../account/domain/value-objects/staff-trace.js";

/**
 * **Un geste daté et signé** — l'envoi, l'annulation, l'arrivée d'un
 * réassort, la réception d'un reçu, la déclaration ou la levée d'une alerte.
 * Une seule forme pour tout le réassort : trois copies identiques
 * (`SiteResupplyTrace`, `ResupplyReceiptTrace`, `StockAlertTrace`) ont été
 * fondues le 2026-11-02, pour qu'une trace passe d'un agrégat à l'autre
 * sans conversion ni dérive.
 */
export interface ResupplyTrace {
  readonly at: Date;
  readonly author: StaffTrace;
}
