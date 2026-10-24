import { z } from "zod";

import {
  fulfillmentMethodSchema,
  orderStatusSchema,
  paymentStatusSchema,
  type FulfillmentMethod,
  type FulfillmentSource,
  type OrderOrigin,
  type OrderStatus,
  type PaymentStatus,
} from "./order.js";
import type { OrderClientele } from "./order-handover.js";

/**
 * **La liste staff des commandes** — `GET /admin/orders`.
 *
 * Sortie d'`order.ts` le 2026-10-12 avec la pagination par curseur
 * (`documentation/commandes/back-office/page-commandes.md`, lot C1) : la liste a désormais
 * ses filtres, sa page et sa ligne, qui ne concernent ni le client ni la
 * passation.
 */

/**
 * Une commande dans la liste **staff**. Volontairement distincte d'`OrderView` :
 * un commercial parcourt des dizaines de lignes, il lui faut **qui a commandé**
 * — que la vue client n'a aucune raison de porter, le client se connaissant — et
 * pas les lignes d'articles, qu'il ne lit qu'après avoir ouvert.
 */
export interface AdminOrderRow {
  readonly id: string;
  readonly orderNumber: string;
  /** ISO. Passée le. */
  readonly placedAt: string;
  readonly status: OrderStatus;
  /**
   * **Hors plan** (lot O3, `plan-reglages-commandes.md` §8.3) : reçue par
   * l'équipe pour une journée dont le plan était déjà arrêté, et pas encore
   * reprise au fournil (toujours `placed`). Le geste : reprendre la journée.
   */
  readonly offPlan: boolean;
  /**
   * **Manque signalé — décision attendue** (lot E6a,
   * `commandes/plan-e6-le-depart-incomplet.md` § 3) : l'instant ISO du
   * signalement en vigueur au colisage, `null` = aucun.
   */
  readonly shortfallReportedAt: string | null;
  readonly paymentStatus: PaymentStatus;
  readonly fulfillmentMethod: FulfillmentMethod;
  /**
   * Le jour de retrait ou de livraison, `AAAA-MM-JJ` — `null` sur une commande
   * qui n'en a pas demandé (antérieure à l'obligation).
   */
  readonly fulfillmentDay: string | null;
  /**
   * QUI a commandé, figé à la passation : `pro` ou `public`. `null` = commande
   * d'avant la distinction, jamais rattrapée (« sans société » ne voulait pas
   * dire public) — cf. `HandoverQueueEntryView.clientele`.
   */
  readonly clientele: OrderClientele | null;
  /**
   * Le site d'un retrait, figé dans le snapshot du point de retrait (lot S2) ;
   * `null` pour une livraison ou un retrait d'avant S2. Sert à la couleur
   * logistique de la liste staff, lue à l'affichage dans la palette des sites.
   */
  readonly siteId: string | null;
  /**
   * Le nom du point de retrait FIGÉ à la commande (`pickup_address.label`) ;
   * `null` pour une livraison ou un snapshot illisible. Dit le lieu d'un
   * retrait dont le snapshot n'a pas de `siteId`.
   */
  readonly pickupLabel: string | null;
  /**
   * L'heure du service — la fenêtre ou le créneau figé sur la commande, AVEC
   * sa provenance : un `default` est une heure d'ouverture recopiée, pas une
   * promesse (cf. `HandoverQueueWindow`). `null` : rien de figé.
   */
  readonly fulfillmentWindow: {
    readonly start: string | null;
    readonly end: string;
    readonly source: FulfillmentSource;
  } | null;
  /**
   * Sous-total **HT** et **TVA**, en centimes — la décomposition que réclame la
   * comptabilité. Ils vivent déjà sur la commande ; les taire dans la liste
   * obligeait à ouvrir chaque commande pour reporter un mois.
   */
  readonly subtotalCents: number;
  readonly vatCents: number;
  readonly totalCents: number;
  /**
   * Qui a commandé, en clair : la raison sociale, ou la personne quand la
   * commande est **zéro friction** (sans entreprise). Résolu au serveur — c'est
   * une jointure, pas une affaire d'écran.
   */
  readonly customerLabel: string;
  /** `null` = commande personnelle, sans entreprise. */
  readonly companyId: string | null;
  /**
   * La société sous le nom où elle se reconnaît (`companyDisplayName` :
   * l'enseigne, à défaut la raison sociale), `null` sans entreprise. C'est ce
   * qui distingue deux sites d'un même principal, qui partagent souvent la
   * raison sociale.
   */
  readonly companyDisplayName: string | null;
  /**
   * Par quelle porte elle est entrée — cf. {@link OrderOrigin}. Remplace le
   * booléen `fromSubscription` : deux façons de dire la provenance sur la même
   * ligne finissaient par se contredire dès qu'une troisième porte s'ouvrait,
   * et c'est précisément ce qui vient d'arriver avec la saisie par l'équipe.
   */
  readonly origin: OrderOrigin;
}

