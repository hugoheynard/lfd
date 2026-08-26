import {
  SalesContextHandleTakenError,
  SalesContextKeyTakenError,
  SalesContextNotFoundError,
} from "../domain/errors/sales-context-errors.js";
import type { SalesContextAggregate } from "../domain/entities/sales-context.entity.js";
import { SalesContextRepository } from "../domain/ports/sales-context.repository.js";

/**
 * Les gardes que l'agrégat ne peut pas tenir : elles regardent les AUTRES
 * contextes.
 */

export async function requireContext(
  contexts: SalesContextRepository,
  key: string,
): Promise<SalesContextAggregate> {
  const context = await contexts.findByKey(key);
  if (context === null) {
    throw new SalesContextNotFoundError(key);
  }
  return context;
}

/** Refuse une clé déjà portée. La base tranche en dernier ; ceci explique. */
export async function ensureKeyFree(contexts: SalesContextRepository, key: string): Promise<void> {
  if ((await contexts.findByKey(key)) !== null) {
    throw new SalesContextKeyTakenError(key);
  }
}

/**
 * Deux contextes **projetés vers Shopify** ne peuvent pas partager un suffixe :
 * ils produiraient la même URL de produit.
 *
 * Un contexte non projeté n'a pas de handle du tout — son suffixe ne collisionne
 * avec rien, et l'exiger unique interdirait le vide à tous sauf un.
 *
 * Aucune contrainte en base ne le tient : elle devrait porter sur
 * `(handle_suffix)` *filtré* sur `shopify_projected`, et il faudrait la poser en
 * SQL comme les autres index partiels. Elle le mérite le jour où un second
 * contexte sera réellement projeté — aujourd'hui il n'y en a qu'un.
 */
export async function ensureHandleFree(
  contexts: SalesContextRepository,
  candidate: {
    readonly key: string;
    readonly shopifyProjected: boolean;
    readonly handleSuffix: string;
  },
): Promise<void> {
  if (!candidate.shopifyProjected) {
    return;
  }
  const holder = await contexts.findProjectedByHandleSuffix(candidate.handleSuffix);
  if (holder !== null && holder.key !== candidate.key) {
    throw new SalesContextHandleTakenError(candidate.handleSuffix);
  }
}
