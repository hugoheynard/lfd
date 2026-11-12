import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { SUBSCRIPTION_CREATED } from "../../../account/domain/events/site-gesture.fact.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { ArticleSaleUnits } from "../../../catalog/application/article-sale-units.service.js";
import { SaleOperations } from "../../../catalog/application/sale-operations.service.js";
import { ReservedArticleGuard } from "../../../catalog/application/reserved-article-guard.service.js";
import { OperationOnlyInSubscriptionError } from "../../domain/errors/subscription-errors.js";
import { Subscription } from "../../domain/entities/subscription.js";
import { SubscriptionCreatedEvent } from "../../domain/events/subscription-created.event.js";
import {
  type CreatedSubscription,
  SubscriptionRepository,
} from "../../domain/ports/subscription.repository.js";
import { IsoDate } from "../../domain/value-objects/iso-date.js";
import { SubscriptionLine } from "../../domain/value-objects/subscription-line.js";
import { SubscriptionGestures } from "../services/subscription-gestures.js";
import { CreateSubscriptionCommand } from "./create-subscription.command.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import {
  type IntentCodec,
  OncePerIntent,
  readIntentString,
} from "../../../../platform/intent/once-per-intent.js";
import { customerIntentActor } from "../../../../lafoliecoffee/shared/intent/customer-intent-actor.js";

/** Ce que la création rend, gardé et relu au rejeu : l'identifiant du panier. */
const CREATED_SUBSCRIPTION_REPLAY: IntentCodec<CreatedSubscription> = {
  write: (created) => ({ id: created.id }),
  read: (record, gesture) => ({ id: readIntentString(record, "id", gesture) }),
};

/** Le nom stable du geste, dans le registre des intentions. */
const CREATE_SUBSCRIPTION_GESTURE = "subscriptions.create";

/**
 * Ouvre un panier récurrent. On construit l'**agrégat** (`Subscription.open`) qui
 * porte les invariants — au moins une ligne, acheminement cohérent (livraison ⇒
 * adresse, retrait ⇒ pas d'adresse), fin postérieure au début — puis on le confie
 * au port. Aucun prix ici : le gabarit ne facture rien tant que le planificateur
 * ne le déclenche pas.
 *
 * `@sans-journal` le fait existe déjà, et il n'a qu'un seul auteur AU
 * JOURNAL : `subscription.created`, écrit par l'abonné de la croissance sur la
 * PERSONNE, que le score des leads lit sous cette forme — même motif que
 * `CreateCompanyHandler`. Il reste best-effort, comme les faits de commande
 * (plan du journal, lot 1 ; décidé le 2026-09-19). Depuis N4e (2026-10-20),
 * un fait DURABLE du même nom part aussi, dans la transaction de la création,
 * pour l'avis au principal : il vit dans la boîte d'envoi, un autre registre,
 * et n'écrit rien au journal — un lead n'est jamais compté deux fois.
 *
 * La société est celle de l'espace (`companyId`) : le panier la porte pour
 * toujours. L'id est tiré par la base, donc le fait durable est écrit APRÈS
 * la création, dans la même unité de travail.
 *
 * **Une fois par intention** : la clé de l'écran est réclamée avant
 * l'écriture et scellée dans sa transaction ; un double envoi rend le panier
 * déjà créé, sans second panier ni second avis. L'acteur est le client
 * (`customer:<id>`).
 *
 * @throws {GestureInFlightError} la même clé est encore en vol.
 * @throws {IntentKeyReusedError} la clé a servi pour un autre envoi.
 */
@CommandHandler(CreateSubscriptionCommand)
export class CreateSubscriptionHandler implements ICommandHandler<
  CreateSubscriptionCommand,
  CreatedSubscription
> {
  constructor(
    private readonly subscriptions: SubscriptionRepository,
    private readonly events: DomainEventPublisher,
    private readonly sale: SaleOperations,
    private readonly uow: UnitOfWork,
    private readonly gestures: SubscriptionGestures,
    private readonly saleUnits: ArticleSaleUnits,
    private readonly reserved: ReservedArticleGuard,
    private readonly intents: OncePerIntent,
  ) {}

  /**
   * @throws {OperationOnlyInSubscriptionError} une ligne ne se vend que pendant une opération.
   * @throws {WeightArticleInSubscriptionError} une ligne se vend au poids.
   * @throws {SubscriptionSiteMembershipLostError} la société visée n'est pas celle de l'acteur.
   * @throws {ReservedArticleRefusedError} une ligne vise un article réservé à un autre compte.
   */
  execute(command: CreateSubscriptionCommand): Promise<CreatedSubscription> {
    return this.intents.runSealed(
      {
        actorId: customerIntentActor(command.actorUserId),
        key: command.intentKey,
        gesture: CREATE_SUBSCRIPTION_GESTURE,
        subject: intentSubject(command.companyId ?? "personal", command.payload),
      },
      CREATED_SUBSCRIPTION_REPLAY,
      (seal) => this.create(command, seal),
    );
  }

  private async create(
    command: CreateSubscriptionCommand,
    seal: (created: CreatedSubscription) => Promise<void>,
  ): Promise<CreatedSubscription> {
    const { payload } = command;
    // Avant l'agrégat : la règle dépend du catalogue, que l'abonnement ne lit
    // nulle part ailleurs (D6 du plan des opérations datées).
    const bound = await this.sale.operationOnlyAmong(payload.lines.map((line) => line.sku));
    if (bound.length > 0) {
      throw new OperationOnlyInSubscriptionError(bound);
    }
    // Les articles au poids, que la ligne refuse (`vente-au-poids.md`, P3).
    const weightSold = await this.saleUnits.weightSoldAmong(payload.lines.map((line) => line.sku));
    // Hors requête (semis), rien n'a confronté la société aux rattachements.
    await this.gestures.ensureMember(command.companyId, command.actorUserId);
    // Le mur des articles réservés (`plan-articles-sur-mesure.md`, § 6).
    await this.reserved.ensureOpenTo(
      command.companyId,
      payload.lines.map((line) => line.sku),
    );
    const subscription = Subscription.open({
      placedByUserId: command.actorUserId,
      companyId: command.companyId,
      fromOrderId: payload.fromOrderId,
      recurrence: payload.recurrence,
      startDate: IsoDate.fromString(payload.startDate),
      endDate: payload.endDate === null ? null : IsoDate.fromString(payload.endDate),
      routing: {
        method: payload.fulfillmentMethod,
        deliveryAddress: payload.deliveryAddress,
        pickupAddressId: payload.pickupAddressId,
      },
      note: payload.note,
      lines: payload.lines.map((line) =>
        SubscriptionLine.requested(
          line.sku,
          line.quantity,
          weightSold.has(line.sku) ? "weight" : "piece",
        ),
      ),
    });
    const created = await this.uow.run(async () => {
      const written = await this.subscriptions.create(subscription);
      await this.gestures.announce({
        type: SUBSCRIPTION_CREATED,
        subscription,
        subscriptionId: written.id,
        actorUserId: command.actorUserId,
      });
      await seal(written);
      return written;
    });
    // Signal « lead qualifié » : l'abonnement engage sur du récurrent.
    this.events.publish(
      new SubscriptionCreatedEvent(created.id, command.actorUserId, payload.recurrence),
    );
    return created;
  }
}
