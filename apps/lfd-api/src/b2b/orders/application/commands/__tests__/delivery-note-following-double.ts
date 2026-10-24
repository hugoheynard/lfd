import { DeliveryNoteFollowing } from "../../../domain/ports/delivery-note-following.js";

/**
 * Le BL qui suit la commande, doublé (plan E2) : note les gestes demandés et,
 * si on lui passe le témoin de l'unité de travail, s'ils l'ont été DEDANS.
 */
export class RecordingDeliveryNoteFollowing extends DeliveryNoteFollowing {
  readonly calls: string[] = [];
  readonly insideUnit: boolean[] = [];

  constructor(private readonly isOpen: () => boolean = () => true) {
    super();
  }

  planConfirmed(): Promise<void> {
    return Promise.reject(new RangeError("non utilisé par les marques"));
  }

  prepare(orderId: string): Promise<void> {
    return this.record(`prepare:${orderId}`);
  }

  handOver(orderId: string): Promise<void> {
    return this.record(`hand-over:${orderId}`);
  }

  voidLiveFor(orderId: string): Promise<void> {
    return this.record(`void:${orderId}`);
  }

  private record(call: string): Promise<void> {
    this.calls.push(call);
    this.insideUnit.push(this.isOpen());
    return Promise.resolve();
  }
}
