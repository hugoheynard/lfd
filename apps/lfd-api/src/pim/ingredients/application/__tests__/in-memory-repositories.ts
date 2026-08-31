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

  remove(key: string): Promise<void> {
    this.byKey.delete(key);
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

  setOfProduct(productId: string, keys: readonly string[]): Promise<void> {
    this.citedBy.set(productId, [...keys]);
    return Promise.resolve();
  }

  /** Ce que le test relit — l'état stocké, sans repasser par une commande. */
  at(key: string): IngredientSnapshot | undefined {
    return this.byKey.get(key);
  }

  private toRecord(snapshot: IngredientSnapshot): IngredientRecord {
    return { ...snapshot, appellation: null, usedBy: 0 };
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

  idOfCode(code: string): Promise<string | null> {
    return Promise.resolve(this.byCode.get(code)?.id ?? null);
  }

  add(appellation: AppellationAggregate): Promise<void> {
    return this.save(appellation);
  }

  save(appellation: AppellationAggregate): Promise<void> {
    const snapshot = appellation.snapshot();
    this.byCode.set(snapshot.code, snapshot);
    return Promise.resolve();
  }

  remove(code: string): Promise<void> {
    this.byCode.delete(code);
    return Promise.resolve();
  }

  /** Ce que le test relit — l'état stocké, sans repasser par une commande. */
  at(code: string): AppellationSnapshot | undefined {
    return this.byCode.get(code);
  }
}
