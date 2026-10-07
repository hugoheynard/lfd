import type { Provider, Type } from "@nestjs/common";

import { ApplyAddressPointSuggestionHandler } from "./application/commands/apply-address-point-suggestion.handler.js";
import { IgnoreAddressPointSuggestionHandler } from "./application/commands/ignore-address-point-suggestion.handler.js";
import { GetAddressPointSuggestionsHandler } from "./application/queries/get-address-point-suggestions.handler.js";
import { AddressSuggestionDecisionRepository } from "./domain/ports/address-suggestion-decision.repository.js";
import { GesturePositionsReader } from "./domain/ports/gesture-positions.reader.js";
import { IgnoredAddressPointsReader } from "./domain/ports/ignored-address-points.reader.js";
import { AddressPointSuggestionsController } from "./http/address-point-suggestions.controller.js";
import { PrismaAddressSuggestionDecisionRepository } from "./infrastructure/prisma-address-suggestion-decision.repository.js";
import { PrismaGesturePositionsReader } from "./infrastructure/prisma-gesture-positions.reader.js";
import { PrismaIgnoredAddressPointsReader } from "./infrastructure/prisma-ignored-address-points.reader.js";

/**
 * **Les corrections du carnet suggérées au bureau**
 * (`documentation/livraisons/livreur/gps-y-aller-et-position.md`, §6), rangées à
 * part : une lecture, deux décisions, trois ports et leurs adaptateurs. Le
 * carnet lui-même est au commerce, joint par le canal
 * (`DeliveryAddressPointsReader`, `DeliveryAddressPointCorrector`).
 */
export const ADDRESS_SUGGESTIONS_CONTROLLERS: readonly Type[] = [AddressPointSuggestionsController];

export const ADDRESS_SUGGESTIONS_PROVIDERS: readonly Provider[] = [
  GetAddressPointSuggestionsHandler,
  ApplyAddressPointSuggestionHandler,
  IgnoreAddressPointSuggestionHandler,
  { provide: GesturePositionsReader, useClass: PrismaGesturePositionsReader },
  { provide: IgnoredAddressPointsReader, useClass: PrismaIgnoredAddressPointsReader },
  {
    provide: AddressSuggestionDecisionRepository,
    useClass: PrismaAddressSuggestionDecisionRepository,
  },
];
