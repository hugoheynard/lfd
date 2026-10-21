import {
  decideOrderCutoff,
  decideOrderLimit,
  type OrderCutoffDecision,
  type OrderCutoffView,
  type OrderLimitSpec,
} from "@lfd/contracts";

import { OrderCutoffGraceError, PastOrderCutoffError } from "../errors/order-errors.js";

/** Une ligne du panier et la limite que le référentiel lui donne, s'il en donne une. */
export interface LineOrderLimit {
  readonly sku: string;
  /** La limite déclarée pour CET article, ou `null` — il n'en a pas. */
  readonly limit: OrderLimitSpec | null;
}

/** Du plus permissif au plus fermé — l'ordre dans lequel une décision l'emporte. */
const SEVERITY: Readonly<Record<OrderCutoffDecision["status"], number>> = {
  open: 0,
  grace: 1,
  closed: 2,
};

/**
 * **Refuse une commande arrivée trop tard**, et distingue les deux façons de
 * l'être.
 *
 * Fonction pure, hors de tout handler : c'est une règle métier, et elle vaut
 * pour les deux portes d'entrée — le client qui commande seul et l'équipe qui
 * saisit pour lui. La décision elle-même vit dans `@lfd/contracts`, parce que la
 * boutique devra montrer la même limite qu'on oppose ici.
 *
 * ## Deux sources, une seule décision
 *
 * Depuis le fil v6, chaque article peut porter **sa** limite, résolue par le
 * référentiel sur l'échelle `global → famille → produit → déclinaison`.
 *
 * 🔴 **La plus stricte gagne TOUJOURS** (Hugo, 2026-10-21). Pour chaque ligne,
 * la décision est la plus fermée entre la limite de l'article (s'il en porte
 * une) et la règle du commerce en vigueur pour ce jour et ce point. Un article
 * ne RELÂCHE jamais la règle générale ; il ne peut que la resserrer. Jusqu'à
 * cette date, la limite de l'article REMPLAÇAIT la règle — une limite posée au
 * rang global du référentiel aurait neutralisé l'heure limite du commerce.
 *
 * Quand l'heure limite générale est désactivée, le lecteur des règles en
 * vigueur n'en rend aucune : la règle du commerce n'oppose rien, et seule la
 * limite de l'article compte.
 *
 * **Seule la règle du commerce a une grâce** (Hugo, 2026-10-21) : une limite
 * d'article ferme sèchement à son heure, quoi que porte la ligne. On compare
 * des DÉCISIONS, pas des heures : `closed` l'emporte sur `grace`, qui
 * l'emporte sur `open`. Un article plus tôt que la règle, passé son heure,
 * refuse donc sec même pendant la grâce de la règle — prêter à l'un la grâce
 * de l'autre rouvrirait ce qu'il ferme. (Jusqu'à cette date, chaque limite
 * gardait sa propre grâce.)
 *
 * ## Le panier ferme quand sa ligne la plus urgente ferme
 *
 * On prend la décision **la plus sévère** parmi les lignes. Un panier ne se
 * découpe pas : accepter les lignes encore ouvertes et refuser les autres
 * demanderait de savoir quoi faire d'une commande amputée, et personne ne l'a
 * décidé. C'est au lot 8 (la boutique) de le dire ligne par ligne AVANT la
 * validation, pas au serveur de trancher après.
 *
 * ## La dérogation est le SEUL chemin de sortie
 *
 * ⚠️ **Le back-office n'est plus exempté.** Il l'a été, faute de mécanisme :
 * l'équipe au téléphone était l'autorité qui déroge, sans motif, sans auteur et
 * sans trace — rien ne distinguait une décision d'un oubli. Elle passe désormais
 * par une dérogation comme tout le monde, et cette dérogation-là porte un nom,
 * une raison et une date.
 *
 * 🔴 **Une dérogation n'ouvre que la GRÂCE.** Elle n'est consultée que dans cet
 * état : après le rattrapage, personne ne passe, dérogation ou pas. La borne
 * n'est pas vérifiée ici, elle est **inexprimable** — il n'y a pas de branche
 * qui pourrait la franchir.
 *
 * ## Ce qui n'est PAS refusé
 *
 * **Aucune limite nulle part** : tout passe. Une plateforme qui n'a rien réglé
 * ne doit pas refuser au nom d'une limite que personne n'a posée.
 *
 * @returns l'identifiant de la dérogation **utilisée**, ou `null`. Un `ensure*`
 * qui rend une valeur détonne, et c'est assumé : cette fonction est la seule à
 * savoir si l'autorisation a été dépensée, et la redemander ailleurs voudrait
 * dire rejouer toute la décision — donc pouvoir en obtenir une autre.
 * @throws {OrderCutoffGraceError} la limite est passée, le rattrapage court, et
 * aucune dérogation ne couvre cette journée.
 * @throws {PastOrderCutoffError} la limite ET le rattrapage sont passés.
 */
