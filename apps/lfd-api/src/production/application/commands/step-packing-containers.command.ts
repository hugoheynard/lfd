import type { ContainerStep } from "../../domain/value-objects/container-step.js";

/**
 * **Un container de plus, ou de moins**, sur une commande d'une journée.
 *
 * Un sens et pas un total (décidé le 2026-09-14) : le nouveau compte se calcule
 * en base, en une écriture atomique. Voir `stepContainerCount` pour la course
 * que ça ferme.
 *
 * 🔴 Rien à voir avec `SetProductionContainerCommand`, qui règle le matériel du
 * FOUR par SKU. Même mot, deux objets.
 */
export class StepPackingContainersCommand {
  constructor(
    readonly serviceDay: string,
    readonly reference: string,
    readonly step: ContainerStep,
  ) {}
}
