import {
  CUSTOMER_CANCELLATION_REASON_CODES,
  CUSTOMER_CANCELLATION_STAGES,
  type CustomerCancellationReasonCode,
  type CustomerCancellationStage,
} from "@lfd/contracts";

import type { CancellingPrincipal } from "../ports/cancelling-member.reader.js";
import type { CancellationActorKind } from "../services/cancellation-actor.js";
import type {
  CancellationPolicyApplied,
  CancelledOrderRefund,
  CancelledOrderVoucher,
} from "./order-cancelled.event.js";

/**
 * **La relecture de la charge de `order.cancelled`**, champ par champ —
 * sortie de `order-cancelled.event.ts` pour le garder sous les 300 lignes
 * (lot A1.3). Chaque lecteur rend `undefined` pour une valeur hors forme, et
 * lit une clé ABSENTE (fait d'avant le lot qui l'a ajoutée) comme le dit son
 * JSDoc.
 */

/** Le principal d'un fait — `null` absent (fait d'avant C1), `undefined` hors forme. */
export function principalOf(raw: unknown): CancellingPrincipal | null | undefined {
  if (raw === undefined || raw === null) {
    return null;
  }
  if (typeof raw !== "object") {
    return undefined;
  }
  const companyId: unknown = Reflect.get(raw, "companyId");
  const name: unknown = Reflect.get(raw, "name");
  return typeof companyId === "string" && typeof name === "string"
    ? { companyId, name }
    : undefined;
}

export interface CancellationAuthorPayload {
  readonly kind: CancellationActorKind;
  readonly cancelledBy: string | null;
  readonly userId: string | null;
  readonly reason: string | null;
  readonly reasonCode: CustomerCancellationReasonCode | null;
  readonly policy: CancellationPolicyApplied | null;
}

/**
 * Qui a annulé, et pourquoi — `undefined` : hors forme. Sans `cancelledByKind`
 * (fait d'avant C6, S8) : l'équipe, avec sa fiche et son motif obligatoires.
 */
export function authorOf(
  payload: Readonly<Record<string, unknown>>,
  text: (key: string) => string | null,
): CancellationAuthorPayload | undefined {
  const rawKind = payload["cancelledByKind"];
  const kind = rawKind === undefined || rawKind === null ? "staff" : rawKind;
  const reasonCode = reasonCodeOf(payload["reasonCode"]);
  const policy = policyOf(payload["policy"]);
  if (reasonCode === undefined || policy === undefined) {
    return undefined;
  }
  const cancelledBy = text("cancelledBy");
  const reason = text("reason");
  if (kind === "staff") {
    return cancelledBy === null || reason === null
      ? undefined
      : { kind, cancelledBy, userId: null, reason, reasonCode, policy };
  }
  const userId = text("cancelledByUserId");
  if ((kind !== "customer" && kind !== "guest") || userId === null) {
    return undefined;
  }
  return { kind, cancelledBy: null, userId, reason, reasonCode, policy };
}

function reasonCodeOf(raw: unknown): CustomerCancellationReasonCode | null | undefined {
  if (raw === undefined || raw === null) {
    return null;
  }
  return CUSTOMER_CANCELLATION_REASON_CODES.find((code) => code === raw);
}

function policyOf(raw: unknown): CancellationPolicyApplied | null | undefined {
  if (raw === undefined || raw === null) {
    return null;
  }
  if (typeof raw !== "object") {
    return undefined;
  }
  const hours = "hoursBefore" in raw ? Reflect.get(raw, "hoursBefore") : undefined;
  return typeof hours === "number" && Number.isInteger(hours) && hours >= 0
    ? { hoursBefore: hours }
    : undefined;
}

/** `undefined` : hors forme. Une clé absente (fait d'avant C4) se lit `null`. */
export function refundOf(raw: unknown): CancelledOrderRefund | null | undefined {
  if (raw === null || raw === undefined) {
    return null;
  }
  if (typeof raw !== "object") {
    return undefined;
  }
  const announced = "announcedCents" in raw ? Reflect.get(raw, "announcedCents") : undefined;
  if (typeof announced !== "number" || !Number.isInteger(announced) || announced <= 0) {
    return undefined;
  }
  return { announcedCents: announced };
}

/** `undefined` : hors forme. */
export function voucherOf(raw: unknown): CancelledOrderVoucher | null | undefined {
  if (raw === null) {
    return null;
  }
  if (typeof raw !== "object" || raw === undefined) {
    return undefined;
  }
  const field = (key: string): unknown => (key in raw ? Reflect.get(raw, key) : undefined);
  const outcome = field("outcome");
  const value = field("voucherValueCents");
  const remainder = field("remainderValueCents");
  const expiresAt = field("expiresAt");
  if (
    (outcome !== "returned" && outcome !== "merged" && outcome !== "lapsed") ||
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    !(remainder === null || (typeof remainder === "number" && Number.isInteger(remainder))) ||
    typeof expiresAt !== "string"
  ) {
    return undefined;
  }
  const at = new Date(expiresAt);
  if (Number.isNaN(at.getTime())) {
    return undefined;
  }
  return { outcome, voucherValueCents: value, remainderValueCents: remainder, expiresAt: at };
}

/**
 * Plan A1 (lot A1.3) : la commande était-elle déjà inscrite ? Absent (fait
 * d'avant A1.3) : `false` — avant A1, une commande inscrite ne s'annulait pas.
 */
export function afterInscriptionOf(raw: unknown): boolean | undefined {
  if (raw === undefined || raw === null) {
    return false;
  }
  return typeof raw === "boolean" ? raw : undefined;
}

/**
 * Plan A1 (lot A1.3) : l'étape appliquée. Absente (fait d'avant A1.3) :
 * `production_plan`, la seule qui existait.
 */
export function stageAppliedOf(raw: unknown): CustomerCancellationStage | undefined {
  if (raw === undefined || raw === null) {
    return "production_plan";
  }
  return CUSTOMER_CANCELLATION_STAGES.find((stage) => stage === raw);
}
