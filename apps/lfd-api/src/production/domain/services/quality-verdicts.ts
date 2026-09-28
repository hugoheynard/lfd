import type { QualityCheck } from "../entities/quality-check.js";
import type { ServiceDay } from "../value-objects/service-day.value-object.js";
import { qualityTargetKey } from "../value-objects/quality-check-target.js";

/**
 * **Lire les contrôles** — verdict courant, péremption, retenue
 * (`documentation/production/plan-controle-qualite.md`, D2, D4, D5, D6).
 *
 * Des fonctions pures : le contrôle est append-only, donc tout ce qu'on en dit
 * se DÉRIVE de la liste des verdicts rendus. Rien n'est stocké qui pourrait
 * diverger de cette liste.
 */

/**
 * Le plus récent l'emporte (D2). À instant égal, l'`id` départage : c'est un
 * ULID fourni par l'écran, donc triable par le temps de sa fabrication.
 */
function isMoreRecent(candidate: QualityCheck, current: QualityCheck): boolean {
  const delta = candidate.checkedAt.getTime() - current.checkedAt.getTime();
  return delta !== 0 ? delta > 0 : candidate.id > current.id;
}

/** Le verdict courant de chaque cible, indexé par `qualityTargetKey`. */
export function currentChecks(checks: readonly QualityCheck[]): ReadonlyMap<string, QualityCheck> {
  const current = new Map<string, QualityCheck>();
  for (const check of checks) {
    const key = qualityTargetKey(check.target);
    const held = current.get(key);
    if (held === undefined || isMoreRecent(check, held)) {
      current.set(key, check);
    }
  }
  return current;
}

/**
 * Un contrôle de ligne est **à revoir** quand le compte a changé depuis (D5).
 *
 * ⚠️ « À revoir » ne lève rien : un blocage périmé RESTE bloquant — la retenue
 * ({@link heldOrderIds}) ne lit pas cette fonction, et c'est voulu. Un contrôle
 * de commande ne se périme jamais : il n'a pas de quantité.
 */
export function isStale(check: QualityCheck, currentQuantity: number): boolean {
  return check.target.kind === "line" && check.target.quantitySeen !== currentQuantity;
}

/** Une ligne du plan : la commande et le SKU du compte qu'elle porte. */
export interface PlannedOrderLine {
  readonly orderId: string;
  readonly sku: string;
}

/**
 * Les commandes **retenues au retrait** pour une journée (D4, D6).
 *
 * Retenue = verdict courant `blocking` sur la commande, OU sur un SKU qu'une de
 * ses lignes du PLAN porte. La source est le plan et lui seul : une commande
 * hors plan n'est retenue que par un blocage qui la nomme (D6, assumé).
 *
 * Aucune connaissance du retrait : une commande déjà partie peut figurer dans
 * le résultat, et c'est `handoverBlocker` qui dit « déjà retirée » avant (D4).
 * Les contrôles d'une autre journée sont ignorés.
 */
export function heldOrderIds(
  serviceDay: ServiceDay,
  checks: readonly QualityCheck[],
  plan: readonly PlannedOrderLine[],
): ReadonlySet<string> {
  const ofTheDay = checks.filter((check) => check.serviceDay.equals(serviceDay));
  const held = new Set<string>();
  const blockedSkus = new Set<string>();
  for (const check of currentChecks(ofTheDay).values()) {
    if (!check.isBlocking) {
      continue;
    }
    if (check.target.kind === "order") {
      held.add(check.target.orderId);
    } else {
      blockedSkus.add(check.target.sku);
    }
  }
  for (const line of plan) {
    if (blockedSkus.has(line.sku)) {
      held.add(line.orderId);
    }
  }
  return held;
}
