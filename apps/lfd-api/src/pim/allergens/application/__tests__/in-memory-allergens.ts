import {
  AllergenCategory,
  type AllergenCategorySnapshot,
} from "../../domain/entities/allergen-category.js";
import { AllergenEntry, type AllergenEntrySnapshot } from "../../domain/entities/allergen-entry.js";
import {
  AllergenCatalogueReader,
  type AllergenCategoryView,
} from "../../domain/ports/allergen-catalogue.reader.js";
import { AllergenCategoryRepository } from "../../domain/ports/allergen-category.repository.js";
import { AllergenEntryRepository } from "../../domain/ports/allergen-entry.repository.js";

/**
 * Le référentiel gardé en mémoire — **une seule mémoire pour les trois ports**.
 *
 * Trois doubles indépendants laisseraient une entrée créée par un handler
 * invisible du lecteur de catalogue, et la garde d'archivage (« aucune entrée
 * encore proposée ne cite cette catégorie ») ne serait alors jamais éprouvée :
 * elle passerait sur un catalogue toujours vide. C'est exactement la panne que
 * ce store partagé rend impossible.
 *
 * Les agrégats sont **reconstitués à chaque lecture**, comme la vraie base : un
 * handler ne peut pas muter par inadvertance l'objet d'un autre.
 */
export class AllergenStore {
  readonly categories = new Map<string, AllergenCategorySnapshot>();
  readonly entries = new Map<string, AllergenEntrySnapshot>();

  /** Sème une catégorie OFFICIELLE — l'agrégat, lui, refuse d'en déclarer une. */
  seedOfficialCategory(id: string, key: string, incoCategory: string | null): AllergenCategory {
    const category = AllergenCategory.reconstitute({
      id,
      key,
      name: { fr: key, en: key },
      incoCategory,
      official: true,
      position: this.categories.size + 1,
      archivedAt: null,
    });
    this.categories.set(id, category.snapshot());
    return category;
  }

  /** Sème une entrée OFFICIELLE, rattachée à `categoryId`. */
  seedOfficialEntry(id: string, code: string, categoryId: string): AllergenEntry {
    const entry = AllergenEntry.reconstitute({
      id,
      code,
      name: { fr: code, en: code },
      categoryId,
      official: true,
      archivedAt: null,
    });
    this.entries.set(id, entry.snapshot());
    return entry;
  }
}

export class InMemoryAllergenCategoryRepository extends AllergenCategoryRepository {
  constructor(private readonly store: AllergenStore) {
    super();
  }

  findById(id: string): Promise<AllergenCategory | null> {
    const snapshot = this.store.categories.get(id);
    return Promise.resolve(snapshot === undefined ? null : AllergenCategory.reconstitute(snapshot));
  }

  findByKey(key: string): Promise<AllergenCategory | null> {
    const snapshot = [...this.store.categories.values()].find((row) => row.key === key);
    return Promise.resolve(snapshot === undefined ? null : AllergenCategory.reconstitute(snapshot));
  }

  add(category: AllergenCategory): Promise<void> {
    return this.save(category);
  }

  save(category: AllergenCategory): Promise<void> {
    this.store.categories.set(category.id, category.snapshot());
    return Promise.resolve();
  }
}

export class InMemoryAllergenEntryRepository extends AllergenEntryRepository {
  constructor(private readonly store: AllergenStore) {
    super();
  }

  findById(id: string): Promise<AllergenEntry | null> {
    const snapshot = this.store.entries.get(id);
    return Promise.resolve(snapshot === undefined ? null : AllergenEntry.reconstitute(snapshot));
  }

  findByCode(code: string): Promise<AllergenEntry | null> {
    const snapshot = [...this.store.entries.values()].find((row) => row.code === code);
    return Promise.resolve(snapshot === undefined ? null : AllergenEntry.reconstitute(snapshot));
  }

  add(entry: AllergenEntry): Promise<void> {
    return this.save(entry);
  }

  save(entry: AllergenEntry): Promise<void> {
    this.store.entries.set(entry.id, entry.snapshot());
    return Promise.resolve();
  }
}

/**
 * Le catalogue coud les deux listes, ordonné comme l'adaptateur Prisma —
 * position puis clé, entrées par code. Les tests d'ordre d'affichage y sont
 * donc justes, et ceux de contenu ne dépendent pas d'un hasard de `Map`.
 */
export class InMemoryAllergenCatalogueReader extends AllergenCatalogueReader {
  constructor(private readonly store: AllergenStore) {
    super();
  }

  catalogue(): Promise<readonly AllergenCategoryView[]> {
    const categories = [...this.store.categories.values()].sort(
      (a, b) => a.position - b.position || a.key.localeCompare(b.key),
    );
    return Promise.resolve(
      categories.map((category) => ({
        ...category,
        entries: [...this.store.entries.values()]
          .filter((entry) => entry.categoryId === category.id)
          .sort((a, b) => a.code.localeCompare(b.code))
          .map(({ categoryId, ...entry }) => {
            void categoryId;
            return entry;
          }),
      })),
    );
  }

  knownCodes(): Promise<ReadonlySet<string>> {
    return Promise.resolve(new Set([...this.store.entries.values()].map((entry) => entry.code)));
  }
}
