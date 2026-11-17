import type { JournalFactType } from "@lfd/contracts/journal-facts";

import type { JournalFact, JournaledEvent } from "../../../../platform/journal/journal-fact.js";
import type { Workstation } from "../entities/workstation-map.js";

/**
 * **Les faits des postes du fournil** (`documentation/fournil/les-postes-du-fournil.md`,
 * § 3.3) — un par geste, écrit dans la transaction qui l'enregistre. Les
 * lignes ne gardent que le dernier état et son auteur ; le journal est la
 * seule mémoire de qui a rangé quoi, et quand.
 */
export const WORKSTATION_FACTS = {
  declared: "production_workstation.declared",
  renamed: "production_workstation.renamed",
  reordered: "production_workstation.reordered",
  archived: "production_workstation.archived",
  productsPlaced: "production_workstation.products_placed",
} as const satisfies Readonly<Record<string, JournalFactType>>;

const SUBJECT_TYPE = "production_workstation";

/** Le sujet d'un geste qui vise la carte entière, et non un poste. */
export const WORKSTATION_MAP_SUBJECT = "house";

/** Le nom du sujet de l'ordre des fiches. */
const MAP_LABEL = "Postes du fournil";

/** Le nom du sujet d'un retour « à ranger ». */
const UNPLACED_LABEL = "À ranger";

function stationFact(
  type: JournalFactType,
  station: Workstation,
  payload: Record<string, unknown>,
): JournalFact {
  return {
    type,
    subjectType: SUBJECT_TYPE,
    subjectId: station.id,
    payload: { subjectLabel: station.name, ...payload },
  };
}

export class WorkstationDeclaredEvent implements JournaledEvent {
  constructor(readonly station: Workstation) {}

  journalFact(): JournalFact {
    return stationFact(WORKSTATION_FACTS.declared, this.station, {
      position: this.station.position,
    });
  }
}

export class WorkstationRenamedEvent implements JournaledEvent {
  constructor(
    readonly station: Workstation,
    readonly previousName: string,
  ) {}

  journalFact(): JournalFact {
    return stationFact(WORKSTATION_FACTS.renamed, this.station, {
      previous: { name: this.previousName },
    });
  }
}

export class WorkstationsReorderedEvent implements JournaledEvent {
  constructor(readonly order: readonly Workstation[]) {}

  journalFact(): JournalFact {
    return {
      type: WORKSTATION_FACTS.reordered,
      subjectType: SUBJECT_TYPE,
      subjectId: WORKSTATION_MAP_SUBJECT,
      payload: {
        subjectLabel: MAP_LABEL,
        order: this.order.map((station) => ({ id: station.id, name: station.name })),
      },
    };
  }
}

export class WorkstationArchivedEvent implements JournaledEvent {
  constructor(readonly station: Workstation) {}

  journalFact(): JournalFact {
    return stationFact(WORKSTATION_FACTS.archived, this.station, {});
  }
}

/** Des produits placés sur `station`, ou remis « à ranger » (`null`). */
export class WorkstationProductsPlacedEvent implements JournaledEvent {
  constructor(
    readonly station: Workstation | null,
    readonly productSkus: readonly string[],
  ) {}

  journalFact(): JournalFact {
    const placement = {
      skus: [...this.productSkus],
      count: this.productSkus.length,
    };
    if (this.station === null) {
      return {
        type: WORKSTATION_FACTS.productsPlaced,
        subjectType: SUBJECT_TYPE,
        subjectId: WORKSTATION_MAP_SUBJECT,
        payload: { subjectLabel: UNPLACED_LABEL, workstation: null, ...placement },
      };
    }
    return stationFact(WORKSTATION_FACTS.productsPlaced, this.station, {
      workstation: { id: this.station.id, name: this.station.name },
      ...placement,
    });
  }
}
