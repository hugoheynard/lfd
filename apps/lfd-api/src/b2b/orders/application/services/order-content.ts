import type {
  BillingAddressPayload,
  DeliveryContact,
  FulfillmentMethod,
  FulfillmentWindow,
  OrderLineInput as OrderLineRequest,
} from "@lfd/contracts";

/** Ce qu'un panier demande, quelle que soit la porte par laquelle il arrive. */
export interface OrderContent {
  readonly fulfillmentMethod: FulfillmentMethod;
  readonly deliveryAddress: BillingAddressPayload | null;
  /** L'adresse du carnet dont elle vient, ou `null` si dictée à la volée. */
  readonly deliveryAddressId: string | null;
  readonly pickupAddressId: string | null;
  readonly requestedDeliveryDate: string | null;
  /**
   * La tranche demandée — engagement, pas préférence. **Obligatoire à la
   * passation** depuis le 2026-10-14 (`ensureWindowChosen`) : facultative ici
   * seulement parce que le devis partage cette forme et n'a pas de tranche.
   */
  readonly requestedWindow?: FulfillmentWindow | null | undefined;
  /** Qui reçoit, tel que l'écran l'affiche. `undefined` = prendre le réglage. */
  readonly deliveryContact?: DeliveryContact | null | undefined;
  readonly signatureRequired?: boolean | undefined;
  readonly note: string;
  readonly lines: readonly OrderLineRequest[];
}
