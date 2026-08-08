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

// ── Stats de croissance (onglet Croissance + rappel dashboard) ─────────────────

/** Chiffres de tête du dashboard de croissance. Montants en centimes, taux 0..1. */
export interface GrowthKpis {
  /** Prospects entrants (hot + mid) + cold actifs. */
  readonly prospects: number;
  readonly hot: number;
  readonly mid: number;
  readonly cold: number;
  /** Leads cold encore ouverts (non clos). */
  readonly activeLeads: number;
  readonly orders: number;
  readonly ordersTotalCents: number;
  readonly companiesDeclared: number;
  readonly companiesActivated: number;
  /** Conversion = activées / déclarées (0..1). */
  readonly conversionRate: number;
}

/** Un point hebdomadaire de la **courbe d'acquisition**. `weekStart` = lundi ISO. */
export interface AcquisitionPoint {
  readonly weekStart: string;
  readonly registrations: number;
  readonly firstOrders: number;
  readonly leadsCaptured: number;
}

/**
 * **Momentum du vivier** — un point hebdomadaire du flux de prospects par
 * **chaleur** : combien de personnes *tiennent* dans chaque bande (hot/mid/cold) à
 * la clôture de la semaine. C'est un **stock debout** reconstitué période par
 * période (les gens entrent en s'inscrivant / en étant démarchés, sortent en
 * commandant pour une société ou en fermant le lead), pas un flux d'événements.
 * Rendu en flux (themeRiver).
 */
export interface TemperatureFlowPoint {
  readonly weekStart: string;
  /** A commandé en perso, pas encore pour une société. */
  readonly hot: number;
  /** Inscrit, zéro commande. */
  readonly mid: number;
  /** Lead sortant actif (démarchage en cours). */
  readonly cold: number;
}

/** Une marche d'entonnoir : le nombre atteignant cette étape (les fuites se lisent entre marches). */
export interface FunnelStep {
  readonly key: string;
  readonly label: string;
  readonly count: number;
}

/**
 * Une **cohorte de rétention** : les personnes inscrites une semaine donnée, et la
 * part (0..1) d'entre elles ayant commandé la k-ième semaine après l'inscription
 * (`retention[0]` = semaine d'inscription). Rendu en heatmap.
 */
export interface CohortRow {
  readonly cohortWeek: string;
  readonly size: number;
  readonly retention: readonly number[];
}

/** Payload complet du dashboard de croissance (une seule requête). */
export interface GrowthStatsView {
  readonly kpis: GrowthKpis;
  readonly acquisition: readonly AcquisitionPoint[];
  readonly temperatureFlow: readonly TemperatureFlowPoint[];
  /** Transferts entre bandes de chaleur : état au début → état à la fin de la période. */
  readonly temperatureTransitions: LifecycleFlow;
  readonly coldFunnel: readonly FunnelStep[];
  readonly activationFunnel: readonly FunnelStep[];
  readonly cohorts: readonly CohortRow[];
  readonly lifecycle: LifecycleFlow;
  readonly velocity: readonly VelocityMetric[];
  readonly concentration: AccountConcentration;
  readonly acquisitionMix: readonly AcquisitionMixPoint[];
  /** Fenêtre d'analyse en semaines (ex. 13 ≈ 90 j). */
  readonly weeks: number;
  readonly computedAt: string;
}

// ── v2 data viz : flux, vélocité, concentration, mix ──────────────────────────

/** Nœud d'un flux (Sankey du cycle de vie). */
export interface FlowNode {
  readonly key: string;
  readonly label: string;
}
/** Arête d'un flux : `value` personnes passent de `source` à `target`. */
export interface FlowLink {
  readonly source: string;
  readonly target: string;
  readonly value: number;
}
/** **Sankey du cycle de vie** : inscrit → (a commandé) → (a déclaré) → activé, avec les fuites. */
export interface LifecycleFlow {
  readonly nodes: readonly FlowNode[];
  readonly links: readonly FlowLink[];
}

/** Résumé cinq-nombres d'une distribution (pour un boxplot). */
export interface Quantiles {
  readonly min: number;
  readonly q1: number;
  readonly median: number;
  readonly q3: number;
  readonly max: number;
}
/** Médiane d'un délai par semaine (tendance sous le boxplot). */
export interface VelocityTrendPoint {
  readonly weekStart: string;
  readonly median: number;
}
/** Un **délai** (jours) : distribution + tendance de la médiane par cohorte. */
export interface VelocityMetric {
  readonly key: string;
  readonly label: string;
  readonly quantiles: Quantiles;
  readonly count: number;
  readonly trend: readonly VelocityTrendPoint[];
}

/** Un point de la **courbe de Lorenz** (part cumulée des comptes vs du volume, 0..1). */
export interface LorenzPoint {
  readonly cumAccounts: number;
  readonly cumVolume: number;
}
/** **Concentration** du volume de commandes par compte (Lorenz + Gini + part du top décile). */
export interface AccountConcentration {
  readonly lorenz: readonly LorenzPoint[];
  /** Indice de Gini, 0 (égalité parfaite) → 1 (un seul compte). */
  readonly gini: number;
  /** Part du volume détenue par les 10 % de comptes les plus gros (0..1). */
  readonly topDecileShare: number;
  readonly accounts: number;
  readonly totalVolumeCents: number;
}

