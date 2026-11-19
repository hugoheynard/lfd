import type { Provider } from "@nestjs/common";

import { ItemLimitOverrideReader } from "./domain/ports/item-limit-override.reader.js";
import { ItemLimitOverrideRecorder } from "./domain/ports/item-limit-override.recorder.js";
import {
  PrismaItemLimitOverrideReader,
  PrismaItemLimitOverrideRecorder,
} from "./infrastructure/prisma-item-limit-overrides.js";

/**
 * Les providers des **dépassements de limite de produit** : leur écriture,
 * par la passation de l'équipe, et leur lecture, par la vue d'une commande.
 * À part du module, qui dépasse déjà la taille d'un fichier.
 */
export const ORDER_ITEM_LIMIT_OVERRIDE_PROVIDERS: readonly Provider[] = [
  { provide: ItemLimitOverrideRecorder, useClass: PrismaItemLimitOverrideRecorder },
  { provide: ItemLimitOverrideReader, useClass: PrismaItemLimitOverrideReader },
];
