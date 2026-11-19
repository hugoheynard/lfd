import {
  AppellationAggregate,
  type AppellationSnapshot,
} from "../../domain/entities/appellation.entity.js";
import {
  IngredientAggregate,
  type IngredientSnapshot,
} from "../../domain/entities/ingredient.entity.js";
import {
  AppellationRepository,
  type AppellationRecord,
} from "../../domain/ports/appellation.repository.js";
import { ProductComposition } from "../../domain/entities/product-composition.entity.js";
import { ProductCompositionRepository } from "../../domain/ports/product-composition.repository.js";
import {
  IngredientRepository,
  type IngredientRecord,
} from "../../domain/ports/ingredient.repository.js";

/**
 * Ingrédients gardés en mémoire, **reconstitués à chaque lecture** — comme la
 * vraie base. Partagé par les suites de handlers plutôt que redéclaré : c'est
 * la même dépendance, et un double par fichier finirait par diverger du port.
 */
export class InMemoryIngredientRepository extends IngredientRepository {
  private readonly byKey = new Map<string, IngredientSnapshot>();
  private readonly citedBy = new Map<string, readonly string[]>();

  /**
   * Le dépôt d'appellations est FACULTATIF, et c'est ce qui décide de la
   * jointure : la vraie lecture résout le signe officiel en base, et une suite
   * qui ne parle pas d'appellation n'a pas à en monter une.
   */
  constructor(private readonly appellations: InMemoryAppellationRepository | null = null) {
    super();
  }

  list(): Promise<readonly IngredientRecord[]> {
    return Promise.resolve([...this.byKey.values()].map((snapshot) => this.toRecord(snapshot)));
  }

  findByKey(key: string): Promise<IngredientAggregate | null> {
    const snapshot = this.byKey.get(key);
    return Promise.resolve(snapshot === undefined ? null : IngredientAggregate.rehydrate(snapshot));
  }

  add(ingredient: IngredientAggregate): Promise<void> {
    return this.save(ingredient);
  }

  save(ingredient: IngredientAggregate): Promise<void> {
    const snapshot = ingredient.snapshot();
    this.byKey.set(snapshot.key, snapshot);
    return Promise.resolve();
  }

  /** Comme la base : seul `archived_at` change, le reste de la ligne stockée reste. */
  saveArchival(ingredient: IngredientAggregate): Promise<void> {
    const { key, archivedAt } = ingredient.snapshot();
    const stored = this.byKey.get(key);
    if (stored !== undefined) {
      this.byKey.set(key, { ...stored, archivedAt });
    }
    return Promise.resolve();
  }

  ofProduct(productId: string): Promise<readonly IngredientRecord[]> {
    const keys = this.citedBy.get(productId) ?? [];
    return Promise.resolve(
      keys.map((key) => {
        const snapshot = this.byKey.get(key);
        if (snapshot === undefined) {
          throw new Error(`fixture incohérente : « ${key} » n'existe pas`);
        }
        return this.toRecord(snapshot);
      }),
    );
  }

  /** Ce que la fiche cite, stocké — le double du dépôt des compositions y écrit. */
  citedKeys(productId: string): readonly string[] {
    return this.citedBy.get(productId) ?? [];
  }

  cite(productId: string, keys: readonly string[]): void {
    this.citedBy.set(productId, [...keys]);
  }

  /** Ce que le test relit — l'état stocké, sans repasser par une commande. */
  at(key: string): IngredientSnapshot | undefined {
    return this.byKey.get(key);
  }

  private toRecord(snapshot: IngredientSnapshot): IngredientRecord {
    return {
      ...snapshot,
      appellation: this.appellations?.snapshotOfId(snapshot.appellationId) ?? null,
      usedBy: this.citationsOf(snapshot.key),
    };
  }

  /** Combien de fiches citent la matière — ce que la vraie lecture compte. */
  private citationsOf(key: string): number {
    return [...this.citedBy.values()].filter((keys) => keys.includes(key)).length;
  }
}

/**
 * Les compositions, écrites dans le même état que les ingrédients : la vraie
 * table `product_ingredient` est lue par les deux dépôts, et deux états
 * séparés laisseraient `ofProduct` et `usedBy` ignorer ce qu'on vient de citer.
 */
export class InMemoryProductCompositionRepository extends ProductCompositionRepository {
  constructor(private readonly ingredients: InMemoryIngredientRepository) {
    super();
  }

  load(productId: string): Promise<ProductComposition> {
    return Promise.resolve(
      ProductComposition.rehydrate(productId, this.ingredients.citedKeys(productId)),
    );
  }

  save(composition: ProductComposition): Promise<void> {
    this.ingredients.cite(composition.productId, composition.keys);
    return Promise.resolve();
  }
}

/** Appellations gardées en mémoire, par code — même logique que ci-dessus. */
export class InMemoryAppellationRepository extends AppellationRepository {
  private readonly byCode = new Map<string, AppellationSnapshot>();

  list(): Promise<readonly AppellationRecord[]> {
    return Promise.resolve(
      [...this.byCode.values()].map((snapshot) => ({ ...snapshot, usedBy: 0 })),
    );
  }

  findByCode(code: string): Promise<AppellationAggregate | null> {
    const snapshot = this.byCode.get(code);
    return Promise.resolve(
      snapshot === undefined ? null : AppellationAggregate.rehydrate(snapshot),
    );
  }

  add(appellation: AppellationAggregate): Promise<void> {
    return this.save(appellation);
  }

  save(appellation: AppellationAggregate): Promise<void> {
    const snapshot = appellation.snapshot();
    this.byCode.set(snapshot.code, snapshot);
    return Promise.resolve();
  }

  /** Comme la base : seul `archived_at` change, le reste de la ligne stockée reste. */
  saveArchival(appellation: AppellationAggregate): Promise<void> {
    const { code, archivedAt } = appellation.snapshot();
    const stored = this.byCode.get(code);
    if (stored !== undefined) {
      this.byCode.set(code, { ...stored, archivedAt });
    }
    return Promise.resolve();
  }

  /** Ce que le test relit — l'état stocké, sans repasser par une commande. */
  at(code: string): AppellationSnapshot | undefined {
    return this.byCode.get(code);
  }

  /** La résolution que la base fait par jointure — l'ingrédient stocke un id. */
  snapshotOfId(id: string | null): AppellationSnapshot | null {
    if (id === null) {
      return null;
    }
    return [...this.byCode.values()].find((snapshot) => snapshot.id === id) ?? null;
  }
}
