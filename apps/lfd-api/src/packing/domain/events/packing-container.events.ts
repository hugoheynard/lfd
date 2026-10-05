import type { JournalFactType } from "@lfd/contracts/journal-facts";

import type { JournalFact, JournaledEvent } from "../../../platform/journal/journal-fact.js";
import type { ContainerNature, PackingContainerState } from "../entities/order-contents.js";

/**
 * **Les faits de la colonne Contenants** (K2b,
 * `colisage/colisage.md`). Sujet : la commande, nommée par
 * son numéro ; le contenant est cité par son libellé du moment. L'acteur n'est
 * pas ici : l'adaptateur du journal le lit dans le contexte de requête.
 */
export const PACKING_CONTAINER_FACTS = {
  opened: "packing_container.opened",
  filled: "packing_container.filled",
  emptied: "packing_container.emptied",
  voided: "packing_container.voided",
} as const satisfies Readonly<Record<string, JournalFactType>>;

/** La commande citée : son id opaque et son numéro. */
export interface CitedPackingOrder {
  readonly id: string;
  readonly name: string;
}

/** Un contenant cité : son id et son libellé (code du bac, « Sac 2 »). */
export interface CitedContainer {
  readonly id: string;
  readonly name: string;
}

/**
 * Le libellé d'un contenant parmi ceux de sa commande : le code de son bac,
 * ou « Sac N » — N son rang parmi les sacs, annulés compris (un rang ne se
 * réattribue pas).
 */
export function citeContainer(
  containers: readonly PackingContainerState[],
  containerId: string,
): CitedContainer {
  const container = containers.find((candidate) => candidate.id === containerId);
  if (container !== undefined && container.bin !== null) {
    return { id: containerId, name: container.bin.code };
  }
  const bags = containers.filter((candidate) => candidate.nature === "bag");
  const rank = bags.findIndex((candidate) => candidate.id === containerId) + 1;
  return { id: containerId, name: `Sac ${String(Math.max(rank, 1))}` };
}

function factOf(
  type: JournalFactType,
  order: CitedPackingOrder,
  container: CitedContainer,
  extra: Record<string, unknown>,
): JournalFact {
  return {
    type,
    subjectType: "order",
    subjectId: order.id,
    payload: { subjectLabel: order.name, container, ...extra },
  };
}

/** Un contenant de plus. */
export class PackingContainerOpenedEvent implements JournaledEvent {
  constructor(
    readonly order: CitedPackingOrder,
    readonly container: CitedContainer,
    readonly nature: ContainerNature,
  ) {}

  journalFact(): JournalFact {
    return factOf(PACKING_CONTAINER_FACTS.opened, this.order, this.container, {
      nature: this.nature,
    });
  }
}

/** Des pièces glissées dans un contenant (`filled`), ou ressorties (`emptied`). */
export class PackingContainerMovedEvent implements JournaledEvent {
  constructor(
    readonly direction: "filled" | "emptied",
    readonly order: CitedPackingOrder,
    readonly container: CitedContainer,
    readonly line: { readonly sku: string; readonly productName: string },
    readonly quantity: number,
  ) {}

  journalFact(): JournalFact {
    return factOf(PACKING_CONTAINER_FACTS[this.direction], this.order, this.container, {
      sku: this.line.sku,
      productName: this.line.productName,
      quantity: this.quantity,
    });
  }
}

/** Un contenant annulé. */
export class PackingContainerVoidedEvent implements JournaledEvent {
  constructor(
    readonly order: CitedPackingOrder,
    readonly container: CitedContainer,
  ) {}

  journalFact(): JournalFact {
    return factOf(PACKING_CONTAINER_FACTS.voided, this.order, this.container, {});
  }
}