/** Un point du **mix d'acquisition** product-led vs sales-led par semaine. */
export interface AcquisitionMixPoint {
  readonly weekStart: string;
  /** Conversions self / adoption+ (0-touch). */
  readonly productLed: number;
  /** Conversions assistées (staff, ou lead cold converti manuellement). */
  readonly salesLed: number;
}

// ── Marché ciblé & adoption (pénétration par territoire) ──────────────────────

/** Un code NAF ciblé (catégorie d'acteurs professionnels visés). */
export interface MarketNafCode {
  readonly code: string;
  readonly label: string;
}

/** Le comptage renvoyé par l'API pour un code NAF dans une zone. */
export interface MarketZoneCount {
  readonly code: string;
  readonly count: number;
}

/**
 * Une **zone ciblée** (code postal) avec le nombre d'acteurs visés stocké. `addressable`
 * = somme des comptages sur les NAF ciblés ; `fetchedAt` = dernière interrogation de
 * l'API (`null` tant qu'on n'a pas encore redemandé).
 */
export interface MarketZoneView {
  readonly codePostal: string;
  readonly addressable: number;
  readonly perNaf: readonly MarketZoneCount[];
  readonly fetchedAt: string | null;
}

/** La configuration marché : zones ciblées + NAF ciblés + date du dernier rafraîchissement. */
export interface MarketConfigView {
  readonly zones: readonly MarketZoneView[];
  readonly nafCodes: readonly MarketNafCode[];
  readonly lastRefreshedAt: string | null;
}

/** Ajout d'une zone : un code postal français (5 chiffres). */
export const addMarketZonePayloadSchema = z.object({
  codePostal: z.string().regex(/^\d{5}$/u, "Code postal invalide (5 chiffres)"),
});
export type AddMarketZonePayload = z.infer<typeof addMarketZonePayloadSchema>;

/** Ajout d'un code NAF ciblé (ex. `56.10A` — Restauration traditionnelle). */
export const addMarketNafPayloadSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{2}\.?\d{0,2}[A-Z]?$/u, "Code NAF invalide (ex. 56.10A)"),
  label: z.string().trim().min(1).max(120),
});
export type AddMarketNafPayload = z.infer<typeof addMarketNafPayloadSchema>;

/**
 * **Adoption** d'une zone : `penetration` (0..1) = sociétés activées / acteurs visés ;
 * `deltaPts` = points de pourcentage gagnés **sur la période** (les activations récentes,
 * le dénominateur étant quasi constant).
 */
export interface AdoptionZoneView {
  readonly codePostal: string;
  readonly ville: string;
  readonly addressable: number;
  readonly activated: number;
  readonly penetration: number;
  readonly deltaPts: number;
  /** Sociétés **résiliées** (`terminated`) rattachées à la zone : la perte. */
  readonly lost: number;
  /**
   * **Taux de churn** BORNÉ 0..1 : `lost / (activated + lost)` = part de la base
   * onboardée dans la zone qui est repartie. (Rapporter au pool cumulerait sans plafond.)
   */
  readonly lostRate: number;
}

/**
 * Un point de la **part de marché dans le temps** : à la clôture de la semaine,
 * la pénétration cumulée (sociétés activées à ce jour / acteurs visés, 0..1) sur
 * l'ensemble du marché ciblé. C'est le « stock » qui monte derrière le flux
 * d'acquisition (graphe composé, cf. commercial-data-analytics.md §2.1).
 */
export interface PenetrationTrendPoint {
  readonly weekStart: string;
  readonly penetration: number;
}

/**
 * La **trajectoire d'une zone** : sa part de marché cumulée semaine par semaine.
 * La **pente** = la vélocité de conquête du territoire (§2.4). Une pente qui monte
 * = traction ; qui s'aplatit = saturation ou essoufflement.
 */
export interface ZonePenetrationTrend {
  readonly codePostal: string;
  readonly ville: string;
  readonly points: readonly PenetrationTrendPoint[];
}

/** Catégorie de départ d'un compte (churn), enregistrée à la clôture. */
export type TerminationReason =
  | "price"
  | "competitor"
  | "closure"
  | "quality"
  | "no_need"
  | "unresponsive"
  | "other";

/** Une **sous-raison** de départ (ex. « Livraison trop chère »), avec son compte. */
export interface TerminationSubReasonCount {
  readonly subReason: string;
  readonly label: string;
  readonly count: number;
  /**
   * Détail plus fin (3ᵉ anneau du sunburst) — ex. la catégorie produit sous
   * « Meilleur prix ailleurs ». Absent quand la sous-raison est une feuille.
   */
  readonly children?: readonly TerminationSubReasonCount[];
}

/**
 * Un nœud du **sunburst** des raisons : la catégorie de départ, son total de
 * résiliations confirmées, et le détail par **sous-raison** (anneau extérieur).
 */
