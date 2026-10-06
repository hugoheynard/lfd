import type { ProductionPlanClosure } from "@lfd/contracts";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { DurablePublisher } from "../../../platform/outbox/durable-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import {
  DayOrdersReader,
  type ProducibleOrder,
} from "../../channels/commerce/day-orders.reader.js";
import { PendingSettlementSweeper } from "../../channels/commerce/pending-settlement.sweeper.js";
import { ProductionDayClosedEvent } from "../../channels/commerce/production-day-closed.event.js";
import type { ProductionDay } from "../../domain/entities/production-day.js";
import { ProductionDayClosedJournalEvent } from "../../domain/events/production-day.events.js";
import { ProductionDayLock } from "../../domain/ports/production-day.lock.js";
import { ProductionDayRepository } from "../../domain/ports/production-day.repository.js";
import { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";
import { packingListFactsOf } from "../services/packing-list-facts.js";
import { CloseProductionDayCommand } from "./close-production-day.command.js";

/**
 * **La clôture du plan du soir** — le moment où une journée bascule.
 *
 * ## Ce que ce handler fait, et ce qu'il ne fait PAS
 *
 * Il verrouille la journée, la RECHARGE sous le verrou, lui demande de se
 * clore, l'écrit, et **publie** — tout dans une unité de travail (lot A0 du
 * plan `production/plan-arret-du-plan.md`, B1, 2026-10-06 : jusque-là le
 * chargement se faisait hors verrou, et deux clôtures concurrentes fermaient
 * toutes les deux). Le balayage et la lecture des commandes du commerce
 * restent AVANT le verrou : pas d'appel d'un autre bloc sous un verrou tenu. Il
 * n'écrit rien chez le commerce : `confirmed` est un fait du commerce, tiré du
 * nôtre par un abonné qui vit chez lui. Chaque contexte n'écrit que ses tables.
 *
 * ## Balayer d'abord, compter ensuite (depuis le 2026-09-26)
 *
 * Avant tout, il DEMANDE au commerce de trancher les règlements restés en l'air
 * pour la journée — `PendingSettlementSweeper`, un port que le fournil déclare
 * et que le commerce implémente (plan
 * `documentation/order/plan-abandon-du-reglement.md`, Q1, B1). C'est le
 * commerce qui écrit, dans ses tables ; le fournil n'en connaît que la
 * question. Sans ce geste, une journée où aucune carte n'est payée resterait
 * vide, donc inarrêtable, donc ses règlements vivraient pour toujours.
 *
 * Le balayage tourne à **chaque** appel, réannonce comprise (S4) : une
 * commande passée après la première clôture doit mourir aussi. Le refus
 * « journée vide » vient APRÈS lui, et ne dit plus que la vérité : personne
 * n'a payé.
 *
 * ## Pourquoi une commande, alors que le dossier dit « pas un clic »
 *
 * ⚠️ Inflexion de conception héritée de la version précédente, et elle vaut
 * toujours. Le dossier du cycle de vie écrit que `confirmed` est automatique.
 * Les deux façons d'y arriver sans geste humain sont fermées : l'API n'a aucun
 * planificateur, et une écriture sur la lecture du lot est interdite — « une
 * requête de lecture n'écrit rien, pas même un compteur ».
 *
 * Reste le geste que l'équipe fait déjà : arrêter de prendre pour demain. Ce que
 * le dossier refuse est une décision **par commande** ; une bascule **par
 * journée** n'demande à personne de juger — elle acte une heure, pas un tri.
 *
 * ## La réannonce, et pourquoi elle n'est pas un « close » de plus
 *
 * Rejouer la clôture ne recalcule RIEN : l'agrégat refuse, parce que le compte à
 * produire est un instantané et que les commandes bougent après. Mais le fait
 * est **republié**, sous une clé neuve — cf. `ProductionDayClosedEvent`.
 *
 * Jusqu'au 2026-10-04, le fait vivait en mémoire, « ni persisté ni rejoué », et
 * la réannonce était LE rattrapage d'un abonné qui avait échoué. Il est durable
 * depuis (plan `journalisation/plan-boite-d-envoi.md`, BE3 bâti en premier) :
 * la boîte d'envoi reprend un abonné qui échoue, et la réannonce n'est plus que
 * le filet — celui qui fait apprendre au commerce les commandes d'un retirage.
 *
 * La réponse dit laquelle des deux choses vient d'arriver, plutôt que de rendre
 * deux fois le même nombre sans dire pourquoi.
 *
 * ## Le journal et la boîte d'envoi, dans la MÊME transaction
 *
 * La clôture écrit `production_day.closed` au journal et `production.day_closed`
 * dans la boîte d'envoi, dans l'unité de travail qui tient le verrou et où
 * `save` écrit : les trois, ou aucun. La réannonce n'écrit AUCUN fait au
 * journal — un second « arrêtée » mentirait sur l'heure et l'auteur — mais
 * publie dans une unité de travail, sous le même verrou.
 *
 * L'abonné du commerce ne tourne plus dans le contexte de cette transaction :
 * le relais le livre après la validation, dans SA propre unité de travail.
 *
 * ## La liste à coliser (colisage, K1 — 2026-10-04)
 *
 * Dans la même unité de travail, un `production.packing_list_drawn` par
 * commande de l'instantané (plan `colisage/colisage.md`, §11, B1).
 * La réannonce les republie : même clé par commande, la boîte d'envoi absorbe
 * (§13, MINEURS).
 *
 * ## Qui colisera (K2 — 2026-10-04)
 *
 * Toute journée arrêtée par ce binaire naît au colisage (`packing_owner =
 * packing`, §13 B1) : Hugo a tranché « on bascule direct », sans
 * interrupteur. La réannonce ne change rien au propriétaire ; une journée
 * arrêtée avant le déploiement garde `legacy` et finit sur l'ancien poste.
 */
@CommandHandler(CloseProductionDayCommand)
export class CloseProductionDayHandler implements ICommandHandler<
  CloseProductionDayCommand,
  ProductionPlanClosure
> {
  constructor(
    private readonly days: ProductionDayRepository,
    private readonly orders: DayOrdersReader,
    private readonly settlements: PendingSettlementSweeper,
    private readonly events: DomainEventPublisher,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
    private readonly durable: DurablePublisher,
    private readonly lock: ProductionDayLock,
  ) {}

  async execute(command: CloseProductionDayCommand): Promise<ProductionPlanClosure> {
    const day = ServiceDay.of(command.serviceDay);
    // AVANT le chargement et avant la branche de réannonce : le balayage vaut
    // pour chaque appel, et une journée déjà close n'en est pas dispensée (S4).
    // Hors du verrou : c'est un appel au commerce, qui écrit chez lui.
    await this.settlements.sweep(day);

    // Lecture HORS verrou, qui ne sert qu'à épargner la question au commerce
    // quand la journée est déjà close. Elle ne décide jamais d'une clôture :
    // la décision se reprend sous le verrou, sur la journée relue.
    if ((await this.days.load(day)).isClosed) {
      return this.reannounce(day);
    }
    // Les commandes du commerce sont lues AVANT le verrou, comme au retirage :
    // pas de lecture d'un autre bloc sous un verrou tenu.
    const producible = await this.orders.producibleFor(day);
    return this.closeUnderLock(day, producible);
  }

  /**
   * Verrouille, RECHARGE, puis décide (lot A0, 2026-10-06). Chargée hors
   * verrou, deux clôtures concurrentes fermaient toutes les deux : deux
   * instantanés, deux `production_day.closed`, deux faits « frais ». La
   * seconde trouve désormais la journée close et réannonce.
   */
  private async closeUnderLock(
    day: ServiceDay,
    producible: readonly ProducibleOrder[],
  ): Promise<ProductionPlanClosure> {
    return this.uow.run(async () => {
      await this.lock.lock(day);
      const current = await this.days.load(day);
      if (current.isClosed) {
        return this.republish(day, current);
      }
      const now = this.clock.now();
      current.close(producible, now);
      await this.days.save(current);
      await this.events.publishTraced(
        new ProductionDayClosedJournalEvent(day.value, current.orders.length),
      );
      await this.durable.publish(this.factOf(day, current, now, null).durableFact());
      await this.publishPackingList(day, current, now);
      return this.report(day, now, current.orders.length, false);
    });
  }

  /**
   * Republie le fait sur une journée déjà close, sans rien recalculer. Sous le
   * verrou, sur la journée relue : un retirage concurrent ne fait pas
   * republier un instantané d'avant lui. Une journée close ne se rouvre pas —
   * aucune méthode de l'agrégat n'efface `closedAt` (vérifié le 2026-10-06).
   */
  private async reannounce(day: ServiceDay): Promise<ProductionPlanClosure> {
    return this.uow.run(async () => {
      await this.lock.lock(day);
      return this.republish(day, await this.days.load(day));
    });
  }

  /** À appeler DANS l'unité de travail : la boîte d'envoi refuse d'écrire hors d'elle. */
  private async republish(day: ServiceDay, current: ProductionDay): Promise<ProductionPlanClosure> {
    // `closedAt` ne peut pas être nul ici — l'agrégat l'était déjà. On le traite
    // quand même plutôt que de l'affirmer : un `!` dirait au compilateur de se
    // taire sur la seule chose qu'il sait.
    const now = this.clock.now();
    const at = current.closedAt ?? now;
    await this.durable.publish(this.factOf(day, current, at, now).durableFact());
    await this.publishPackingList(day, current, at);
    return this.report(day, at, current.orders.length, true);
  }

  /** Une commande, un fait — l'instant est celui du tirage d'origine. */
  private async publishPackingList(
    day: ServiceDay,
    current: ProductionDay,
    drawnAt: Date,
  ): Promise<void> {
    for (const fact of packingListFactsOf(day, current.orders, drawnAt)) {
      await this.durable.publish(fact.durableFact());
    }
  }

  /** L'instant est celui du SNAPSHOT, jamais celui du rejeu. */
  private factOf(
    day: ServiceDay,
    current: ProductionDay,
    closedAt: Date,
    reannouncedAt: Date | null,
  ): ProductionDayClosedEvent {
    const orderIds = current.orders.map((order) => order.orderId);
    return new ProductionDayClosedEvent(day.value, closedAt, orderIds, reannouncedAt);
  }

  private report(
    day: ServiceDay,
    closedAt: Date,
    orderCount: number,
    alreadyClosed: boolean,
  ): ProductionPlanClosure {
    return {
      date: day.value,
      absorbed: orderCount,
      alreadyClosed,
      closedAt: closedAt.toISOString(),
    };
  }
}
