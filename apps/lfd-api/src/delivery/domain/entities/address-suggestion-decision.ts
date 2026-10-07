import type { AddressPointKind } from "@lfd/contracts";

import { type GeoPoint, geoPoint } from "../value-objects/geo-point.js";

/** Ce que le bureau a fait d'une suggestion. */
export type AddressSuggestionOutcome = "ignored" | "applied";

/** Qui décide, son nom figé au geste ; `""` quand l'annuaire n'en connaît pas. */
export interface SuggestionDecisionAuthor {
  readonly staffUserId: string;
  readonly name: string;
}

/** Une décision telle qu'elle s'écrit. */
export interface AddressSuggestionDecisionState {
  readonly id: string;
  readonly addressId: string;
  readonly kind: AddressPointKind;
  readonly outcome: AddressSuggestionOutcome;
  readonly point: GeoPoint;
  readonly decidedAt: Date;
  readonly decidedBy: string;
  readonly decidedByName: string;
}

/** Ce que la commande apporte pour décider. */
export interface AddressSuggestionDecisionInput {
  readonly id: string;
  readonly addressId: string;
  readonly kind: AddressPointKind;
  readonly point: GeoPoint;
  readonly at: Date;
  readonly author: SuggestionDecisionAuthor;
}

/**
 * **Ce que le bureau a décidé d'une suggestion de correction du carnet**
 * (`documentation/livraisons/livreur/gps-y-aller-et-position.md`, §6) — un FAIT
 * daté, jamais réécrit. Le point est celui que le bureau a VU : une
 * suggestion ignorée n'est plus reproposée tant que les livraisons concluent
 * au même endroit.
 *
 * Sa seule règle est de naître juste : un point terrestre.
 */
export class AddressSuggestionDecision {
  private constructor(private readonly state: AddressSuggestionDecisionState) {}

  /** « Ignorer ». @throws {InvalidGeoPointError} */
  static ignore(input: AddressSuggestionDecisionInput): AddressSuggestionDecision {
    return AddressSuggestionDecision.decide(input, "ignored");
  }

  /** « Appliquer » — la trace, à côté du fait que le commerce inscrit. @throws {InvalidGeoPointError} */
  static apply(input: AddressSuggestionDecisionInput): AddressSuggestionDecision {
    return AddressSuggestionDecision.decide(input, "applied");
  }

  private static decide(
    input: AddressSuggestionDecisionInput,
    outcome: AddressSuggestionOutcome,
  ): AddressSuggestionDecision {
    return new AddressSuggestionDecision({
      id: input.id,
      addressId: input.addressId,
      kind: input.kind,
      outcome,
      point: geoPoint(input.point.lat, input.point.lng),
      decidedAt: input.at,
      decidedBy: input.author.staffUserId,
      decidedByName: input.author.name,
    });
  }

  toSnapshot(): AddressSuggestionDecisionState {
    return { ...this.state };
  }
}
