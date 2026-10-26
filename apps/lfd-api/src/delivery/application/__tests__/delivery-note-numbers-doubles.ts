import {
  DeliveryNoteNumbersReader,
  type DeliveryShipmentKey,
  type DeliveryShipmentNoteNumber,
} from "../../channels/commerce/index.js";

/**
 * Le double du canal des numéros de BL : rend, parmi ses numéros, ceux des
 * envois demandés — comme l'adaptateur —, et garde trace des demandes.
 */
export class FixedNoteNumbers extends DeliveryNoteNumbersReader {
  readonly asked: (readonly DeliveryShipmentKey[])[] = [];

  constructor(private readonly numbers: readonly DeliveryShipmentNoteNumber[] = []) {
    super();
  }

  numbersOf(
    shipments: readonly DeliveryShipmentKey[],
  ): Promise<readonly DeliveryShipmentNoteNumber[]> {
    this.asked.push(shipments);
    return Promise.resolve(
      this.numbers.filter((note) =>
        shipments.some((key) => key.orderId === note.orderId && key.rank === note.rank),
      ),
    );
  }
}
