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
 * référentiel sur l'échelle `global → famille → produit → déclinaison`. Un
 * article qui en porte une l'oppose ; un article qui n'en porte pas retombe sur
 * la règle du commerce (`OrderCutoff`).
 *
 * 🔴 **L'article ne peut pas RELÂCHER la règle du commerce, il la remplace.**
 * C'est un choix, et il se discutera : un article sans limite propre suit le
 * commerce, un article qui en a une décide seul. Le mélange — prendre le plus
 * contraignant des deux — aurait rendu impossible de déclarer un article
 * commandable plus tard que le reste, ce qui est précisément l'usage du rang
 * `produit`.
 *
 * ## Le panier ferme quand sa ligne la plus urgente ferme
 *
 * On prend la décision **la plus sévère** parmi les lignes. Un panier ne se
 * découpe pas : accepter les lignes encore ouvertes et refuser les autres
 * demanderait de savoir quoi faire d'une commande amputée, et personne ne l'a
 * décidé. C'est au lot 8 (la boutique) de le dire ligne par ligne AVANT la
 * validation, pas au serveur de trancher après.
 *
 * ## Ce qui n'est PAS refusé, et pourquoi
 *
 * - **Aucune limite nulle part** : tout passe. Une plateforme qui n'a rien réglé
 *   ne doit pas refuser au nom d'une limite que personne n'a posée.
 * - **Une saisie du back-office** (`placedByStaffId` non nul). Le membre de
 *   l'équipe au téléphone EST l'autorité qui déroge : tant que la dérogation
 *   n'est pas un objet en propre, lui opposer la limite retirerait au personnel
 *   une capacité qu'il a aujourd'hui, sans rien lui donner en échange.
 *
 * 🔴 **Cette exemption est datée.** Elle tombe avec le lot 6 de
 * `documentation/b2b/architecture-heure-limite-de-commande.md` : la dérogation
 * deviendra alors le seul chemin de sortie, et elle ne pourra ouvrir que DANS la
 * grâce.
 *
 * @throws {OrderCutoffGraceError} la limite est passée, le rattrapage court.
 * @throws {PastOrderCutoffError} la limite ET le rattrapage sont passés.
 */
export function ensureWithinOrderCutoff(input: {
  readonly lines: readonly LineOrderLimit[];
  /** Les règles du commerce, opposées aux articles qui n'ont pas la leur. */
  readonly fallback: readonly OrderCutoffView[];
  readonly pickupAddressId: string | null;
  readonly fulfillmentDate: string;
  readonly placedByStaffId: string | null;
  readonly now: Date;
}): void {
  if (input.placedByStaffId !== null) {
    return;
  }
  const decision = strictestOf(input);
  if (decision.status === "open") {
    return;
  }
  if (decision.status === "grace" && decision.graceEnd !== null) {
    throw new OrderCutoffGraceError(input.fulfillmentDate, decision.graceEnd);
  }
  throw new PastOrderCutoffError(input.fulfillmentDate);
}

/**
 * La décision la plus fermée parmi les lignes.
 *
 * Le repli du commerce est calculé **une seule fois**, et paresseusement : c'est
 * une résolution complète, et un panier de vingt lignes dont aucune ne porte de
 * limite la referait vingt fois pour le même résultat. Un panier vide n'a rien à
 * opposer — il sera refusé ailleurs, et pas pour l'heure.
 */
function strictestOf(input: {
  readonly lines: readonly LineOrderLimit[];
  readonly fallback: readonly OrderCutoffView[];
  readonly pickupAddressId: string | null;
  readonly fulfillmentDate: string;
  readonly now: Date;
}): OrderCutoffDecision {
  let fromCommerce: OrderCutoffDecision | null = null;
  const commerce = (): OrderCutoffDecision => {
    fromCommerce ??= decideOrderCutoff(
      input.fallback,
      input.pickupAddressId,
      input.fulfillmentDate,
      input.now,
    );
    return fromCommerce;
  };

  let strictest: OrderCutoffDecision = { status: "open", rule: null, limit: null, graceEnd: null };
  for (const line of input.lines) {
    const decision =
      line.limit === null
        ? commerce()
        : decideOrderLimit(line.limit, input.fulfillmentDate, input.now);
    if (SEVERITY[decision.status] > SEVERITY[strictest.status]) {
      strictest = decision;
    }
  }
  return strictest;
}
