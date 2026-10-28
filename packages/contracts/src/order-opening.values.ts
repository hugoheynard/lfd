import type { CustomerAudience } from "./customer-audience.js";

/**
 * **L'ouverture de la boutique à la commande**, sans zod.
 *
 * Séparé de `order-opening.ts` pour la raison de poids de
 * `delivery-availability.values.ts` : la boutique lit ces valeurs, et le baril
 * embarquerait zod dans son bundle initial. Un front les importe par
 * `@lfd/contracts/shop-values`.
 *
 * Un réglage global, posé dans « E-commerce LFC → Réglages → Ouverture de la
 * boutique » (Hugo, 2026-10-09). Fermée à une clientèle, la boutique garde son
 * catalogue et ses prix ; seules les PASSATIONS de cette clientèle sont
 * refusées. Doc : `documentation/commandes/passation/ouverture-de-la-boutique.md`.
 */
export interface OrderOpeningView {
  readonly ordersOpenToB2b: boolean;
  readonly ordersOpenToB2c: boolean;
  /**
   * Le premier jour de service (`AAAA-MM-JJ`) que les pros peuvent commander,
   * ou `null` : aucune restriction (plan `plan-premier-jour-commandable.md`,
   * 2026-10-28). Une date passée ne restreint plus rien. Les exemptions et la
   * saisie de l'équipe passent outre.
   *
   * FACULTATIF dans le type le temps que le back-office l'apprenne (lot J3) :
   * le serveur le sert TOUJOURS, `null` compris ; un objet construit par un
   * front sans lui se lit « aucune restriction ».
   */
  readonly firstServiceDayB2b?: string | null;
  /** Le même, pour les particuliers. */
  readonly firstServiceDayB2c?: string | null;
  /** Instant du dernier geste ; `null` tant que personne n'a rien réglé (ouverte aux deux). */
  readonly updatedAt: string | null;
  /** Le nom de qui l'a posé, figé au geste ; `null` tant que personne n'a rien réglé. */
  readonly updatedBy: string | null;
}

/** Ce que sert la route PUBLIQUE : les deux clientèles et leurs dates, sans l'instant ni l'auteur. */
export type PublicOrderOpeningView = Pick<
  OrderOpeningView,
  "ordersOpenToB2b" | "ordersOpenToB2c" | "firstServiceDayB2b" | "firstServiceDayB2c"
>;

/** Le réglage tant que personne ne l'a posé : ouverte aux deux — rien ne se ferme au déploiement. */
export const DEFAULT_ORDER_OPENING: OrderOpeningView = {
  ordersOpenToB2b: true,
  ordersOpenToB2c: true,
  firstServiceDayB2b: null,
  firstServiceDayB2c: null,
  updatedAt: null,
  updatedBy: null,
};

/** La boutique prend-elle les commandes de cette clientèle ? */
export function ordersOpenTo(
  settings: Pick<OrderOpeningView, "ordersOpenToB2b" | "ordersOpenToB2c">,
  audience: CustomerAudience,
): boolean {
  return audience === "b2b" ? settings.ordersOpenToB2b : settings.ordersOpenToB2c;
}

/** Le code du refus (409) quand la boutique est fermée à la clientèle de qui commande. */
export const ORDERS_CLOSED_FOR_AUDIENCE = "orders.closed_for_audience";

/**
 * Le code du refus (409) quand la journée demandée précède le premier jour
 * commandable de la clientèle de qui commande (2026-10-28).
 */
export const SERVICE_DAY_BEFORE_FIRST_ORDERABLE_DAY =
  "orders.service_day_before_first_orderable_day";

/**
 * **Puis-je commander ?** — la lecture servie à la personne CONNECTÉE
 * (`GET /order-admission/mine`, 2026-10-26).
 *
 * `ordersOpen` dit si la boutique est ouverte à SA clientèle ; `canOrder`, si
 * sa passation serait prise — vrai aussi quand la boutique est fermée et
 * qu'une exemption couvre sa société ou son adresse. Ni la liste des
 * exemptions ni la raison ne sortent : « fermée, mais vous pouvez commander ».
 */
export interface MyOrderAdmissionView {
  readonly ordersOpen: boolean;
  readonly canOrder: boolean;
  /**
   * Le premier jour de service (`AAAA-MM-JJ`) que CETTE personne peut
   * commander (2026-10-28) : `null` sans date posée pour sa clientèle, date
   * déjà passée, ou exemption qui la couvre.
   */
  readonly firstServiceDay: string | null;
}

/**
 * La même question pour une commande SANS compte, sur l'adresse saisie
 * (`POST /order-admission/guest`) : un booléen pour CETTE adresse, rien d'autre.
 */
export interface GuestOrderAdmissionView {
  readonly canOrder: boolean;
  /** Le premier jour commandable pour CETTE adresse ; cf. {@link MyOrderAdmissionView}. */
  readonly firstServiceDay: string | null;
}