export function ensureWithinOrderCutoff(input: {
  readonly lines: readonly LineOrderLimit[];
  /** Les règles du commerce EN VIGUEUR (aucune si l'interrupteur est coupé), opposées à toutes les lignes. */
  readonly fallback: readonly OrderCutoffView[];
  readonly fulfillmentDate: string;
  /** La dérogation ouverte de ce client pour cette journée, ou `null`. */
  readonly waiver: { readonly id: string } | null;
  readonly now: Date;
}): string | null {
  const decision = strictestOf(input);
  if (decision.status === "open") {
    return null;
  }
  if (decision.status === "grace" && decision.graceEnd !== null) {
    if (input.waiver !== null) {
      return input.waiver.id;
    }
    throw new OrderCutoffGraceError(input.fulfillmentDate, decision.graceEnd);
  }
  throw new PastOrderCutoffError(input.fulfillmentDate);
}

/**
 * La décision la plus fermée : la règle du commerce, puis chaque limite
 * d'article. La règle vaut pour toutes les lignes, donc « la plus fermée par
 * ligne, puis la plus fermée du panier » revient à la plus fermée de
 * l'ensemble — calculée une fois. Un panier vide n'a rien à opposer : il sera
 * refusé ailleurs, et pas pour l'heure.
 */
function strictestOf(input: {
  readonly lines: readonly LineOrderLimit[];
  readonly fallback: readonly OrderCutoffView[];
  readonly fulfillmentDate: string;
  readonly now: Date;
}): OrderCutoffDecision {
  if (input.lines.length === 0) {
    return { status: "open", rule: null, limit: null, graceEnd: null };
  }
  const commerce = decideOrderCutoff(input.fallback, input.fulfillmentDate, input.now);
  let strictest: OrderCutoffDecision = commerce;
  for (const line of input.lines) {
    strictest = stricterOf(
      strictest,
      // Une limite d'article n'a JAMAIS de grâce (Hugo, 2026-10-21, point 2 de
      // `limites-de-commande/schema-des-reglages.md`) : passée l'heure, refus
      // sec. Forcée ici aussi, parce qu'une grâce déjà rangée sur un article
      // (`CatalogItem.orderLimitGraceMinutes`) ne se rafraîchit qu'au prochain
      // fait de règles.
      decideOrderLimit(withoutGrace(line.limit), input.fulfillmentDate, input.now),
    );
  }
  return strictest;
}

/**
 * La plus fermée de deux décisions, chacune avec sa grâce. À état égal en
 * grâce, celle dont la grâce se ferme la première : c'est elle qui refusera.
 */
function stricterOf(a: OrderCutoffDecision, b: OrderCutoffDecision): OrderCutoffDecision {
  if (SEVERITY[b.status] !== SEVERITY[a.status]) {
    return SEVERITY[b.status] > SEVERITY[a.status] ? b : a;
  }
  if (a.status === "grace" && a.graceEnd !== null && b.graceEnd !== null) {
    return b.graceEnd.getTime() < a.graceEnd.getTime() ? b : a;
  }
  return a;
}

/** La limite d'un article, rattrapage retiré : seule la règle du commerce en a un. */
function withoutGrace(limit: OrderLimitSpec | null): OrderLimitSpec | null {
  return limit === null ? null : { ...limit, graceMinutes: 0 };
}
