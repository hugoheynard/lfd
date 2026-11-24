import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { customerIntentActor } from "../../../../platform/intent/customer-intent-actor.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import {
  type IntentCodec,
  OncePerIntent,
  readIntentString,
} from "../../../../platform/intent/once-per-intent.js";
import { Clock } from "../../../../platform/time/clock.js";
import { BasketArticles } from "../../../channels/commerce/basket-articles.js";
import { RECURRING_BASKET_OPENED } from "../../../channels/commerce/basket-facts.js";
import { BasketSalesTerms } from "../../../channels/commerce/basket-sales-terms.js";
import { OccurrencePlanner } from "../../../occurrence/application/services/occurrence-planner.js";
import { Basket } from "../../domain/entities/basket.js";
import type { BasketSalesTermsVersion } from "../../domain/entities/basket-sales-terms.js";
import {
  BasketSalesTermsUnpublishedError,
  OperationOnlyInSubscriptionError,
} from "../../domain/errors/basket-errors.js";
import { BasketRepository } from "../../domain/ports/basket.repository.js";
import { BasketLine } from "../../domain/value-objects/basket-line.js";
import { IsoDate } from "../../domain/value-objects/iso-date.js";
import { BasketFacts } from "../services/basket-facts.js";
import { BasketGestures } from "../services/basket-gestures.js";
import { parisDay } from "../services/paris-day.js";
import { OpenBasketCommand, type OpenedBasket } from "./open-basket.command.js";

const OPENED_BASKET_REPLAY: IntentCodec<OpenedBasket> = {
  write: (opened) => ({ id: opened.id }),
  read: (record, gesture) => ({ id: readIntentString(record, "id", gesture) }),
};

/** Le nom stable du geste, dans le registre des intentions. */
const OPEN_BASKET_GESTURE = "subscriptions.create";

/**
 * **Ouvre un panier récurrent.** L'agrégat porte les invariants (au moins une
 * ligne, acheminement cohérent, fin après le début) ; le handler confronte
 * d'abord les articles au catalogue, la société aux rattachements, et
 * enregistre la version des CGV en vigueur pour l'acheteur — obligatoire,
 * c'est celle que le panier applique (plan `plan-bloc-recurrent.md`, § 7).
 * Le panier, ses échéances des huit semaines à venir et le fait durable
 * `recurring.basket_opened` partent ensemble.
 *
 * Un payeur public n'ouvre pas de panier (périmètre du planificateur, § 0) :
 * refusé ici, avant toute écriture ; la passation garde son propre refus.
 *
 * **Une fois par intention** : la clé de l'écran est réclamée avant
 * l'écriture et scellée dans sa transaction ; un double envoi rend le panier
 * déjà ouvert. L'acteur est le client (`customer:<id>`).
 *
 * @sans-journal le journal lit l'ouverture sous `subscription.created`, sur
 * la PERSONNE, écrit par l'abonné durable de la croissance — le score des
 * leads la lit sous cette forme. Le panier lui-même porte son acheteur et son heure.
 */
@CommandHandler(OpenBasketCommand)
export class OpenBasketHandler implements ICommandHandler<OpenBasketCommand, OpenedBasket> {
  constructor(
    private readonly baskets: BasketRepository,
    private readonly planner: OccurrencePlanner,
    private readonly gestures: BasketGestures,
    private readonly facts: BasketFacts,
    private readonly articles: BasketArticles,
    private readonly salesTerms: BasketSalesTerms,
    private readonly intents: OncePerIntent,
    private readonly uow: UnitOfWork,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  /**
   * @throws {OperationOnlyInSubscriptionError} une ligne ne se vend que pendant une opération.
   * @throws {WeightArticleInSubscriptionError} une ligne se vend au poids.
   * @throws {SubscriptionSiteMembershipLostError} la société visée n'est pas celle de l'acteur.
   * @throws {BasketPublicPayerError} la société règle sur engagement budgétaire.
   * @throws {BasketSalesTermsUnpublishedError} aucune CGV publiée pour la clientèle.
   */
  execute(command: OpenBasketCommand): Promise<OpenedBasket> {
    return this.intents.runSealed(
      {
        actorId: customerIntentActor(command.actorUserId),
        key: command.intentKey,
        gesture: OPEN_BASKET_GESTURE,
        subject: intentSubject(command.companyId ?? "personal", command.payload),
      },
      OPENED_BASKET_REPLAY,
      (seal) => this.open(command, seal),
    );
  }

  private async open(
    command: OpenBasketCommand,
    seal: (opened: OpenedBasket) => Promise<void>,
  ): Promise<OpenedBasket> {
    const basket = await this.compose(command);
    const at = this.clock.now();
    return this.uow.run(async () => {
      await this.baskets.insert(basket, at);
      await this.planner.planAhead(basket, parisDay(at), at);
      await this.baskets.save(basket, at);
      await this.facts.publish(RECURRING_BASKET_OPENED, basket);
      const opened = { id: basket.id };
      await seal(opened);
      return opened;
    });
  }

  /** Les gardes qui lisent ailleurs, puis l'agrégat. */
  private async compose(command: OpenBasketCommand): Promise<Basket> {
    const { payload, companyId } = command;
    const skus = payload.lines.map((line) => line.sku);
    const review = await this.articles.review(skus);
    if (review.operationOnly.length > 0) {
      throw new OperationOnlyInSubscriptionError(review.operationOnly);
    }
    await this.gestures.ensureMember(companyId, command.actorUserId);
    await this.gestures.ensureNotPublicPayer(companyId);
    await this.articles.ensureOpenTo(companyId, skus);
    return Basket.open({
      id: this.ids.next(),
      buyerUserId: command.actorUserId,
      companyId,
      fromOrderId: payload.fromOrderId,
      cadence: payload.recurrence,
      startDate: IsoDate.fromString(payload.startDate),
      endDate: payload.endDate === null ? null : IsoDate.fromString(payload.endDate),
      routing: {
        method: payload.fulfillmentMethod,
        deliveryAddress: payload.deliveryAddress,
        pickupAddressId: payload.pickupAddressId,
        window: payload.requestedWindow,
      },
      note: payload.note,
      lines: payload.lines.map((line) =>
        BasketLine.requested(
          line.sku,
          line.quantity,
          review.weightSold.has(line.sku) ? "weight" : "piece",
        ),
      ),
      salesTerms: await this.acceptedTerms(companyId),
    });
  }

  private async acceptedTerms(companyId: string | null): Promise<BasketSalesTermsVersion> {
    const terms = await this.salesTerms.inForceFor(companyId);
    if (terms.revision === null) {
      throw new BasketSalesTermsUnpublishedError();
    }
    return { key: terms.key, revision: terms.revision, fileId: terms.fileId };
  }
}
