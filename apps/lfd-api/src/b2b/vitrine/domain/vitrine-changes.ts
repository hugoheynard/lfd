import type { VitrineElementKeys } from "@lfd/contracts";

/** Les quatre ensembles d'éléments, sous leur nom du corps de la notification. */
export const VITRINE_GROUPS = ["items", "operations", "shelves", "texts"] as const;
export type VitrineGroup = (typeof VITRINE_GROUPS)[number];

type Sets = Readonly<Record<VitrineGroup, ReadonlySet<string>>>;

/** Ce que la base et le corps de la notification portent. */
export interface VitrineChangesShape {
  readonly changed: VitrineElementKeys;
  readonly removed: VitrineElementKeys;
}

/**
 * **Ce qui a changé** pour un abonné : les éléments changés (ou apparus) et
 * les retirés, par ensemble. Un élément n'est jamais des deux côtés.
 */
export class VitrineChanges {
  private constructor(
    private readonly changed: Sets,
    private readonly removed: Sets,
  ) {}

  static none(): VitrineChanges {
    return new VitrineChanges(emptySets(), emptySets());
  }

  /** Un élément présent des deux côtés est lu comme changé : il existe encore. */
  static of(shape: VitrineChangesShape): VitrineChanges {
    const changed = setsOf(shape.changed);
    const removed = setsOf(shape.removed);
    return new VitrineChanges(changed, minus(removed, changed));
  }

  /**
   * Ce que dirait UNE notification portant `this` puis `later` : c'est ce que
   * fait une livraison en attente qui absorbe le balayage suivant (B3). Le
   * dernier mot gagne — changé puis retiré est retiré, retiré puis réapparu
   * est changé.
   */
  merge(later: VitrineChanges): VitrineChanges {
    const changed = minus(union(this.changed, later.changed), later.removed);
    const removed = minus(union(this.removed, later.removed), later.changed);
    return new VitrineChanges(changed, removed);
  }

  get isEmpty(): boolean {
    return VITRINE_GROUPS.every(
      (group) => this.changed[group].size === 0 && this.removed[group].size === 0,
    );
  }

  /** Triés : deux notifications identiques s'écrivent identiquement. */
  toShape(): VitrineChangesShape {
    return { changed: keysOf(this.changed), removed: keysOf(this.removed) };
  }
}

function emptySets(): Sets {
  return { items: new Set(), operations: new Set(), shelves: new Set(), texts: new Set() };
}

function setsOf(keys: VitrineElementKeys): Sets {
  return {
    items: new Set(keys.items),
    operations: new Set(keys.operations),
    shelves: new Set(keys.shelves),
    texts: new Set(keys.texts),
  };
}

function mapGroups(build: (group: VitrineGroup) => ReadonlySet<string>): Sets {
  return {
    items: build("items"),
    operations: build("operations"),
    shelves: build("shelves"),
    texts: build("texts"),
  };
}

function union(left: Sets, right: Sets): Sets {
  return mapGroups((group) => new Set([...left[group], ...right[group]]));
}

function minus(left: Sets, right: Sets): Sets {
  return mapGroups((group) => new Set([...left[group]].filter((key) => !right[group].has(key))));
}

function keysOf(sets: Sets): VitrineElementKeys {
  const sorted = (group: VitrineGroup): readonly string[] => [...sets[group]].sort();
  return {
    items: sorted("items"),
    operations: sorted("operations"),
    shelves: sorted("shelves"),
    texts: sorted("texts"),
  };
}
