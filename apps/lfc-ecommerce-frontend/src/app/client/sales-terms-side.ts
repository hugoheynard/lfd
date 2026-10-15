import type { SalesTermsDocument } from '@lfd/contracts/content-values';
import type { CustomerAudience } from '@lfd/contracts/shop-values';

/**
 * **Le côté des CGV qu'on lit** — particulier ou pro (plan
 * `legal/plan-cgv-par-audience.md`, bandeau du 2026-10-15 : une seule page
 * « CGV » avec un switch).
 *
 * C'est un choix d'AFFICHAGE, sans enjeu juridique : les deux textes sont
 * publics, et ce qui s'applique à une commande est décidé au serveur, à la
 * passation (C2″, C4′).
 */
export type SalesTermsSide = 'particulier' | 'pro';

/** Le paramètre d'adresse qui porte le côté : `/cgv?pour=pro`. */
export const SALES_TERMS_SIDE_PARAM = 'pour';

const SIDES: readonly SalesTermsSide[] = ['particulier', 'pro'];

/** Le côté que nomme l'adresse, ou `null` — absent ou inconnu, on retombe sur le défaut. */
export function parseSalesTermsSide(raw: string | null): SalesTermsSide | null {
  return SIDES.find((side) => side === raw) ?? null;
}

/**
 * Le côté ouvert faute d'adresse : pro pour une clientèle pro (`audienceOf`,
 * société ACTIVE seulement), particulier sinon — visiteur et clientèle encore
 * inconnue compris.
 */
export function defaultSalesTermsSide(audience: CustomerAudience | null): SalesTermsSide {
  return audience === 'b2b' ? 'pro' : 'particulier';
}

/** Le texte que ce côté lit. */
export function salesTermsDocumentOf(side: SalesTermsSide): SalesTermsDocument {
  return side === 'pro' ? 'salesTermsPro' : 'salesTerms';
}
