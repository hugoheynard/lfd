import { LoyaltyHolderNotFoundError } from "../../domain/errors/loyalty-errors.js";
import type { NamedHolder } from "../../domain/events/loyalty.events.js";
import type { LoyaltyHolderDirectory } from "../../domain/ports/loyalty-holder.directory.js";
import type { LoyaltyHolder } from "../../domain/value-objects/loyalty-holder.js";

/**
 * Le titulaire et son nom, ou un 404 s'il n'existe pas. Partagé par les gestes
 * qui écrivent au livre : chacun cite le titulaire au journal, et aucun
 * n'écrit pour un titulaire inconnu — la clé étrangère le refuserait, mais
 * sans dire pourquoi.
 *
 * @throws {LoyaltyHolderNotFoundError}
 */
export async function requireNamedHolder(
  directory: LoyaltyHolderDirectory,
  holder: LoyaltyHolder,
): Promise<NamedHolder> {
  const found = await directory.describe(holder);
  if (found === null) {
    throw new LoyaltyHolderNotFoundError(holder.kind, holder.id);
  }
  return { holder, label: found.label };
}
