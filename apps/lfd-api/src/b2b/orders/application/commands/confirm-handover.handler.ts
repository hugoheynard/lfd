import type { OrderHandoverView } from "@lfd/contracts";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import {
  HandoverRefusedError,
  HandoverTokenNotFoundError,
} from "../../domain/errors/order-errors.js";
import { OrderReader } from "../../domain/ports/order.reader.js";
import { OrderRepository } from "../../domain/ports/order.repository.js";
import { handoverBlocker } from "../../domain/services/handover.js";
import { toHandoverView } from "../queries/get-handover.handler.js";
import { ConfirmHandoverCommand } from "./confirm-handover.command.js";

/**
 * La **remise** : lire, juger, graver — et rendre l'attestation obtenue.
 *
 * Cette commande rend une vue, contrairement à l'usage (une commande ne rend
 * qu'un identifiant). C'est assumé : le comptoir doit afficher immédiatement
 * *qui a remis, et quand*, sans un second aller-retour dans la seconde où le
 * client attend son sac. Rendre le résultat de la mutation n'est pas ici un
 * modèle de lecture déguisé — c'est l'accusé de réception de l'écriture.
 *
 * **La première transition de statut du système.** Rien d'autre n'avait jamais
 * fait avancer une commande au-delà de `placed` ; c'est le scan qui écrit
 * `fulfilled`, et c'est cohérent : la remise est le seul moment où quelqu'un
 * constate physiquement quelque chose.
 */
@CommandHandler(ConfirmHandoverCommand)
export class ConfirmHandoverHandler implements ICommandHandler<
  ConfirmHandoverCommand,
  OrderHandoverView
> {
  constructor(
    private readonly orders: OrderReader,
    private readonly repository: OrderRepository,
    private readonly clock: Clock,
  ) {}

  async execute(command: ConfirmHandoverCommand): Promise<OrderHandoverView> {
    const order = await this.orders.findByHandoverToken(command.token);
    if (order === null) {
      throw new HandoverTokenNotFoundError();
    }
    const blocker = handoverBlocker(order);
    if (blocker !== null) {
      throw new HandoverRefusedError(blocker);
    }

    const at = this.clock.now();
    const won = await this.repository.markHandedOver(command.token, at, command.staffSubject);
    if (!won) {
      // Perdu la course : un autre poste a scanné le même QR entre notre lecture
      // et notre écriture. On ne réécrit rien — on renvoie l'attestation de
      // l'autre, seule vraie, plutôt que d'inventer la nôtre.
      throw new HandoverRefusedError("Cette commande vient d'être remise à un autre poste.");
    }

    return toHandoverView({
      ...order,
      status: "fulfilled",
      handedOverAt: at,
      handedOverBy: command.staffSubject,
    });
  }
}
