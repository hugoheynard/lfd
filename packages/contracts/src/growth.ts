/**
 * Contrats du module **croissance** (espace commercial). Vues **dérivées du
 * journal** d'événements côté backend et rendues telles quelles à la surface
 * staff : formes de lecture pures (plain `interface`, aucun Zod), montants en
 * centimes, dates en ISO.
 */

/** Température d'un prospect : `hot` a commandé, `mid` s'est inscrit sans commander. */
export type ProspectTemperature = "hot" | "mid";

/**
 * Trajectoire du rythme de commande (deux fenêtres glissantes de 14 jours) :
 * accélère / stable / refroidit / dormant (aucune commande récente).
 */
export type MomentumTrajectory = "accelerating" | "stable" | "cooling" | "dormant";

/** Une ligne de la liste **prospects** (sujet = personne). */
export interface ProspectView {
  readonly subjectId: string;
  /** E-mail connu du journal (inscription) ; vide si la personne préexiste au journal. */
  readonly email: string;
  readonly temperature: ProspectTemperature;
  readonly momentum: MomentumTrajectory;
  readonly orderCount: number;
  /** Total commandé, en centimes. */
  readonly totalCents: number;
  /** Dernière commande (ISO), ou `null` pour un mid. */
  readonly lastOrderAt: string | null;
  /** Première trace de la personne dans le journal (ISO). */
  readonly firstSeenAt: string;
  /** Jours depuis la dernière activité (dernière commande, sinon 1re trace). */
  readonly recencyDays: number;
}

/** Statut d'un dossier dans le tunnel d'activation. */
export type ActivationStatus = "pending" | "active";

/** Pièce d'activation (alignée sur les steps du tunnel). */
export type ActivationStep = "tva" | "kbis" | "billing" | "delivery";

/** Une ligne du tunnel **activation & frictions** (sujet = société). */
export interface ActivationView {
  readonly companyId: string;
  readonly declaredVia: "self" | "staff";
  readonly declaredAt: string;
  readonly status: ActivationStatus;
  readonly activatedAt: string | null;
  /** Pièces franchies, dans l'ordre canonique. */
  readonly stepsReached: readonly ActivationStep[];
  /** Pièces encore manquantes. */
  readonly stepsMissing: readonly ActivationStep[];
  /** Taux de complétion des pièces, 0..1. */
  readonly completion: number;
  /** Déclarée par le client **sans aucune main du staff** (product-led). */
  readonly adoptionPlus: boolean;
  /** Jours depuis la déclaration si encore `pending` ; `null` si active. */
  readonly stalledDays: number | null;
}

/**
 * **Play** — le type de motion commerciale recommandée pour un lead, pas un tri
 * unique qui mélange les intentions :
 * - `lock_in` : prospect chaud (a commandé, pas d'abonnement) → verrouiller par un abonnement.
 * - `rescue` : dossier d'activation bloqué (adoption-stalled) → débloquer les pièces.
 * - `upgrade` : lead engagé (abonné, momentum porteur) → étendre le compte.
 * - `win_back` : lead qui refroidit ou dort (a commandé puis s'est tu) → reconquérir.
 */
export type PlayType = "lock_in" | "rescue" | "upgrade" | "win_back";

/**
 * Une ligne de la queue **« 5 meilleurs coups du jour »** — lue du **read-model
 * matérialisé** `lead_score` (recalculé par cron, pas temps réel). Chaque ligne
 * est un lead **scoré** (0..100) et **typé par play**, avec un `reason` lisible
 * pour rendre le score auditable côté commercial.
 */
export interface LeadScoreView {
  /** Sujet du lead : une personne (`user`) ou une société (`company`). */
  readonly subjectType: "user" | "company";
  readonly subjectId: string;
  /** Libellé lisible (e-mail connu du journal, sinon l'identifiant). */
  readonly label: string;
  readonly play: PlayType;
  /** Score de priorité, entier 0..100 (fonction pure auditable). */
  readonly score: number;
  /** Justification courte du score/play (product-led, pas de boîte noire). */
  readonly reason: string;
  /** Trajectoire du rythme si connue (leads personne) ; `null` pour un dossier société. */
  readonly momentum: MomentumTrajectory | null;
  /** Total commandé rattaché au lead, en centimes. */
  readonly monetaryCents: number;
  /** Jours depuis la dernière activité. */
  readonly recencyDays: number;
  /** Instant du dernier recalcul du read-model (ISO) — fraîcheur de la reco. */
  readonly computedAt: string;
}
