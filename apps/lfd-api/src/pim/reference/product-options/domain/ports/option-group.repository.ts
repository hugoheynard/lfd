import type { WriteTicket } from "../../../../../platform/journal/scoped-journal.js";
import type { OptionGroup } from "../entities/option-group.js";

/**
 * Port d'écriture du groupe d'options : il rend et reprend l'**agrégat**, ses
 * choix compris — un choix ne s'écrit jamais seul.
 */
export abstract class OptionGroupRepository {
  abstract listAll(): Promise<OptionGroup[]>;
  abstract findById(id: string): Promise<OptionGroup | null>;
  abstract add(group: OptionGroup, ticket: WriteTicket): Promise<void>;
  abstract save(group: OptionGroup, ticket: WriteTicket): Promise<void>;
}
