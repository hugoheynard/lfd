import { ProductOptionActivationRepository } from "../domain/ports/product-option-activation.repository.js";
import { ProductOptionActivationsReader } from "../domain/ports/product-option-activations.reader.js";
import { PrismaProductOptionActivationRepository } from "../infrastructure/prisma-product-option-activation.repository.js";
import { PrismaProductOptionActivationsReader } from "../infrastructure/prisma-product-option-activations.reader.js";
import { ActivateProductOptionGroupHandler } from "./activate-product-option-group.js";
import { DeactivateProductOptionGroupHandler } from "./deactivate-product-option-group.js";
import { ListProductOptionGroupsHandler } from "./list-product-option-groups.js";

/**
 * **Les options de commande d'une fiche** (`plan-options-de-commande.md`,
 * § 3.1), rangées à part du module du catalogue : la fiche écrit son
 * activation, et publie `ProductOptionActivationsReader` au canal.
 */
export const PRODUCT_OPTION_PROVIDERS = [
  { provide: ProductOptionActivationRepository, useClass: PrismaProductOptionActivationRepository },
  { provide: ProductOptionActivationsReader, useClass: PrismaProductOptionActivationsReader },
  ActivateProductOptionGroupHandler,
  DeactivateProductOptionGroupHandler,
  ListProductOptionGroupsHandler,
];
