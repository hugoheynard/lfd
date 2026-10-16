import {
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