/**
 * Une page de la liste, la plus récente en tête.
 *
 * `nextCursor` est **opaque** : l'écran le renvoie tel quel en `cursor` pour la
 * page suivante, et `null` dit qu'il n'y en a plus. Le curseur désigne la
 * dernière ligne rendue (passée le, puis identifiant) : une commande passée
 * entre deux pages ne décale rien — elle est plus récente que le curseur, donc
 * absente des pages suivantes, et aucune ligne n'est rendue deux fois.
 */
export interface AdminOrdersPage {
  readonly rows: readonly AdminOrderRow[];
  readonly nextCursor: string | null;
  /**
   * Combien de commandes répondent aux filtres, toutes pages confondues — ce
   * que compte un paginateur numéroté (`page`). Le curseur n'y entre pas : le
   * total est celui de la liste, pas de ce qui reste après la page lue.
   */
  readonly total: number;
}

/** Le filtre de clientèle — les deux valeurs de {@link OrderClientele}. */
export const adminOrderClienteleSchema = z.enum([
  "pro",
  "public",
]) satisfies z.ZodType<OrderClientele>;

/**
 * Un jour de Paris, `AAAA-MM-JJ`. La forme seulement : un jour qui n'existe pas
 * au calendrier est refusé par le serveur en le nommant.
 */
const parisDaySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "jour attendu au format AAAA-MM-JJ");

/** La longueur au-delà de laquelle une recherche n'est plus une recherche. */
const SEARCH_MAX_LENGTH = 100;

/**
 * Filtres de la liste staff. `limit` est **borné** : une liste d'administration
 * sans plafond finit par ramener toute la table le jour où le catalogue marche.
 *
 * Les bornes de jour sont **inclusives** des deux côtés et lues à l'heure de
 * Paris : `placedTo=2026-10-12` couvre la journée entière du 12, minuit de
 * Paris compris, jamais minuit UTC.
 */
export const adminOrdersQuerySchema = z
  .object({
    /** Restreint à une entreprise. Absent = toutes, entreprises et personnelles. */
    companyId: z.string().trim().min(1).optional(),
    /**
     * Avec `companyId` : ajoute les commandes de ses sous-comptes ACTUELS
     * (`parent_company_id`). Une vue de suivi, pas d'argent : le payeur à date,
     * c'est le relevé de cycle. Sans `companyId`, sans effet.
     */
    withSubAccounts: z
      .enum(["true", "false"])
      .transform((value) => value === "true")
      .optional(),
    /** Restreint à un état d'avancement. */
    status: orderStatusSchema.optional(),
    /** Restreint à un état du règlement. */
    paymentStatus: paymentStatusSchema.optional(),
    /**
     * `pro` ou `public`. Une commande d'avant la distinction (`clientele` nul en
     * base) ne répond à AUCUN des deux : on ne devine pas après coup qui elle
     * servait.
     */
    clientele: adminOrderClienteleSchema.optional(),
    /** Retrait ou livraison. */
    method: fulfillmentMethodSchema.optional(),
    /** Jour de passation, à l'heure de Paris — bornes incluses. */
    placedFrom: parisDaySchema.optional(),
    placedTo: parisDaySchema.optional(),
    /** Jour de retrait ou de livraison — bornes incluses. */
    fulfillmentFrom: parisDaySchema.optional(),
    fulfillmentTo: parisDaySchema.optional(),
    /**
     * Référence de commande, raison sociale, enseigne, prénom ou nom du client —
     * sans égard à la casse. Plusieurs mots se cumulent : chacun doit se trouver
     * dans l'un de ces champs (« léa martin »).
     */
    q: z.string().trim().min(1).max(SEARCH_MAX_LENGTH).optional(),
    /** Le `nextCursor` de la page précédente, tel quel. */
    cursor: z.string().trim().min(1).optional(),
    /**
     * Le numéro de page, à partir de 1 — pagination **numérotée** (2026-10-23,
     * la liste du back-office) : saute `(page - 1) × limit` lignes. Exclusif du
     * `cursor` : deux façons de dire où l'on est se contrediraient.
     */
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .refine((query) => query.page === undefined || query.cursor === undefined, {
    message: "`page` et `cursor` ne se combinent pas : choisir l'un ou l'autre",
    path: ["page"],
  });
export type AdminOrdersQuery = z.infer<typeof adminOrdersQuerySchema>;
