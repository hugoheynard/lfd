import type { RevisionActor } from "../../domain/entities/order-revision.js";
import type { OrderContent } from "../services/order-content.js";

/**
 * **Ce que la commande modifiée coûterait** (plan
 * `documentation/commandes/plan-modifier-une-commande.md`, M1, §6) — sans
 * rien écrire. Le même mur et la même recomposition que la modification :
 * un devis qui ne prédit pas la modification ne sert à rien.
 */
export class QuoteOrderRevisionQuery {
  constructor(
    readonly orderId: string,
    readonly actor: RevisionActor,
    readonly content: OrderContent,
  ) {}
}
