import {
  BusinessError,
  ResourceNotFoundError,
  TechnicalError,
} from "../shared/errors/app-error.js";

/**
 * `DurablePublisher.publish` appelé hors d'une `UnitOfWork` : un fait durable sans
 * transaction n'a pas de sens — il survivrait à un changement annulé.
 */
export class DurableFactOutsideUnitOfWorkError extends TechnicalError {
  constructor(type: string) {
    super(
      "DURABLE_FACT_OUTSIDE_UNIT_OF_WORK",
      `Le fait durable « ${type} » a été publié hors de toute unité de travail. ` +
        "L'envelopper dans UnitOfWork.run avec le changement qu'il décrit.",
    );
  }
}

/** Deux abonnés durables déclarent le même nom : leurs reçus se confondraient. */
export class DuplicateDurableSubscriberError extends TechnicalError {
  constructor(subscriber: string) {
    super(
      "DUPLICATE_DURABLE_SUBSCRIBER",
      `Deux abonnés durables portent le nom « ${subscriber} ». ` +
        "Donner à chacun un nom propre dans @DurableHandler.",
    );
  }
}

/** Le couple message × abonné à rejouer n'existe pas. */
export class OutboxDeliveryNotFoundError extends ResourceNotFoundError {
  constructor(eventId: string, subscriber: string) {
    super(
      "OUTBOX_DELIVERY_NOT_FOUND",
      `Aucune livraison du message ${eventId} à l'abonné « ${subscriber} ». ` +
        "Vérifier l'identifiant et le nom d'abonné relevés dans la carte de santé.",
    );
  }
}

/** Rejouer une livraison déjà faite rejouerait son effet. */
export class OutboxDeliveryAlreadyDeliveredError extends BusinessError {
  constructor(eventId: string, subscriber: string) {
    super(
      "OUTBOX_DELIVERY_ALREADY_DELIVERED",
      `Le message ${eventId} a déjà été livré à « ${subscriber} » : il n'y a rien à rejouer.`,
    );
  }
}
