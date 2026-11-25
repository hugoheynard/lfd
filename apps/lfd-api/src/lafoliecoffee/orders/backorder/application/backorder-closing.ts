import type { Journal } from "../../../../platform/journal/journal.js";
import type { Clock } from "../../../../platform/time/clock.js";
import type { StaffPlacementBinding } from "../../application/services/staff-order-placement.js";
import type { Backorder } from "../domain/entities/backorder.js";
import { BackorderNotFoundError } from "../domain/errors/backorder-errors.js";
import type { BackorderRepository } from "../domain/ports/backorder.repository.js";
import { BackorderJournalFacts } from "./backorder-journal-facts.js";

/** Ce que la fermeture du reliquat lit et écrit. */
export interface BackorderClosingPorts {
  readonly backorders: Pick<BackorderRepository, "loadLocked" | "save">;
  readonly clock: Clock;
  readonly journal: Journal;
}

/**
 * **Ce que la transformation écrit avec la commande, dans sa transaction** —
 * partagé par les trois passations qu'un reliquat emprunte (saisie de
 * l'équipe, réglée en boutique, offerte au particulier) : le reliquat
 * verrouillé avant la journée tenue (une transformation concurrente attend
 * et lit l'état fermé), puis fermé sur la commande écrite, avec le fait
 * `backorder.converted`. Un refus annule la commande.
 */
export function backorderClosing(
  ports: BackorderClosingPorts,
  backorder: Backorder,
  originReference: string,
  staffUserId: string,
): StaffPlacementBinding {
  const { id } = backorder;
  let locked = backorder;
  return {
    beforePlace: async () => {
      const fresh = await ports.backorders.loadLocked(id);
      if (fresh === null) {
        throw new BackorderNotFoundError(id);
      }
      fresh.ensureOpen();
      locked = fresh;
    },
    afterPlace: async (placed) => {
      locked.convert(placed.id, ports.clock.now(), staffUserId);
      await ports.backorders.save(locked);
      await ports.journal.append(
        BackorderJournalFacts.converted(locked, originReference, {
          id: placed.id,
          number: placed.orderNumber,
        }),
      );
    },
  };
}
