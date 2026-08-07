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
