import { Injectable, type OnApplicationBootstrap } from "@nestjs/common";
import { DiscoveryService } from "@nestjs/core";

import {
  DurableHandler,
  DurableSubscribers,
  type DurableSubscriber,
  type RegisteredSubscriber,
} from "./durable-handler.js";
import { DuplicateDurableSubscriberError } from "./outbox-errors.js";

function isDurableSubscriber(instance: unknown): instance is DurableSubscriber {
  return (
    typeof instance === "object" &&
    instance !== null &&
    "handle" in instance &&
    typeof instance.handle === "function"
  );
}

/**
 * Le registre des abonnés durables, lu au démarrage parmi les providers Nest
 * marqués `@DurableHandler`. Un nom en double fait refuser le démarrage : deux
 * abonnés partageant un reçu, l'un des deux ne recevrait jamais rien.
 */
@Injectable()
export class DiscoveredDurableSubscribers
  extends DurableSubscribers
  implements OnApplicationBootstrap
{
  private byType = new Map<string, readonly RegisteredSubscriber[]>();

  constructor(private readonly discovery: DiscoveryService) {
    super();
  }

  onApplicationBootstrap(): void {
    const byType = new Map<string, RegisteredSubscriber[]>();
    const names = new Set<string>();
    for (const wrapper of this.discovery.getProviders({ metadataKey: DurableHandler.KEY })) {
      const options = this.discovery.getMetadataByDecorator(DurableHandler, wrapper);
      const instance: unknown = wrapper.instance;
      if (options === undefined || !isDurableSubscriber(instance)) {
        continue;
      }
      if (names.has(options.subscriber)) {
        throw new DuplicateDurableSubscriberError(options.subscriber);
      }
      names.add(options.subscriber);
      const list = byType.get(options.type) ?? [];
      list.push({ name: options.subscriber, handler: instance });
      byType.set(options.type, list);
    }
    this.byType = byType;
  }

  subscribersOf(type: string): readonly RegisteredSubscriber[] {
    return this.byType.get(type) ?? [];
  }
}
