import { ACCOUNT_FACTS } from "../../account/domain/events/account-facts.js";

/**
 * Contrat du **journal d'événements** (module croissance). C'est le point de
 * découplage : `growth/` ne consomme QUE ce contrat, jamais les tables/agrégats
 * de `orders`/`account`/`subscriptions`. Event **streaming** (analytique/audit),
 * pas event sourcing — on ne reconstruit jamais l'état métier depuis le journal.
 */

/**
 * Sujet d'un événement — la chose qu'il concerne.
 *
 * Un `string`, et non une union. C'en était une, et elle a fini par être ce
 * qu'elle prétendait interdire : une **seconde** liste de sujets, tenue à jour
 * à la main, en face de celles qui décident vraiment (`PIM_EVENTS` et
 * `ACCOUNT_FACTS`, chez leurs émetteurs). Aucun lecteur ne s'en servait — ni
 * filtre, ni contrat d'API — donc elle ne protégeait rien qu'un émetteur ne
 * sache déjà, et elle obligeait à un transtypage à la frontière : le pire
 * échange possible, une garantie de façade contre un `as`.
 *
 * Les sujets écrits aujourd'hui : `user`, `company`, `lead` (comptes et
 * croissance), `vat_rate`, `product`, `product_category`, `location`
 * (référentiel). La colonne est un `String` : en ouvrir un ne coûte pas de
 * migration.
 */
export type ActivitySubjectType = string;

/**
 * Nature de l'acteur — **le type du `RequestContext`, pas une copie**.
 *
 * Il était recopié ici (`"customer" | "staff" | "system"`), et le commentaire le
 * disait sans en tirer la conséquence : deux unions identiques que rien ne
 * reliait. Or `platform` est le socle, tout bloc a le droit d'en dépendre —
 * cette copie ne protégeait donc aucune frontière, elle n'offrait qu'une
 * occasion de diverger.
 */
import type { ActorType } from "../../../platform/context/request-context.js";

export type ActivityActorType = ActorType;

/**
 * Types d'événements **source** connus (Phase 0). Volontairement des constantes
 * (pas une union fermée au bord du port) : ajouter un type ne touche pas le
 * recorder — les émetteurs référencent ces clés plutôt que des chaînes magiques.
 */
export const ACTIVITY_TYPES = {
  userRegistered: "user.registered",
  orderPlaced: "order.placed",
  /**
   * Les faits des **comptes clients** sont repris de chez leur émetteur
   * (`ACCOUNT_FACTS`), ils ne sont plus redéclarés ici. Ils y étaient nés du
   * temps où `growth` était le seul à les écrire ; depuis que les handlers des
   * comptes inscrivent eux-mêmes leurs actes, deux listes en face l'une de
   * l'autre ne pouvaient que diverger — et la divergence se serait vue à la
   * lecture, sur un filtre qui ne trouve plus rien.
   */
  companyDeclared: ACCOUNT_FACTS.companyDeclared,
  companyStepReached: ACCOUNT_FACTS.companyStepReached,
  companyActivated: ACCOUNT_FACTS.companyActivated,
  kbisCertified: ACCOUNT_FACTS.kbisCertified,
  kbisRevoked: ACCOUNT_FACTS.kbisRevoked,
  subscriptionCreated: "subscription.created",
  /**
   * Reco **affichée** au staff dans le cockpit. Écrit en lecture (best-effort) —
   * on **capture d'abord** pour brancher la boucle fermée en Phase 2 (chaîne
   * `reco.shown → action → outcome`), on exploitera ensuite. Idempotent par
   * (sujet, fenêtre de recompute) : rouvrir le cockpit ne le recompte pas.
   */
  recoShown: "reco.shown",
  /** Lead cold **saisi** par un commercial (démarchage sortant). */
  leadCaptured: "lead.captured",
  /** Changement d'étape d'un lead dans le pipeline. */
  leadStageChanged: "lead.stage_changed",
  /** Lead **converti** (manuel après RDV, ou rapprochement à l'inscription). */
  leadConverted: "lead.converted",
  /** Lead **perdu** (démarchage sans suite). */
  leadLost: "lead.lost",
  /** Rendez-vous **réservé** par le client sur un créneau ouvert. */
  appointmentRequested: "appointment.requested",
  /** Rendez-vous **confirmé** par le commercial (ou posé directement par lui). */
  appointmentConfirmed: "appointment.confirmed",
  /** Rendez-vous **annulé**, par l'une ou l'autre partie (porte un motif). */
  appointmentCancelled: "appointment.cancelled",
  /**
   * Rendez-vous **honoré**. Avec `appointment.no_show`, c'est le premier
   * `outcome` réel de la chaîne `reco.shown → action → outcome` (Phase 2) : la
   * boucle fermée se boucle ici sans travail supplémentaire.
   */
  appointmentHonored: "appointment.honored",
  /** Rendez-vous **manqué** (le client ne s'est pas présenté). */
  appointmentNoShow: "appointment.no_show",
  /** Demande de contact **déposée** par le client (chemin non daté). */
  supportRequested: "support.requested",
  /** Demande de contact **traitée** par le staff — c'est ce qui la sort de la file. */
  supportHandled: "support.handled",
} as const;

