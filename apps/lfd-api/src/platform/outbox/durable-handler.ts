import { DiscoveryService } from "@nestjs/core";

import type { DurableDelivery } from "./durable-event.js";

/** Ce qu'un `@DurableHandler` déclare. */
export interface DurableHandlerOptions {
  /** Le `type` du fait écouté (`order.packed`). */
  readonly type: string;
  /**
   * Nom STABLE de l'abonné, clé de son reçu. Pas le nom de classe : renommer
   * une classe ne doit pas faire relivrer ce qui attend encore.
   */
  readonly subscriber: string;
}

/**
 * Un **abonné durable** : il reçoit un fait au moins une fois, et la garde
 * commune du relais fait qu'il n'agit qu'une fois. Il tourne dans l'unité de
 * travail ouverte par la garde — il n'en ouvre pas.
 *
 * Il s'inscrit à `BackgroundWork` par le relais, qui le porte : c'est ce que
 * `lint:events-tracked` vérifie sur les `@DurableHandler`.
 */
export interface DurableSubscriber {
  handle(delivery: DurableDelivery): Promise<void>;
}

/**
 * Déclare un abonné durable — `@DurableHandler({ type, subscriber })` sur un
 * provider Nest qui implémente `DurableSubscriber`.
 */
export const DurableHandler = DiscoveryService.createDecorator<DurableHandlerOptions>();

/** Un abonné inscrit, prêt à recevoir. */
export interface RegisteredSubscriber {
  readonly name: string;
  readonly handler: DurableSubscriber;
}

/** Port de lecture : qui écoute quel fait. */
export abstract class DurableSubscribers {
  abstract subscribersOf(type: string): readonly RegisteredSubscriber[];
}
