import {
  OrderLinesForDeliveryNote,
  type DeliveryNoteOrder,
} from "../../../orders/domain/ports/order-lines-for-delivery-note.js";
import { DeliveryNote, type DeliveryNoteState } from "../../domain/entities/delivery-note.js";
import { DeliveryNoteRepository } from "../../domain/ports/delivery-note.repository.js";

/**
 * Doubles des bons de livraison, écrits à la main en héritant des ports. Le
 * dépôt garde des ÉTATS, pas des agrégats : une prévision qui oublierait
 * `save` ne verrait pas sa mutation fuiter dans le double.
 */
export class InMemoryDeliveryNotes extends DeliveryNoteRepository {
  readonly rows = new Map<string, DeliveryNoteState>();
  saves = 0;

  loadForOrders(orderIds: readonly string[]): Promise<readonly DeliveryNote[]> {
    const states = [...this.rows.values()].filter((row) => orderIds.includes(row.orderId));
    return Promise.resolve(states.map((state) => DeliveryNote.rehydrate(state)));
  }

  save(note: DeliveryNote): Promise<void> {
    const state = note.toState();
    const clash = [...this.rows.values()].find(
      (row) => row.id !== state.id && row.orderId === state.orderId && row.rank === state.rank,
    );
    if (clash !== undefined) {
      // L'unicité `(order_id, rank)` de la base.
      return Promise.reject(new Error(`unique (order_id, rank) : ${state.number}`));
    }
    this.saves += 1;
    this.rows.set(state.id, state);
    return Promise.resolve();
  }

  /** Les états, par commande — l'ordre d'insertion. */
  forOrder(orderId: string): readonly DeliveryNoteState[] {
    return [...this.rows.values()].filter((row) => row.orderId === orderId);
  }
}

/**
 * Les commandes confirmées, par instant d'arrêt : rend celles de `orderIds`
 * que l'arrêt de `closedAt` a confirmées, comme le `WHERE` de l'adaptateur.
 */
export class FixedConfirmedOrders extends OrderLinesForDeliveryNote {
  readonly confirmedAt = new Map<string, Date>();
  readonly orders = new Map<string, DeliveryNoteOrder>();

  confirm(order: DeliveryNoteOrder, at: Date): void {
    this.orders.set(order.orderId, order);
    this.confirmedAt.set(order.orderId, at);
  }

  confirmedByPlan(
    orderIds: readonly string[],
    closedAt: Date,
  ): Promise<readonly DeliveryNoteOrder[]> {
    return Promise.resolve(
      orderIds.flatMap((id) => {
        const order = this.orders.get(id);
        const at = this.confirmedAt.get(id);
        return order !== undefined && at?.getTime() === closedAt.getTime() ? [order] : [];
      }),
    );
  }
}
