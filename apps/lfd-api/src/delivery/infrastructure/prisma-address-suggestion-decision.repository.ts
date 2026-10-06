import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import type { AddressSuggestionDecision } from "../domain/entities/address-suggestion-decision.js";
import { AddressSuggestionDecisionRepository } from "../domain/ports/address-suggestion-decision.repository.js";

/**
 * **Adaptateur Prisma des décisions sur les suggestions du carnet** (§6).
 * Seul écrivain de `delivery_address_suggestion_decision`, qui n'a qu'un
 * geste : ajouter. La purge des positions en efface le point à 60 jours.
 */
@Injectable()
export class PrismaAddressSuggestionDecisionRepository extends AddressSuggestionDecisionRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async record(decision: AddressSuggestionDecision): Promise<void> {
    const state = decision.toSnapshot();
    await this.prisma.deliveryAddressSuggestionDecision.create({
      data: {
        id: state.id,
        addressId: state.addressId,
        kind: state.kind,
        outcome: state.outcome,
        pointLat: state.point.lat,
        pointLng: state.point.lng,
        decidedAt: state.decidedAt,
        decidedBy: state.decidedBy,
        decidedByName: state.decidedByName,
      },
    });
  }
}
