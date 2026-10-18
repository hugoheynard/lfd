import { z } from "zod";

/**
 * ── Les AUDIENCES de la clientèle — le tableau de bord agrégé (lot A1) ──────
 *
 * `documentation/recommandation-produit/plan-audiences.md` : la clientèle
 * décrite par ce qu'elle FAIT, en segments **sûrs** (pro / particulier,
 * activité du pro, retrait / livraison, site de retrait, zone de livraison,
 * fidélité, moment de passation), sur une période glissante finissant
 * aujourd'hui (jour métier). Depuis le lot A3 : la langue de la commande, et
 * le profil de séjour — **estimé**, jamais stocké (`stay_profile`).
 *
 * 🔴 **Aucun identifiant de client ne sort.** Une case qui compte moins de
 * `minClients` clients distincts ne porte AUCUN chiffre (`too_few_clients`) :
 * sans ce seuil, une case d'un seul client dirait ce qu'il a acheté.
 *
 * - `GET /admin/audiences?days=7|30|90&dimension=` → `AudiencesView`
 *   (sous `b2b_growth:read` ; 30 jours par défaut, toutes les coupes sans
 *   `dimension`)
 */

/** Les périodes que l'écran propose, en jours métier, aujourd'hui compris. */
export const AUDIENCE_PERIODS = [7, 30, 90] as const;
export type AudiencePeriod = (typeof AUDIENCE_PERIODS)[number];

/** La période par défaut : un mois glissant. */
export const DEFAULT_AUDIENCE_PERIOD: AudiencePeriod = 30;

/**
 * Les coupes de la clientèle, dans l'ordre où l'écran les montre. Chacune
 * partage les commandes de la période autrement ; une commande compte dans
 * une case de chaque coupe (sauf `activity`, qui ne voit que les pros,
 * `stay_profile`, qui ne voit que les particuliers, et `pickup_site` /
 * `delivery_zone`, qui ne voient que leur mode).
 */
export const AUDIENCE_DIMENSIONS = [
  "clientele",
  "activity",
  "fulfillment",
  "pickup_site",
  "delivery_zone",
  "loyalty",
  "moment",
  "order_locale",
  "stay_profile",
] as const;
export type AudienceDimension = (typeof AUDIENCE_DIMENSIONS)[number];

const period = z.coerce
  .number()
  .pipe(z.literal(AUDIENCE_PERIODS, "période attendue : 7, 30 ou 90 jours"));

/** `GET /admin/audiences?days=&dimension=` — une période, et une coupe ou toutes. */
export const audiencesQuerySchema = z.strictObject({
  days: period.optional(),
  dimension: z.enum(AUDIENCE_DIMENSIONS, "coupe inconnue").optional(),
});
export type AudiencesQuery = z.infer<typeof audiencesQuerySchema>;

/** Une famille de produits parmi les plus vendues d'une case, par CA HT. */
export interface AudienceTopFamily {
  /** `null` = article dont le catalogue ne connaît plus la famille. */
  readonly familyId: string | null;
  readonly name: string;
  readonly revenueHtCents: number;
}

/** Une case dont les chiffres s'affichent : assez de clients distincts. */
export interface AudienceShownCell {
  readonly status: "shown";
  readonly key: string;
  readonly label: string;
  /** Clients distincts — une société pour un pro, une personne sinon. */
  readonly clients: number;
  readonly orders: number;
  /** CA marchandises HT (remises et bon déduits, sans frais ni TVA), en centimes. */
  readonly revenueHtCents: number;
  /** Total encaissé TTC, frais compris, en centimes. */
  readonly revenueTtcCents: number;
  readonly averageBasketHtCents: number;
  readonly averageBasketTtcCents: number;
  /** Au plus trois, du plus gros CA HT au plus petit. */
  readonly topFamilies: readonly AudienceTopFamily[];
}

/** Une case sous le seuil : son nom, et rien d'autre — pas même zéro. */
export interface AudienceMaskedCell {
  readonly status: "too_few_clients";
  readonly key: string;
  readonly label: string;
}

export type AudienceCell = AudienceShownCell | AudienceMaskedCell;

/** Une coupe : ses cases, dans l'ordre de la coupe. */
export interface AudienceSegmentation {
  readonly dimension: AudienceDimension;
  readonly cells: readonly AudienceCell[];
}

export interface AudiencesView {
  readonly days: AudiencePeriod;
  /** Premier et dernier jour métier `AAAA-MM-JJ` de la période, compris. */
  readonly from: string;
  readonly to: string;
  /** Le seuil d'anonymat appliqué : en dessous, une case ne dit rien. */
  readonly minClients: number;
  readonly segmentations: readonly AudienceSegmentation[];
  /**
   * Les commandes nées d'un abonnement, À PART : leur moment est celui du
   * planificateur et leur fidélité est automatique — mêlées aux coupes,
   * elles en fausseraient deux (moment, fidélité). Même seuil.
   */
  readonly subscriptions: AudienceCell;
}
