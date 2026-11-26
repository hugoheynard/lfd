/**
 * **Le récapitulatif des BL d'un restaurant maison**, tel que le back-office
 * le lit (`documentation/comptabilite/facturation/plan-restaurants-maison.md`,
 * D7–D10) : un document figé, sans montant, des quantités remises par
 * produit sur un mois civil de Paris.
 *
 * Routes : `GET /admin/companies/:companyId/in-house-recaps` (la liste du
 * payeur), `GET /admin/in-house-recaps/:recapId` (le détail),
 * `GET /admin/in-house-recaps/revised` (les signalements), sous
 * `b2b_companies:read` ; `GET …/:recapId/document` (le PDF rangé) ;
 * `POST …/:recapId/resend` et `POST …/:recapId/reissue`, sous
 * `b2b_in_house_payers:write`, clé d'intention obligatoire.
 */

/** Un récapitulatif dans la liste du payeur. */
export interface InHouseRecapSummaryView {
  readonly id: string;
  /** `RBL-…`. */
  readonly number: string;
  /** Le mois civil de Paris, `AAAA-MM`. */
  readonly month: string;
  /** L'instant d'émission, ISO 8601. */
  readonly issuedAt: string;
  /** Vrai quand le PDF est rangé — sinon « Renvoyer l'e-mail » le rend. */
  readonly hasDocument: boolean;
  /** Le rectificatif qui le remplace, ou `null`. */
  readonly replacedById: string | null;
  readonly noteCount: number;
  /** Les BL révisés depuis l'émission ; toujours 0 pour un récapitulatif remplacé. */
  readonly revisedNoteCount: number;
}

/** La liste d'un payeur : ses récapitulatifs, ses mois vides, ses mois manqués. */
export interface PayerInHouseRecapsView {
  readonly recaps: readonly InHouseRecapSummaryView[];
  /** Les mois que le passage a vus sans BL — rien à récapituler. */
  readonly emptyMonths: readonly string[];
  /** Les mois clos, maison, sans aucune issue : le passage ne les a pas faits. */
  readonly missedMonths: readonly string[];
}

/** Un BL couvert, avec sa version figée et la courante. */
export interface InHouseRecapNoteView {
  readonly deliveryNoteId: string;
  readonly number: string;
  readonly handedOverAt: string;
  readonly frozenVersion: number;
  readonly revised: boolean;
}

/** Une ligne : la quantité totale remise d'un produit, par unité de vente. */
export interface InHouseRecapLineView {
  readonly sku: string;
  readonly productName: string;
  readonly saleUnit: string;
  readonly quantity: number;
}

/** Le détail d'un récapitulatif. */
export interface InHouseRecapDetailView {
  readonly id: string;
  readonly payerId: string;
  readonly number: string;
  readonly month: string;
  readonly issuedAt: string;
  readonly hasDocument: boolean;
  readonly replacedById: string | null;
  readonly lines: readonly InHouseRecapLineView[];
  readonly notes: readonly InHouseRecapNoteView[];
}

/** Un BL révisé depuis l'émission d'un récapitulatif. */
export interface RevisedInHouseRecapNoteView {
  readonly deliveryNoteId: string;
  readonly number: string;
  readonly frozenVersion: number;
  readonly currentVersion: number;
}

/** Un signalement : un récapitulatif non remplacé dont un BL a été révisé. */
export interface RevisedInHouseRecapView {
  readonly recapId: string;
  readonly payerId: string;
  readonly number: string;
  readonly month: string;
  readonly notes: readonly RevisedInHouseRecapNoteView[];
}

/** La réponse de « Réémettre » : le rectificatif. */
export interface InHouseRecapReissuedView {
  readonly id: string;
}

/** La réponse de « Renvoyer l'e-mail » : le récapitulatif renvoyé. */
export interface InHouseRecapResentView {
  readonly recapId: string;
}
