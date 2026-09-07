import { EventsHandler, type IEventHandler } from "@nestjs/cqrs";
import { CommandBus } from "@nestjs/cqrs";

import { BackgroundWork } from "../../../../platform/events/background-work.js";
import { OrderPackedEvent } from "../../../../production/channels/commerce/index.js";
import { MarkOrderReadyCommand } from "../commands/mark-order-ready.command.js";

/**
 * **Le commerce apprend qu'un bac est fait**, et en tire son propre statut.
 *
 * ## Pourquoi il passe par la COMMANDE, et pas par le dépôt
 *
 * `MarkOrderReadyCommand` porte déjà tout ce que le commerce sait de cette
 * transition : la garde d'état (`packingBlocker`), l'arbitrage de course, et la
 * publication d'`OrderReadyEvent` — que le journal et le courriel « votre
 * commande est prête » écoutent. L'appeler garde ces trois-là intacts ; appeler
 * le dépôt directement les aurait tous les trois contournés en silence.
 *
 * Ce qui change n'est donc pas ce que le commerce fait, c'est **qui le
 * déclenche** : le fournil, par un fait, et non plus une route hébergée chez le
 * commerce sous un chemin `admin/production`.
 *
 * ## Ce que ce couplage coûte
 *
 * ⚠️ Le bus vit en processus. Un `packingBlocker` qui refuse — commande annulée,
 * déjà remise — laisse la production avec un bac déclaré et le commerce en
 * arrière. Ça ne peut PAS arriver aujourd'hui : rien n'annule une commande, et
 * une remise avant colisage est déjà refusée par l'agrégat de production. Le
 * jour où l'annulation existera, elle devra se propager jusqu'au fournil —
 * sinon il colise pour rien, ce qui est le vrai problème, pas la divergence.
 *
 * `BackgroundWork.track` est obligatoire (`lint:events-tracked`) : un `void`
 * promesse mourrait en silence.
 */
@EventsHandler(OrderPackedEvent)
export class OnOrderPacked implements IEventHandler<OrderPackedEvent> {
  constructor(
    private readonly commands: CommandBus,
    private readonly work: BackgroundWork,
  ) {}

  handle(event: OrderPackedEvent): void {
    void this.work.track(this.run(event), "on-order-packed");
  }

  private async run(event: OrderPackedEvent): Promise<void> {
    // L'identité et l'instant viennent du FAIT, pas de l'horloge d'ici : le
    // colisage a eu lieu au fournil, et c'est cette heure-là qui compte.
    await this.commands.execute(
      new MarkOrderReadyCommand(event.reference, event.packedBy, event.packedAt),
    );
  }
}
