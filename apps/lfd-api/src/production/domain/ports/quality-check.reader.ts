import type { QualityCheck, QualityPhotoRef } from "../entities/quality-check.js";
import type { ServiceDay } from "../value-objects/service-day.value-object.js";

/**
 * **Lire les contrôles** — séparé du port d'écriture (ISP) : la Supervision lit
 * une journée, le verdict n'en écrit qu'un.
 *
 * Les contrôles se lisent ENTIERS (tous les verdicts, pas seulement le courant) :
 * le verdict courant, la péremption et la retenue se DÉRIVENT de la liste
 * (`quality-verdicts.ts`), et rien de stocké ne peut diverger d'elle.
 */
export abstract class QualityCheckReader {
  /** Tous les contrôles rendus sur cette journée, dans n'importe quel ordre. */
  abstract forDay(day: ServiceDay): Promise<readonly QualityCheck[]>;

  /** Une photo rattachée, ou `null` si ce contrôle n'en a pas à cette place. */
  abstract photo(checkId: string, position: number): Promise<QualityPhotoRef | null>;
}