export interface TerminationReasonNode {
  readonly reason: TerminationReason;
  readonly label: string;
  readonly count: number;
  readonly children: readonly TerminationSubReasonCount[];
}

/**
 * Taux de **rattrapage** d'une catégorie (ou global) : `rate` = `recovered` /
 * `attempts` (tentatives = rattrapées + confirmées), 0..1. `reason = "all"` = global.
 * Le rattrapage se **décompose par canal** : `recoveredAuto` (plateforme, incentive
 * automatique) + `recoveredSales` (sauvé par un commercial) = `recovered`.
 */
export interface TerminationRecovery {
  readonly reason: TerminationReason | "all";
  readonly label: string;
  readonly attempts: number;
  readonly recovered: number;
  /** Rattrapages **plateforme** (automatiques, sans main humaine). */
  readonly recoveredAuto: number;
  /** Rattrapages **commercial** (sauvés par un humain). */
  readonly recoveredSales: number;
  readonly rate: number;
}

/**
 * Un point de la **vélocité de rattrapage** : à la semaine de la tentative, le taux
 * de rattrapage (`recovered` / `attempts`). La **pente** dit si l'on réagit de mieux
 * en mieux au churn (efficacité de réaction dans le temps).
 */
export interface RecoveryTrendPoint {
  readonly weekStart: string;
  readonly attempts: number;
  readonly recovered: number;
  readonly rate: number;
}

/**
 * Résumé **boxplot** d'une distribution : la boîte (quartiles), les **moustaches**
 * de Tukey (1,5·IQR) et les points **aberrants** (hors moustaches).
 */
export interface BoxplotSummary {
  /** Moustache basse (plus petite valeur ≥ q1 − 1,5·IQR). */
  readonly low: number;
  readonly q1: number;
  readonly median: number;
  readonly q3: number;
  /** Moustache haute (plus grande valeur ≤ q3 + 1,5·IQR). */
  readonly high: number;
  /** Valeurs hors moustaches (outliers). */
  readonly outliers: readonly number[];
}

/**
 * **Délai de réaction au churn** par catégorie de départ : la distribution (en jours)
 * du temps entre la déclaration de résiliation et l'action qui l'a rattrapée. Boîte
 * basse = on sauve vite ; outlier haut = un sauvetage qui a traîné.
 */
export interface RecoveryReactionStat {
  readonly reason: TerminationReason;
  readonly label: string;
  readonly count: number;
  /** Délais en jours, résumé boxplot. */
  readonly box: BoxplotSummary;
}

/** Une case (semaine) d'une série de délai de réaction : sa boîte, ou `null` si vide. */
export interface RecoveryReactionCell {
  readonly weekStart: string;
  readonly count: number;
  readonly box: BoxplotSummary | null;
}

/**
 * Une **série** de délai de réaction : une catégorie de départ, une boîte par semaine
 * (alignées sur `weeks`). Rendues **groupées** côte à côte par semaine.
 */
export interface RecoveryReactionSeries {
  readonly reason: TerminationReason;
  readonly label: string;
  readonly cells: readonly RecoveryReactionCell[];
}

/**
 * **Délai de réaction hebdo × catégorie** : l'axe = les semaines, et pour chaque
 * semaine les catégories sont **groupées** (une boîte chacune). On lit la vitesse par
 * motif ET son évolution. Seules les catégories avec assez de rattrapages sont incluses.
 */
export interface RecoveryReactionByWeek {
  readonly weeks: readonly string[];
  readonly series: readonly RecoveryReactionSeries[];
}

/** Analytics de churn : raisons de résiliation + rattrapage des tentatives. */
export interface TerminationStatsView {
  /** Sunburst des **résiliations confirmées** : raison → sous-raison. */
  readonly reasons: readonly TerminationReasonNode[];
  /** Rattrapage global (toutes catégories). */
  readonly recovery: TerminationRecovery;
  /** Rattrapage **par catégorie** de terminaison. */
  readonly recoveryByReason: readonly TerminationRecovery[];
  /** **Vélocité de rattrapage** : le taux semaine par semaine (efficacité dans le temps). */
  readonly recoveryTrend: readonly RecoveryTrendPoint[];
  /** **Délai de réaction** (jours) par catégorie, all-time : boxplot tentative → rattrapage. */
  readonly reactionByReason: readonly RecoveryReactionStat[];
  /** **Délai de réaction hebdo × catégorie** : boîtes groupées par semaine. */
  readonly reactionByWeek: RecoveryReactionByWeek;
}

/** L'adoption par territoire, sur la fenêtre d'analyse. */
export interface MarketAdoptionView {
  readonly zones: readonly AdoptionZoneView[];
  /** Part de marché cumulée semaine par semaine (tout le marché ciblé). */
  readonly trend: readonly PenetrationTrendPoint[];
  /** La même trajectoire, mais **par zone** (une courbe par territoire) — vélocité §2.4. */
  readonly zoneTrends: readonly ZonePenetrationTrend[];
  readonly computedAt: string;
}
