import { Injectable, Logger } from "@nestjs/common";

import { IdGenerator } from "../../../../platform/id/id-generator.js";
import {
  ShortfallDecisionReader,
  type DecidedDeparture,
} from "../../../orders/domain/ports/shortfall-decision.reader.js";
import { AppError } from "../../../../platform/shared/errors/app-error.js";
import {
  alignmentOf,
  type DeliveryNoteAlignment,
  type FollowedOrder,
} from "../../domain/services/delivery-note-alignment.js";
import { departingSourceOf } from "../../domain/services/departing-source.js";
import { DecisionNoteNotFollowedError } from "../../domain/errors/delivery-note-errors.js";
import { DeliveryNoteRepository } from "../../domain/ports/delivery-note.repository.js";

/** Ce qu'un alignement a fait, après écriture. */
export type AlignedOutcome =
  | Exclude<DeliveryNoteAlignment, { change: "created" | "advanced" | "voided" | "completed" }>
  | { readonly change: "created" | "advanced" | "voided" | "completed" };

/**
 * **Fait dire la vérité au BL d'une commande** (plan
 * `documentation/commandes/plan-e2-rattrapage-des-bons.md`, § 8.2 et § 8.3) :
 * charge ses BL, applique la règle unique {@link alignmentOf}, écrit.
 *
 * Tourne dans l'unité de travail de l'appelant, la commande déjà verrouillée
 * (par l'`UPDATE` du geste, ou par le `FOR UPDATE` du réconciliateur).
 *
 * Une course perdue sur l'unicité `(order_id, rank)` n'est pas une erreur :
 * le BL que l'autre a écrit est relu, et avancé à son tour.
 */
@Injectable()
export class DeliveryNoteAligner {
  private readonly logger = new Logger(DeliveryNoteAligner.name);

  constructor(
    private readonly notes: DeliveryNoteRepository,
    private readonly ids: IdGenerator,
    private readonly decisions: ShortfallDecisionReader,
  ) {}

  /**
   * `strict` : le geste qui appelle NE PEUT PAS laisser le BL en arrière — la
   * décision d'un départ incomplet (E6b). Un refus du domaine remonte alors et
   * annule la transaction de l'appelant au lieu d'être compté.
   */
  async align(order: FollowedOrder, now: Date, strict = false): Promise<AlignedOutcome> {
    const outcome = await this.attempt(order, now, strict);
    if (outcome !== "rank_taken") {
      return outcome;
    }
    const retried = await this.attempt(order, now, strict);
    // Le rang pris l'est encore après relecture : il n'y a pas de seconde course possible.
    return retried === "rank_taken" ? { change: "none" } : retried;
  }

  private async attempt(
    order: FollowedOrder,
    now: Date,
    strict: boolean,
  ): Promise<AlignedOutcome | "rank_taken"> {
    const [notes, decided] = await Promise.all([
      this.notes.loadForOrders([order.orderId]),
      this.decisions.decidedFor([order.orderId]),
    ]);
    const decision = decided.get(order.orderId);
    const alignment = strict
      ? alignmentOf(departingSourceOf(order, decision), notes, {
          newId: () => this.ids.next(),
          now,
        })
      : this.decide(order, decision, notes, now);
    if (strict && alignment.change === "unrepairable") {
      throw new DecisionNoteNotFollowedError(order.orderNumber, alignment.reason);
    }
    switch (alignment.change) {
      case "none":
      case "unrepairable":
        return alignment;
      case "created":
        return (await this.notes.saveNew(alignment.created)) ? { change: "created" } : "rank_taken";
      default:
        for (const note of alignment.writes) {
          await this.notes.save(note);
        }
        return { change: alignment.change };
    }
  }

  /**
   * La règle, gardée : un refus du domaine (ligne invalide, jour mal formé)
   * tombe avant toute écriture, et devient un écart compté plutôt qu'une
   * erreur qui annulerait le geste de la commande (plan E2, § 8.2).
   */
  private decide(
    order: FollowedOrder,
    decision: DecidedDeparture | undefined,
    notes: Parameters<typeof alignmentOf>[1],
    now: Date,
  ): DeliveryNoteAlignment {
    try {
      // La décision d'abord (E6b, plan E6 § 13) : le BL suit ce qui part.
      const source = departingSourceOf(order, decision);
      return alignmentOf(source, notes, { newId: () => this.ids.next(), now });
    } catch (error) {
      if (!(error instanceof AppError)) {
        throw error;
      }
      return { change: "unrepairable", reason: "invalid_source" };
    }
  }

  /** Un écart que personne ne répare : écrit, jamais avalé (plan E2, § 8.2). */
  report(order: FollowedOrder, outcome: AlignedOutcome): void {
    if (outcome.change === "unrepairable") {
      this.logger.warn(
        `Bon de livraison non aligné sur la commande ${order.orderNumber} (${order.orderId}, ` +
          `statut ${order.status}) : ${outcome.reason}. Rien n'a été inventé ; à reprendre à la main.`,
      );
    }
  }
}
