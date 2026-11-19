import {
  decideOrderCutoff,
  decideOrderLimit,
  resolveOrderCutoff,
  type LateFeeAdjustment,
  type OrderCutoffDecision,
  type OrderCutoffStatus,
  type OrderCutoffView,
  type OrderLimitSpec,
} from "@lfd/contracts";

import type {
  DeadlineSource,
  LineVerdict,
  OrderDeadlineVerdict,
  WaiverAvailable,
} from "./order-deadline-verdict.js";

/** Un article du panier et la limite que le référentiel lui donne, s'il en donne une. */
export interface DeadlineLine {
  readonly sku: string;
  readonly limit: OrderLimitSpec | null;
}

/** Ce que le juge reçoit, déjà lu : il ne lit rien lui-même. */
export interface DeadlineFacts {
  readonly lines: readonly DeadlineLine[];
  /** Les règles du commerce en vigueur ; seule la générale compte. */
  readonly generalRules: readonly OrderCutoffView[];
  readonly serviceDay: string;
  /** L'instant de la décision. */
  readonly at: Date;
  /** La dérogation ouverte de la société pour cette journée, si la question la considère. */
  readonly waiver: WaiverAvailable | null;
}

/** Une décision et ce qui l'a retenue. */
interface Sourced {
  readonly decision: OrderCutoffDecision;
  readonly source: DeadlineSource;
}

/** Du plus permissif au plus fermé — l'ordre dans lequel une décision l'emporte. */
const SEVERITY: Readonly<Record<OrderCutoffStatus, number>> = {
  open: 0,
  grace: 1,
  closed: 2,
};

/**
 * **Juge un panier contre l'heure limite.** Pur : sans port, sans horloge.
 *
 * 🔴 **La plus stricte gagne toujours** (Hugo, 2026-10-21). Chaque ligne est
 * jugée par la plus fermée entre la règle générale du commerce et sa propre
 * limite ; le panier, par la plus fermée de ses lignes. Une limite d'article
 * ne relâche jamais la règle générale.
 *
 * **Seule la règle générale a un rattrapage** : une limite d'article ferme
 * sèchement à son heure, même si une grâce est encore rangée sur l'article.
 *
 * **Un panier ne se découpe pas** : la plus fermée de ses lignes décide pour
 * tout le panier. Un panier vide n'oppose rien ; il est refusé ailleurs, et
 * pas pour l'heure.
 *
 * **Aucune limite nulle part : tout passe.** Une plateforme qui n'a rien
 * réglé ne refuse pas au nom d'une limite que personne n'a posée.
 *
 * La dérogation n'est retenue que dans le rattrapage — le type ne la porte
 * que là. La surtaxe s'y ajoute par {@link priceLateness}, une fois son
 * réglage lu : le juge ne le lit pas, pour qu'une commande à l'heure ne le
 * fasse pas lire.
 */
export function judgeOrderDeadline(facts: DeadlineFacts): OrderDeadlineVerdict {
  const general = generalDecision(facts);
  const lines = new Map<string, LineVerdict>();
  let strictest: Sourced = facts.lines.length === 0 ? NOTHING_SOURCED : general;
  for (const line of facts.lines) {
    const own = itemDecision(line.limit, facts);
    strictest = stricterOf(strictest, own);
    const judged = stricterOf(general, own);
    lines.set(line.sku, {
      status: judged.decision.status,
      source: judged.source,
      limit: judged.decision.limit,
    });
  }
  return verdictOf(strictest, lines, facts.waiver);
}

/**
 * **La règle générale seule, rattrapage compris** — la question de la relance
 * de règlement : un client dans son rattrapage n'a pas payé à l'heure. Sans
 * règle, ou sur une heure qui n'existe pas ce jour-là : `open`.
 */
export function generalRuleStatus(
  generalRules: readonly OrderCutoffView[],
  serviceDay: string,
  at: Date,
): OrderCutoffStatus {
  return decideOrderCutoff(generalRules, serviceDay, at).status;
}

/**
 * La surtaxe d'un verdict en rattrapage dont une dérogation ferait passer.
 * Sans dérogation, ou sans réglage, rien : rattraper sans facturer est un
 * choix valable, et inventer un montant facturerait une décision que personne
 * n'a prise.
 */
export function priceLateness(
  verdict: OrderDeadlineVerdict,
  setting: LateFeeAdjustment | null,
): OrderDeadlineVerdict {
  if (verdict.kind !== "grace" || verdict.waiver === null || setting === null) {
    return verdict;
  }
  return { ...verdict, lateFee: setting };
}

/** Une décision qui n'oppose rien. */
const NOTHING: OrderCutoffDecision = { status: "open", rule: null, limit: null, graceEnd: null };
const NOTHING_SOURCED: Sourced = { decision: NOTHING, source: "none" };

function generalDecision(facts: DeadlineFacts): Sourced {
  const decision = decideOrderCutoff(facts.generalRules, facts.serviceDay, facts.at);
  return {
    decision,
    source: resolveOrderCutoff(facts.generalRules) === null ? "none" : "general_rule",
  };
}

function itemDecision(limit: OrderLimitSpec | null, facts: DeadlineFacts): Sourced {
  if (limit === null) {
    return NOTHING_SOURCED;
  }
  // Une limite d'article n'a JAMAIS de rattrapage (Hugo, 2026-10-21) : forcé
  // ici, parce qu'une grâce encore rangée sur l'article ne se rafraîchit
  // qu'au prochain fait de règles.
  const decision = decideOrderLimit({ ...limit, graceMinutes: 0 }, facts.serviceDay, facts.at);
  return { decision, source: decision.limit === null ? "none" : "item_limit" };
}

/**
 * La plus fermée de deux décisions. À état égal en rattrapage, celle dont la
 * fin tombe la première : c'est elle qui refusera. À égalité ouverte, celle
 * dont la limite tombe la première (une limite `null` n'oppose rien) : c'est
 * l'heure que l'avis annonce. Sinon, la première gardée.
 */
function stricterOf(a: Sourced, b: Sourced): Sourced {
  const [da, db] = [a.decision, b.decision];
  if (SEVERITY[db.status] !== SEVERITY[da.status]) {
    return SEVERITY[db.status] > SEVERITY[da.status] ? b : a;
  }
  if (da.status === "grace" && da.graceEnd !== null && db.graceEnd !== null) {
    return db.graceEnd.getTime() < da.graceEnd.getTime() ? b : a;
  }
  if (da.status === "open" && db.limit !== null) {
    return da.limit === null || db.limit.getTime() < da.limit.getTime() ? b : a;
  }
  return a;
}

function verdictOf(
  retained: Sourced,
  lines: ReadonlyMap<string, LineVerdict>,
  waiver: WaiverAvailable | null,
): OrderDeadlineVerdict {
  const bounds = {
    limit: retained.decision.limit,
    graceEnd: retained.decision.graceEnd,
    source: retained.source,
    lines,
  };
  switch (retained.decision.status) {
    case "open":
      return { kind: "open", ...bounds };
    case "grace":
      return {
        kind: "grace",
        // Une dérogation n'ouvre qu'un rattrapage qui a une fin : celui que la
        // règle générale accorde.
        waiver: retained.decision.graceEnd === null ? null : waiver,
        lateFee: null,
        ...bounds,
      };
    case "closed":
      return { kind: "closed", ...bounds };
  }
}
