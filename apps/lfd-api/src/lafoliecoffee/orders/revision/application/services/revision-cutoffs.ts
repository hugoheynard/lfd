import { Injectable } from "@nestjs/common";

import type { Instant } from "../../../../../platform/context/request-context.js";
import {
  OrderDeadline,
  type OrderDeadlineAsker,
  type OrderDeadlineVerdict,
} from "../../../../order-cutoffs/index.js";
import { ItemLimitOverrideReader } from "../../../domain/ports/item-limit-override.reader.js";
import { admitWithinDeadline } from "../../../domain/services/admit-within-deadline.js";
import type { OrderContent } from "../../../application/services/order-content.js";
import type { RevisableOrder } from "../../domain/entities/order-revision.js";
import {
  NO_STAFF_ITEM_LIMITS,
  raisedSkus,
  settledSkusOn,
  staffItemLimitsOf,
  staffJudgedSkus,
  type StaffItemLimits,
} from "../../domain/services/revision-item-limits.js";

/**
 * La limite d'article en clientèle `pro`, comme la passation, et aucune
 * dérogation — une modification ne crée ni ne retire de surtaxe (R4).
 */
/**
 * La question d'une modification. Le plancher d'un dépassement y est « une
 * limite générale ce jour-là », sans plus : l'heure limite générale n'est pas
 * opposée à l'équipe en modification — sa fenêtre est l'inscription au fournil
 * (`standingOf`). Le client ne passe jamais outre : le plancher ne le concerne pas.
 */
function revisionAsker(exceedItemLimits: boolean): OrderDeadlineAsker {
  return {
    audience: "pro",
    companyId: null,
    waiver: "ignore",
    exceedItemLimits,
    itemLimitFloor: "general_rule_posed",
  };
}

/**
 * **L'heure limite d'une modification** (plan
 * `documentation/limites-de-commande/passer-outre-la-limite-d-un-produit.md`,
 * § 3.6) — les trois endroits qui jugent une modification la demandent ici :
 * le geste et son devis, la révisabilité, la borne de paiement d'une hausse.
 *
 * - **Le client** : l'heure limite de l'ancienne date ET de la nouvelle, sur
 *   les articles des deux compositions. Une limite d'article déjà passée par
 *   l'équipe et consignée pour cette journée n'y juge plus : la ligne
 *   dépassée ne fige pas la commande. L'augmenter se juge comme un ajout.
 * - **L'équipe** : la règle générale ne lui est pas opposée ; la limite
 *   d'article l'est, sur les seules lignes ajoutées ou augmentées, et sur la
 *   nouvelle journée. Avec la case du produit et le droit, elle la dépasse.
 */
@Injectable()
export class RevisionCutoffs {
  constructor(
    private readonly deadline: OrderDeadline,
    private readonly overrides: ItemLimitOverrideReader,
  ) {}

  /**
   * Le client : l'heure limite de l'ancienne date ET de la nouvelle, sur les
   * articles des deux compositions, les limites consignées écartées.
   *
   * @throws {OrderCutoffGraceError} dans un rattrapage.
   * @throws {PastOrderCutoffError} limite passée.
   */
  async ensureCustomerBefore(
    order: RevisableOrder,
    content: OrderContent,
    decidedAt: Instant,
  ): Promise<void> {
    const raised = raisedSkus(order.lines, content.lines);
    const consigned = await this.overrides.forOrder(order.orderId);
    for (const day of new Set([order.serviceDay, content.requestedDeliveryDate])) {
      if (day !== null) {
        const verdict = await this.deadline.verdict({
          skus: skusOf(order, content),
          serviceDay: day,
          at: decidedAt,
          asker: revisionAsker(false),
          settledItemLimits: [...settledSkusOn(day, consigned, raised)],
        });
        admitWithinDeadline(verdict, day);
      }
    }
  }

  /**
   * L'équipe : la limite d'article des lignes ajoutées ou augmentées — de
   * toutes, quand la journée change —, sur la nouvelle journée ; la règle
   * générale ne lui est pas opposée. Rend les lignes que leur limite ferme et
   * celles qu'elle dépasse, sans refuser : le devis les annonce, la
   * modification refuse (`admitStaffItemLimits`).
   *
   * `exceedItemLimits` : le droit `lfc_product_limit_override`, lu au
   * contrôleur.
   */
  async staffItemLimits(
    order: RevisableOrder,
    content: OrderContent,
    judged: { readonly decidedAt: Instant; readonly exceedItemLimits: boolean },
  ): Promise<StaffItemLimits> {
    const day = content.requestedDeliveryDate;
    const submitted = staffJudgedSkus(
      { serviceDay: order.serviceDay, lines: order.lines },
      { serviceDay: day, lines: content.lines },
    );
    if (day === null || submitted.length === 0) {
      return NO_STAFF_ITEM_LIMITS;
    }
    const verdict = await this.deadline.verdict({
      skus: submitted,
      serviceDay: day,
      at: judged.decidedAt,
      asker: revisionAsker(judged.exceedItemLimits),
    });
    return staffItemLimitsOf(verdict);
  }

  /**
   * Le verdict de la date actuelle, pour la révisabilité du client : ses
   * articles, les limites consignées écartées.
   */
  async currentDay(order: RevisableOrder, day: string, at: Date): Promise<OrderDeadlineVerdict> {
    const consigned = await this.overrides.forOrder(order.orderId);
    return this.deadline.verdict({
      skus: order.lines.map((line) => line.sku),
      serviceDay: day,
      at,
      asker: revisionAsker(false),
      settledItemLimits: [...settledSkusOn(day, consigned, [])],
    });
  }

  /**
   * L'heure limite qui borne le délai de paiement d'une hausse (Q1) : la plus
   * proche de l'ancienne et de la nouvelle journée, sur les articles des deux
   * compositions — celles que la modification du client a passées, limites
   * consignées écartées : sans quoi la limite déjà passée deviendrait le
   * minimum, et la hausse naîtrait échue.
   */
  async paymentCutoff(
    order: RevisableOrder,
    content: OrderContent,
    at: Date,
  ): Promise<Date | null> {
    const raised = raisedSkus(order.lines, content.lines);
    const consigned = await this.overrides.forOrder(order.orderId);
    const days = [...new Set([order.serviceDay, content.requestedDeliveryDate])].filter(
      (day): day is string => day !== null,
    );
    const verdicts = await Promise.all(
      days.map((day) =>
        this.deadline.verdict({
          skus: skusOf(order, content),
          serviceDay: day,
          at,
          asker: revisionAsker(false),
          settledItemLimits: [...settledSkusOn(day, consigned, raised)],
        }),
      ),
    );
    // La limite retenue, quel que soit l'état de la journée : une journée en
    // rattrapage ou fermée borne aussi le délai.
    const times = verdicts.flatMap((verdict) =>
      verdict.limit === null ? [] : [verdict.limit.getTime()],
    );
    return times.length === 0 ? null : new Date(Math.min(...times));
  }
}

/** Les articles des deux compositions, sans doublon. */
function skusOf(order: RevisableOrder, content: OrderContent): readonly string[] {
  return [...new Set([...order.lines.map((line) => line.sku), ...content.lines.map((l) => l.sku)])];
}
