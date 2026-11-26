import { Clock } from "../../../../platform/time/clock.js";
import { OrderCutoffWaiverGate } from "../../domain/ports/order-cutoff-waiver.gate.js";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { AppConfig } from "../../../../platform/config/app-config.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { DurablePublisher } from "../../../../platform/outbox/durable-publisher.js";
import { CardPayments } from "../../../../payment/channels/requests/index.js";
import { OrderGuardReader } from "../../domain/ports/order-guard.reader.js";
import { OrderRepository } from "../../domain/ports/order.repository.js";
import { OrderRecipientReader } from "../../domain/ports/order-recipient.reader.js";
import { ShelfCircuit } from "../services/shelf-circuit.service.js";
import { OrderDrafting, PLACEMENT_POLICY } from "../services/order-drafting.service.js";
import { PayerCommitmentRequirements } from "../../domain/ports/payer-commitment-requirements.js";
import { ensureMayOffer } from "../services/order-offering.js";
import {
  ORDINARY_STAFF_PLACEMENT,
  StaffOrderPlacement,
} from "../services/staff-order-placement.js";
import {
  PlaceOrderForCustomerCommand,
  type PlaceOrderForCustomerResult,
} from "./place-order-for-customer.command.js";
import { STAFF_PLACEMENT_REPLAY, staffPlacementIntent } from "./staff-placement-intent.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { ItemLimitOverrideRecorder } from "../../domain/ports/item-limit-override.recorder.js";

/**
 * Passe une commande **au nom d'un client**, depuis le back-office.
 *
 * Le panier se compose exactement comme celui du client ({@link OrderDrafting}) —
 * mêmes prix ré-résolus, même remise de retrait, même zone déduite du code
 * postal. Deux choses seulement diffèrent, et ce sont les deux raisons d'être de
 * ce handler :
 *
 * 1. **Le mur porte sur l'acheteur, pas sur l'acteur.** Un commercial n'est
 *    membre d'aucune société cliente : vérifier SON appartenance n'aurait aucun
 *    sens. C'est `buyerUserId` — la personne au nom de qui la commande est
 *    portée — qui doit être membre. Il vient du corps de la requête, donc il se
 *    vérifie ; le droit d'être là, lui, a déjà été tranché par la porte staff.
 *
 * 2. **Aucune carte n'est saisie ici.** Le règlement au compte est refusé si la
 *    société n'a pas de crédit ; sinon on crée une intention et on rend un
 *    **lien** que le client suivra lui-même. Un numéro de carte dicté au
 *    téléphone et tapé par un commercial est précisément ce qu'on n'autorise pas.
 *
 * La passation elle-même est {@link StaffOrderPlacement}, que la
 * transformation d'un reliquat partage ; ce handler y ajoute l'intention et
 * la politique ordinaire.
 */
@CommandHandler(PlaceOrderForCustomerCommand)
export class PlaceOrderForCustomerHandler implements ICommandHandler<
  PlaceOrderForCustomerCommand,
  PlaceOrderForCustomerResult
> {
  private readonly placement: StaffOrderPlacement;

  constructor(
    guard: OrderGuardReader,
    drafting: OrderDrafting,
    orders: OrderRepository,
    payments: CardPayments,
    events: DomainEventPublisher,
    config: AppConfig,
    waivers: OrderCutoffWaiverGate,
    clock: Clock,
    unitOfWork: UnitOfWork,
    durable: DurablePublisher,
    shelf: ShelfCircuit,
    private readonly intents: OncePerIntent,
    commitments: PayerCommitmentRequirements,
    overrides: ItemLimitOverrideRecorder,
    ids: IdGenerator,
    recipients: OrderRecipientReader,
  ) {
    this.placement = new StaffOrderPlacement({
      guard,
      drafting,
      orders,
      payments,
      events,
      config,
      waivers,
      clock,
      unitOfWork,
      durable,
      shelf,
      commitments,
      overrides,
      ids,
      recipients,
    });
  }

  /**
   * **Une fois par intention** : la clé de l'écran (en-tête `Idempotency-Key`)
   * est réclamée avant tout — avant la préparation du lien de règlement, qui
   * part au prestataire HORS transaction. Un double clic rend la commande
   * déjà passée (même réponse), sans seconde commande ni second lien ; la clé
   * se scelle dans la transaction qui écrit la commande. Un refus levé avant
   * l'écriture rend la clé : le commercial corrige et renvoie.
   *
   * @throws {GestureInFlightError} la même clé est encore en vol.
   * @throws {IntentKeyReusedError} la clé a déjà passé un autre panier.
   * @throws {OfferNotPermittedError} une commande offerte sans le droit `b2b_offer_order`.
   */
  async execute(command: PlaceOrderForCustomerCommand): Promise<PlaceOrderForCustomerResult> {
    // Avant toute intention scellée : un refus de droit ne consomme pas la clé.
    ensureMayOffer(command.payload.settlement === "offered", command.mayOffer);
    return await this.intents.runSealed(
      staffPlacementIntent(command.staffUserId, command.intentKey, command.payload),
      STAFF_PLACEMENT_REPLAY,
      (seal) =>
        this.placement.place(
          {
            staffUserId: command.staffUserId,
            payload: command.payload,
            exceedItemLimits: command.exceedItemLimits,
          },
          PLACEMENT_POLICY,
          ORDINARY_STAFF_PLACEMENT,
          seal,
        ),
    );
  }
}
