/**
 * Contrats du module **croissance** (espace commercial). La plupart des vues sont
 * **dérivées du journal** d'événements côté backend et rendues telles quelles à la
 * surface staff (plain `interface`, aucun Zod). Font exception les **leads cold**,
 * qui sont un **agrégat** saisi (payloads Zod validés). Montants en centimes,
 * dates en ISO.
 */
import { z } from "zod";

/**
 * Température d'un prospect : `hot` a commandé, `mid` s'est inscrit sans commander,
 * `cold` a été **saisi par un commercial** (sortant) — ce dernier vient de
 * l'agrégat `Lead`, pas du journal.
 */
export type ProspectTemperature = "hot" | "mid" | "cold";

/** Origine du prospect : entrant (self-service) ou sortant (démarchage commercial). */
export type ProspectSource = "inbound" | "outbound";

/**
 * Trajectoire du rythme de commande (deux fenêtres glissantes de 14 jours) :
 * accélère / stable / refroidit / dormant (aucune commande récente).
 */
export type MomentumTrajectory = "accelerating" | "stable" | "cooling" | "dormant";

/** Une ligne de la liste **prospects** (sujet = personne, ou lead cold saisi). */
export interface ProspectView {
  readonly subjectId: string;
  /** E-mail connu du journal (inscription) ; vide si la personne préexiste au journal. */
  readonly email: string;
  readonly temperature: ProspectTemperature;
  /** Entrant (hot/mid, dérivé du journal) ou sortant (cold, agrégat démarchage). */
  readonly source: ProspectSource;
  readonly momentum: MomentumTrajectory;
  readonly orderCount: number;
  /** Total commandé, en centimes. */
  readonly totalCents: number;
  /** Dernière commande (ISO), ou `null` pour un mid/cold. */
  readonly lastOrderAt: string | null;
  /** Première trace de la personne dans le journal (ISO). */
  readonly firstSeenAt: string;
  /** Jours depuis la dernière activité (dernière commande, sinon 1re trace). */
  readonly recencyDays: number;
  /** Libellé lisible : e-mail entrant, ou raison sociale saisie pour un cold. */
  readonly label: string;
  /**
   * Statut de pipeline pour un lead **cold** (permet les actions de suivi en
   * ligne) ; `null` pour un prospect **entrant** (hot/mid), qui n'a pas d'agrégat.
   */
  readonly leadStatus: LeadStatus | null;
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
 * - `nurture` : lead **cold** (démarchage sortant) actif → faire avancer le pipeline.
 */
export type PlayType = "lock_in" | "rescue" | "upgrade" | "win_back" | "nurture";

/**
 * Une ligne de la queue **« 5 meilleurs coups du jour »** — lue du **read-model
 * matérialisé** `lead_score` (recalculé par cron, pas temps réel). Chaque ligne
 * est un lead **scoré** (0..100) et **typé par play**, avec un `reason` lisible
 * pour rendre le score auditable côté commercial.
 */
export interface LeadScoreView {
  /** Sujet : une personne (`user`), une société (`company`) ou un lead cold (`lead`). */
  readonly subjectType: "user" | "company" | "lead";
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

// ── Leads cold (agrégat de démarchage) ─────────────────────────────────────────

/**
 * Statut d'un **lead cold** dans le pipeline commercial explicite. Il **ne recule
 * jamais** (jalon monotone) ; `converted` / `lost` sont **terminaux**, atteignables
 * depuis n'importe quel état actif. Contrairement à hot/mid (projections sans
 * invariant), le cold est un **agrégat** : ces transitions sont gardées.
 */
export type LeadStatus = "new" | "contacted" | "qualified" | "negotiating" | "converted" | "lost";

/** Une ligne de lead cold telle que rendue à la surface staff. */
export interface LeadView {
  readonly id: string;
  readonly businessName: string;
  /** Nom du contact chez le prospect, ou chaîne vide. */
  readonly contactName: string;
  /** E-mail du prospect (clé de rapprochement à l'inscription), ou chaîne vide. */
  readonly email: string;
  readonly phone: string;
  /** SIRET si connu, ou chaîne vide. */
  readonly siret: string;
  readonly status: LeadStatus;
  /** Notes libres du commercial. */
  readonly notes: string;
  /** Compte rapproché (le prospect s'est inscrit), ou `null`. */
  readonly linkedUserId: string | null;
  readonly createdAt: string;
  /** Dernier contact enregistré (ISO), ou `null` si jamais contacté. */
  readonly lastContactedAt: string | null;
}

/** Charge de **saisie** d'un lead cold (démarchage). Au moins la raison sociale. */
export const captureLeadPayloadSchema = z.object({
  businessName: z.string().trim().min(1).max(200),
  contactName: z.string().trim().max(200).default(""),
  email: z.string().trim().email().or(z.literal("")).default(""),
  phone: z.string().trim().max(40).default(""),
  siret: z.string().trim().max(20).default(""),
  notes: z.string().trim().max(2000).default(""),
});
export type CaptureLeadPayload = z.infer<typeof captureLeadPayloadSchema>;

/** Cibles de mutation manuelle d'un lead par le staff (hors rapprochement auto). */
export const advanceLeadStatusPayloadSchema = z.object({
  status: z.enum(["contacted", "qualified", "negotiating", "converted", "lost"]),
});
export type AdvanceLeadStatusPayload = z.infer<typeof advanceLeadStatusPayloadSchema>;

/** Réponse de création d'un lead. */
export interface CreatedLeadResponse {
  readonly id: string;
}
