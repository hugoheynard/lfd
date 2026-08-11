import { Injectable } from "@nestjs/common";

import { Clock } from "../../../infra/time/clock.js";
import { AccountAlertRepository } from "../../domain/ports/account-alert.repository.js";
import { AlertChannels } from "../../domain/ports/alert-channels.js";
import { EvaluatedOrderReader } from "../../domain/ports/evaluated-order.reader.js";
import { EvaluateBasket } from "./evaluate-basket.service.js";

/**
 * Évalue une commande **passée** contre les règles effectives de son compte, et
 * inscrit ce qui se déclenche au journal.
 *
 * L'évaluation elle-même — résolution des règles, historique, détecteurs — vit
 * dans `EvaluateBasket`, partagée avec le contrôle de panier. Ce service porte ce
 * qui n'appartient qu'à la commande passée : le journal, et les canaux.
 *
 * Deux portes en tête, dans cet ordre : pas de société → rien à surveiller ;
 * société non active → personne pour agir sur l'alerte.
 */
@Injectable()
export class EvaluateOrderAlerts {
  constructor(
    private readonly orders: EvaluatedOrderReader,
    private readonly basket: EvaluateBasket,
    private readonly journal: AccountAlertRepository,
    private readonly channels: AlertChannels,
    private readonly clock: Clock,
  ) {}

  async evaluate(orderId: string): Promise<void> {
    const order = await this.orders.read(orderId);
    // Une commande zéro friction n'appartient à aucun compte : ni historique
    // auquel la comparer, ni fiche où loger l'alerte. Une société non active n'a
    // pas d'habitudes à surveiller, et personne pour agir.
    if (order === null || order.companyId === null || !order.companyActive) {
      return;
    }

    const now = this.clock.now();
    const companyId = order.companyId;
    const { drafts, rules } = await this.basket.evaluate({
      companyId,
      lines: order.lines,
      excludeOrderId: order.id,
      now,
    });
    if (drafts.length === 0) {
      return;
    }

    // Le journal D'ABORD : il est inconditionnel, et c'est lui qui fait foi. Les
    // canaux ne sont que ce qu'on fait en plus — un e-mail perdu ne doit pas
    // emporter la trace.
    await this.journal.record(
      drafts.map((draft) => ({
        ...draft,
        companyId,
        orderId: order.id,
        orderNumber: order.orderNumber,
        occurredAt: now,
      })),
    );
    await this.channels.dispatch(drafts, rules, {
      companyId,
      companyName: order.companyName,
      orderNumber: order.orderNumber,
      occurredAt: now,
    });
  }
}
