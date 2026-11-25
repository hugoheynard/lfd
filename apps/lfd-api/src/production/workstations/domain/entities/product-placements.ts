/** Un des postes d'un produit : s'il le finit, et la place du produit dans la pile du poste. */
export interface ProductStation {
  readonly workstationId: string;
  /** Ce poste finit le produit : seul son « Fait » compte des pièces. Un seul par produit placé. */
  readonly finishes: boolean;
  /** `null` : jamais réglée — le produit vient après ceux qui en ont une, dans l'ordre reçu. */
  readonly position: number | null;
}

/** Ce qu'un couple (produit, poste) devient : sa ligne, ou `null` — le poste a quitté le produit. */
export interface PlacementChange {
  readonly productSku: string;
  readonly workstationId: string;
  readonly station: ProductStation | null;
}

/** Ce que porte une ligne (produit, poste), hors de sa clé. */
type Slot = Omit<ProductStation, "workstationId">;

/**
 * **Les postes de chaque produit**, tels que la carte les tient, et les
 * couples qu'elle a changés. Aucune règle ici : elles se jugent dans
 * `WorkstationMap`, qui seul écrit dans cette structure.
 */
export class ProductPlacements {
  private readonly byProduct = new Map<string, Map<string, Slot>>();
  private readonly changed = new Map<string, readonly [string, string]>();

  constructor(placements: ReadonlyMap<string, readonly ProductStation[]>) {
    for (const [product, stations] of placements) {
      for (const { workstationId, finishes, position } of stations) {
        this.slotsOf(product).set(workstationId, { finishes, position });
      }
    }
  }

  /** Les postes du produit, celui qui finit en premier ; vide : « à ranger ». */
  stationsOf(product: string): readonly ProductStation[] {
    const slots = this.byProduct.get(product);
    if (slots === undefined) {
      return [];
    }
    return [...slots]
      .map(([workstationId, slot]) => ({ workstationId, ...slot }))
      .sort((left, right) => Number(right.finishes) - Number(left.finishes));
  }

  /** Le poste qui finit le produit ; `null` : « à ranger ». */
  finisherOf(product: string): string | null {
    return this.stationsOf(product).find((station) => station.finishes)?.workstationId ?? null;
  }

  slotOf(product: string, workstationId: string): Slot | null {
    return this.byProduct.get(product)?.get(workstationId) ?? null;
  }

  /** Les produits qui ont une ligne chez ce poste, qu'il les finisse ou non. */
  productsOn(workstationId: string): string[] {
    return [...this.byProduct]
      .filter(([, slots]) => slots.has(workstationId))
      .map(([product]) => product);
  }

  /** Combien de produits ont au moins un poste. */
  productCount(): number {
    return this.byProduct.size;
  }

  set(product: string, workstationId: string, slot: Slot): void {
    this.slotsOf(product).set(workstationId, slot);
    this.mark(product, workstationId);
  }

  remove(product: string, workstationId: string): void {
    const slots = this.byProduct.get(product);
    if (slots?.delete(workstationId) !== true) {
      return;
    }
    if (slots.size === 0) {
      this.byProduct.delete(product);
    }
    this.mark(product, workstationId);
  }

  /** Les couples changés, chacun une fois. */
  changes(): readonly PlacementChange[] {
    return [...this.changed.values()].map(([productSku, workstationId]) => {
      const slot = this.slotOf(productSku, workstationId);
      return {
        productSku,
        workstationId,
        station: slot === null ? null : { workstationId, ...slot },
      };
    });
  }

  private slotsOf(product: string): Map<string, Slot> {
    const existing = this.byProduct.get(product);
    if (existing !== undefined) {
      return existing;
    }
    const created = new Map<string, Slot>();
    this.byProduct.set(product, created);
    return created;
  }

  private mark(product: string, workstationId: string): void {
    this.changed.set(JSON.stringify([product, workstationId]), [product, workstationId]);
  }
}
