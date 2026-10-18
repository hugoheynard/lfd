import { VitrineSubscriberNotFoundError } from "../domain/errors/vitrine-errors.js";
import type { VitrineSubscriberRepository } from "../domain/ports/vitrine-subscriber.repository.js";
import type { VitrineSubscriber } from "../domain/vitrine-subscriber.js";

/** Charge un abonné, ou le refus qui le nomme. */
export async function loadVitrineSubscriber(
  subscribers: VitrineSubscriberRepository,
  id: string,
): Promise<VitrineSubscriber> {
  const subscriber = await subscribers.load(id);
  if (subscriber === null) {
    throw new VitrineSubscriberNotFoundError(id);
  }
  return subscriber;
}
