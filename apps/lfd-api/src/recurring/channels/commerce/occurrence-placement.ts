import type {
  BillingAddressPayload,
  FulfillmentMethod,
  FulfillmentWindow,
  RecurringDeltaLine,
} from "@lfd/contracts";

import type { OccurrenceRefusalCause } from "../../occurrence/domain/refusal-cause.js";

export type { OccurrenceRefusalCause };

/** La version des CGV que la commande fige : celle que le panier applique au jour servi. */
export interface PlacementSalesTerms {
  /** Le texte (`salesTerms`, `salesTermsPro`), tel que le panier l'a enregistré. */
  readonly key: string;
  readonly revision: number;
  readonly fileId: string | null;
}

/** **Une échéance à passer**, avec tout ce que la commande reprend. */
export interface OccurrencePlacementRequest {
  /** Le panier : la provenance de la commande (`from_subscription_id`). */
  readonly basketId: string;
  /** Le jour de l'échéance, `AAAA-MM-JJ` : la provenance (`from_occurrence_day`) et la date de service. */
  readonly serviceDay: string;
  /** Celui qui a ouvert le panier : l'acheteur de la commande. */
  readonly buyerUserId: string;
  readonly companyId: string;
  readonly routing: {
    readonly method: FulfillmentMethod;
    readonly deliveryAddress: BillingAddressPayload | null;
    readonly pickupAddressId: string | null;
    readonly window: FulfillmentWindow;
  };
  readonly lines: readonly { readonly sku: string; readonly quantity: number }[];
  /** La note de la dérogation de ce jour, sinon celle du panier. */
  readonly note: string;
  /** L'écart avec le gabarit, en quantités ; vide sans dérogation. */
  readonly deltas: {
    readonly added: readonly RecurringDeltaLine[];
    readonly removed: readonly RecurringDeltaLine[];
  };
  readonly salesTerms: PlacementSalesTerms;
}

/**
 * Ce que le commerce a fait de l'échéance : passée (sa commande), ou refusée
 * — `final` quand l'heure limite est passée et que l'échéance est manquée.
 */
export type OccurrencePlacementOutcome =
  | { readonly kind: "placed"; readonly orderId: string; readonly orderNumber: string }
  | {
      readonly kind: "refused";
      readonly cause: OccurrenceRefusalCause;
      readonly reason: string;
      readonly final: boolean;
    };

/**
 * **« Passe cette échéance »** — déclaré par les paniers récurrents,
 * implémenté par le commerce (plan `plan-bloc-recurrent.md`, § 6.1). Le bloc
 * ne sait pas ce qu'est une commande.
 *
 * **Une échéance, au plus une commande** — tenu par le commerce, en base : la
 * commande porte sa provenance (`basketId`, `serviceDay`) sous un index
 * unique. Une seconde passation de la même échéance rend la commande déjà
 * passée, comme `placed` : un rejeu, pas un doublon. C'est ce qui rend sûr de
 * rappeler ce port après une inscription d'issue perdue.
 *
 * Un refus métier se rend, il ne se lève pas ; une erreur technique se lève,
 * et le balayage suivant réessaie.
 */
export abstract class OccurrencePlacement {
  abstract place(request: OccurrencePlacementRequest): Promise<OccurrencePlacementOutcome>;
}
