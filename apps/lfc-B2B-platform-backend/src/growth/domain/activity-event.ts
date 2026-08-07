/**
 * Contrat du **journal d'événements** (module croissance). C'est le point de
 * découplage : `growth/` ne consomme QUE ce contrat, jamais les tables/agrégats
 * de `orders`/`account`/`subscriptions`. Event **streaming** (analytique/audit),
 * pas event sourcing — on ne reconstruit jamais l'état métier depuis le journal.
 */

/** Sujet d'un événement — la chose qu'il concerne. */
export type ActivitySubjectType = "user" | "company" | "lead";

/** Nature de l'acteur, recopiée du `RequestContext` (`actor.type`). */
export type ActivityActorType = "customer" | "staff" | "system";

/**
 * Types d'événements **source** connus (Phase 0). Volontairement des constantes
 * (pas une union fermée au bord du port) : ajouter un type ne touche pas le
 * recorder — les émetteurs référencent ces clés plutôt que des chaînes magiques.
 */
export const ACTIVITY_TYPES = {
  userRegistered: "user.registered",
  orderPlaced: "order.placed",
  companyDeclared: "company.declared",
  companyStepReached: "company.step_reached",
  companyActivated: "company.activated",
  subscriptionCreated: "subscription.created",
  /**
   * Reco **affichée** au staff dans le cockpit. Écrit en lecture (best-effort) —
   * on **capture d'abord** pour brancher la boucle fermée en Phase 2 (chaîne
   * `reco.shown → action → outcome`), on exploitera ensuite. Idempotent par
   * (sujet, fenêtre de recompute) : rouvrir le cockpit ne le recompte pas.
   */
  recoShown: "reco.shown",
} as const;

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
  /** Clé d'idempotence (ex. `order.placed:<id>`) : une émission rejouée est ignorée. */
  readonly idempotencyKey: string;
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
    actorType: context.actorType,
    traceId: context.traceId,
    idempotencyKey: input.idempotencyKey,
    payload: input.payload,
  };
}