/** L'événement à journaliser pour chaque transition de rendez-vous. */
export const APPOINTMENT_TRANSITION_TYPES: Record<string, string> = {
  confirmed: ACTIVITY_TYPES.appointmentConfirmed,
  cancelled: ACTIVITY_TYPES.appointmentCancelled,
  honored: ACTIVITY_TYPES.appointmentHonored,
  no_show: ACTIVITY_TYPES.appointmentNoShow,
};

/**
 * Ce qu'un **émetteur** fournit pour journaliser un fait. Le reste (id ULID,
 * `traceId`, `actorType`, `recordedAt`) est **dérivé du contexte de requête** par
 * le recorder — l'appelant ne s'en occupe pas.
 */
export interface RecordActivityInput {
  /** Type de l'événement, ex. `order.placed` (cf. `ACTIVITY_TYPES`). */
  readonly type: string;
  readonly subjectType: ActivitySubjectType;
  readonly subjectId: string;
  /** Établissement rattaché, si connu (rempli plus tard par l'identity resolution). */
  readonly establishmentId?: string | null;
  /**
   * Clé d'idempotence **métier**, quand l'émetteur en connaît une : une émission
   * rejouée porte la même clé, donc la même ligne, donc rien de neuf. C'est le
   * cas des faits qui se déduisent d'un objet durable — `order.placed:<id>`,
   * `company.step_reached:<étape>:<société>` : les rejouer ne doit jamais
   * recompter.
   *
   * **Absente**, elle se dérive du `traceId` de la requête (cf.
   * {@link buildActivityEventRow}). C'est le bon défaut pour un fait qui n'a pas
   * d'identité propre — deux corrections successives d'un même taux sont deux
   * faits, et elles arrivent par deux requêtes.
   *
   * Elle ne se calcule surtout PAS chez l'appelant à partir du contexte : la
   * dérivation vivait en double, ici et dans l'adaptateur du journal de la
   * plateforme, avec deux replis différents hors requête — l'un rendait une
   * constante, l'autre une trace neuve. Deux faits distincts d'un script ou
   * d'un seed portaient alors la MÊME clé et le second disparaissait en
   * silence, pendant que sa ligne aurait affiché une trace à elle. Une seule
   * dérivation, au seul endroit qui connaît la trace réellement écrite.
   */
  readonly idempotencyKey?: string;
  /** Charge utile typée par `type` (montants en CENTIMES entiers, jamais de float). */
  readonly payload: Record<string, unknown>;
  /** Temps **métier** de l'événement. Défaut = l'instant du `Clock`. */
  readonly occurredAt?: Date;
  /** Version du payload (défaut 1) — le payload évolue, on versionne. */
  readonly schemaVersion?: number;
}

/** Ce que le recorder dérive du contexte pour compléter une ligne de journal. */
export interface ResolvedActivityContext {
  readonly id: string;
  readonly now: Date;
  readonly traceId: string;
  readonly actorType: ActivityActorType;
  /** Le `sub` staff ou l'id client — `null` pour `system` (cron, boot). */
  readonly actorId: string | null;
  /**
   * Instantané du nom au moment de l'acte, `null` quand l'annuaire ne connaît
   * pas l'acteur. Figé et non résolu à la lecture : un journal dit ce qui était
   * vrai ce jour-là, et l'annuaire staff vit d'ailleurs dans une autre base —
   * le rejoindre à chaque affichage coûterait une requête par ligne.
   */
  readonly actorName: string | null;
  /**
   * La **fonction** de l'acteur, figée avec son nom et pour la même raison :
   * « qui a fait ça, et à quel titre » est une question qu'on pose au journal
   * bien après que la personne a changé de rôle. `null` pour un client ou un
   * acteur inconnu.
   */
  readonly actorRole: string | null;
}

/** Ligne de journal prête à persister (avant l'écriture Prisma). */
export interface ActivityEventRow {
  readonly id: string;
  readonly type: string;
  readonly schemaVersion: number;
  readonly occurredAt: Date;
  readonly subjectType: ActivitySubjectType;
  readonly subjectId: string;
  readonly establishmentId: string | null;
  readonly actorType: ActivityActorType;
  readonly actorId: string | null;
  readonly actorName: string | null;
  readonly actorRole: string | null;
  readonly traceId: string;
  readonly idempotencyKey: string;
  readonly payload: Record<string, unknown>;
}

/**
 * Assemble la ligne de journal à partir de l'entrée de l'émetteur et du contexte
 * résolu. **Pure et déterministe** (testable sans I/O) : applique les défauts
 * (`occurredAt` ← `now`, `schemaVersion` ← 1, `establishmentId` ← null).
 */
export function buildActivityEventRow(
  input: RecordActivityInput,
  context: ResolvedActivityContext,
): ActivityEventRow {
  return {
    id: context.id,
    type: input.type,
    schemaVersion: input.schemaVersion ?? 1,
    occurredAt: input.occurredAt ?? context.now,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    establishmentId: input.establishmentId ?? null,
    actorId: context.actorId,
    actorName: context.actorName,
    actorRole: context.actorRole,
    actorType: context.actorType,
    traceId: context.traceId,
    // La MÊME trace que la colonne, jamais une lue ailleurs : c'est ce qui
    // interdit qu'une clé prétende « même geste » là où la ligne dit « autre
    // trace ».
    idempotencyKey: input.idempotencyKey ?? `${input.type}:${input.subjectId}:${context.traceId}`,
    payload: input.payload,
  };
}
