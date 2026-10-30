/**
 * Un article d'un client sur la période, dans un état du marqueur : `true`
 * (sur mesure) ou `null` (ligne d'avant le suivi). Les lignes affirmées non
 * sur mesure ne sortent pas : le rapport ne les montre pas.
 */
export interface MadeToOrderClientLine {
  /** `company:<id>` ou `person:<id>`. */
  readonly clientKey: string;
  readonly kind: "company" | "person";
  readonly companyId: string | null;
  /** Enseigne (raison sociale à défaut), ou prénom et nom du particulier. */
  readonly name: string;
  readonly principalName: string | null;
  readonly sku: string;
  readonly productName: string;
  readonly saleUnit: "piece" | "weight";
  readonly madeToOrder: true | null;
  readonly quantity: number;
  readonly htCents: number;
  readonly orders: number;
}

/**
 * Port de **lecture** du rapport du sur mesure par client (lot R). Le
 * client est la société qui commande, chaque site à part, ou la personne
 * pour un particulier (plan sur mesure, § 5 ter). `from` et `to` sont des
 * jours de passation à Paris, compris.
 */
export abstract class MadeToOrderClientReader {
  abstract lines(from: string, to: string): Promise<readonly MadeToOrderClientLine[]>;
}
