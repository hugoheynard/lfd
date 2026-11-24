import type { Provider, Type } from "@nestjs/common";

import { ApplyAddressPointSuggestionHandler } from "./application/commands/apply-address-point-suggestion.handler.js";
import { IgnoreAddressPointSuggestionHandler } from "./application/commands/ignore-address-point-suggestion.handler.js";
import { GetDeliveryAddressBookHandler } from "./application/queries/get-delivery-address-book.handler.js";
import { GetAddressPointSuggestionsHandler } from "./application/queries/get-address-point-suggestions.handler.js";
import { AddressSuggestionDecisionLock } from "./domain/ports/address-suggestion-decision.lock.js";
import { AddressSuggestionDecisionRepository } from "./domain/ports/address-suggestion-decision.repository.js";
import { GesturePositionsReader } from "./domain/ports/gesture-positions.reader.js";
import { IgnoredAddressPointsReader } from "./domain/ports/ignored-address-points.reader.js";
import { DeliveryAddressBookController } from "./http/delivery-address-book.controller.js";
import { AddressPointSuggestionsController } from "./http/address-point-suggestions.controller.js";
import { PrismaAddressSuggestionDecisionLock } from "./infrastructure/prisma-address-suggestion-decision.lock.js";
import { PrismaAddressSuggestionDecisionRepository } from "./infrastructure/prisma-address-suggestion-decision.repository.js";
import { PrismaGesturePositionsReader } from "./infrastructure/prisma-gesture-positions.reader.js";
import { PrismaIgnoredAddressPointsReader } from "./infrastructure/prisma-ignored-address-points.reader.js";

/**
 * **Les corrections du carnet suggérées au bureau**
 * (`documentation/livraisons/livreur/gps-y-aller-et-position.md`, §6), rangées à
 * part : une lecture, deux décisions, quatre ports et leurs adaptateurs. Le
 * carnet lui-même est au commerce, joint par le canal
 * (`DeliveryAddressPointsReader`, `DeliveryAddressPointCorrector`).
 *
 * Le carnet entier, pour l'onglet « Adresses » de Tour manager, y est rangé
 * aussi : même source (`DeliveryAddressBookReader`), lecture seule.
 */
export const ADDRESS_SUGGESTIONS_CONTROLLERS: readonly Type[] = [
  AddressPointSuggestionsController,
  DeliveryAddressBookController,
];

export const ADDRESS_SUGGESTIONS_PROVIDERS: readonly Provider[] = [
  GetAddressPointSuggestionsHandler,
  GetDeliveryAddressBookHandler,
  ApplyAddressPointSuggestionHandler,
  IgnoreAddressPointSuggestionHandler,
  { provide: GesturePositionsReader, useClass: PrismaGesturePositionsReader },
  { provide: IgnoredAddressPointsReader, useClass: PrismaIgnoredAddressPointsReader },
  {
    provide: AddressSuggestionDecisionRepository,
    useClass: PrismaAddressSuggestionDecisionRepository,
  },
  { provide: AddressSuggestionDecisionLock, useClass: PrismaAddressSuggestionDecisionLock },
];
