import {
  CarriedDecisionClosedError,
  DecisionAlreadyCarriedError,
  DecisionNotOnReferenceError,
  RetroactiveCarryOverError,
} from "../pricing-errors.js";
import type { PriceScope } from "../price-rule.js";

/**
 * Les familles de décisions DATÉES qui se reportent sur la référence née d'un
 * détachement (`plan-report-apres-detachement.md`, § 2). Des valeurs de
 * donnée, alignées sur celles du lecteur de décisions. Le gabarit n'y est pas :
 * il ne se reporte pas, il s'édite (§ 2.2).
 */
export type CarriedFamily = "price_rule" | "price_floor" | "volume_ladder" | "volume_commitment";

/**
 * **D'où vient une décision reportée** — la même forme que l'origine d'un
 * avenant de mercuriale, avec l'identifiant de la décision d'origine.
 */
export interface DecisionOrigin {
  readonly kind: "detached";
  readonly fromSku: string;
  readonly fromDecisionId: string;
}

/** Le report demandé : de l'ancienne référence vers celle qui en est née. */
export interface DecisionCarry {
  readonly fromSku: string;
  readonly toSku: string;
}

/** La fenêtre d'une décision : borne basse incluse, haute exclue, `null` = sans fin. */
export interface CarriedWindow<To extends Date | null = Date | null> {
  readonly validFrom: Date;
  readonly validTo: To;
}

/** Les portées qui nomment une référence — les seules qu'un report connaisse. */
const REFERENCE_SCOPES: ReadonlySet<PriceScope["type"]> = new Set(["product", "variant"]);

/**
 * **La portée posée** : celle de l'ancienne, même type (`product` ou
 * `variant`), identifiant = la nouvelle référence (§ 1).
 *
 * @throws {DecisionNotOnReferenceError} la décision ne nomme pas l'ancienne
 *   référence — une décision de famille couvre déjà la nouvelle si elle y est.
 */
export function carriedScope(
  scope: PriceScope,
  decisionId: string,
  carry: DecisionCarry,
): PriceScope {
  if (!REFERENCE_SCOPES.has(scope.type) || scope.id !== carry.fromSku) {
    throw new DecisionNotOnReferenceError(decisionId, carry.fromSku);
  }
  return { type: scope.type, id: carry.toSku };
}

/**
 * **La fenêtre reportée** : `max(maintenant, début de l'ancienne)` → fin
 * réelle de l'ancienne (`null` si elle court sans fin) — § 1.
 *
 * @throws {CarriedDecisionClosedError} l'ancienne est archivée, ou sa fin est passée.
 * @throws {RetroactiveCarryOverError} la fenêtre commencerait avant maintenant.
 */
export function carriedWindow<To extends Date | null>(
  family: CarriedFamily,
  decisionId: string,
  source: CarriedWindow<To> & { readonly archivedAt: Date | null },
  now: Date,
): CarriedWindow<To> {
  const { validTo } = source;
  if (source.archivedAt !== null || (validTo !== null && validTo.getTime() <= now.getTime())) {
    throw new CarriedDecisionClosedError(family, decisionId);
  }
  const validFrom = source.validFrom.getTime() > now.getTime() ? source.validFrom : now;
  refuseRetroactive(validFrom, now);
  return { validFrom, validTo };
}

/**
 * **Jamais de `validFrom` passé** (§ 1) : une lecture datée d'hier ne doit pas
 * changer. Aucune porte ne le tient ; chaque fabrique `carriedFrom` passe ici.
 *
 * @throws {RetroactiveCarryOverError}
 */
export function refuseRetroactive(validFrom: Date, now: Date): void {
  if (validFrom.getTime() < now.getTime()) {
    throw new RetroactiveCarryOverError(validFrom);
  }
}

/** L'origine que la décision reportée portera. */
export function detachedOrigin(carry: DecisionCarry, fromDecisionId: string): DecisionOrigin {
  return { kind: "detached", fromSku: carry.fromSku, fromDecisionId };
}

/**
 * **Déjà reportée ?** — jugé par (ancien sku, nouveau sku, famille, audience),
 * jamais par l'identifiant d'origine (§ 3). `carriedAudiences` : les audiences
 * des décisions de la famille, debout sur la nouvelle référence, venues de
 * l'ancienne — lues sous verrou par l'appelant.
 *
 * @throws {DecisionAlreadyCarriedError}
 */
export function ensureNotYetCarried(
  family: CarriedFamily,
  carry: DecisionCarry,
  audience: string,
  carriedAudiences: readonly string[],
): void {
  if (carriedAudiences.includes(audience)) {
    throw new DecisionAlreadyCarriedError(family, carry.fromSku, carry.toSku);
  }
}

/** L'audience d'une règle ou d'un barème, en clé : `company:co_1`, `all:`. */
export function audienceKey(audience: {
  readonly type: string;
  readonly id: string | null;
}): string {
  return `${audience.type}:${audience.id ?? ""}`;
}

/**
 * **L'identité d'une règle pour « déjà reportée »** — celle de la contrainte
 * d'exclusion `price_rules_no_overlap` : étage, audience, seuil (la portée est
 * fixée par le report). Deux règles distinctes de l'ancienne référence se
 * reportent donc toutes deux (décision du 2026-10-30, § 9 du plan). Le barème
 * n'en a pas besoin : son exclusion ne porte que portée et audience.
 */
export function ruleCarryKey(rule: {
  readonly stage: string;
  readonly audience: { readonly type: string; readonly id: string | null };
  readonly minQuantity: number | null;
}): string {
  return `${rule.stage}|${audienceKey(rule.audience)}|${String(rule.minQuantity ?? 0)}`;
}
