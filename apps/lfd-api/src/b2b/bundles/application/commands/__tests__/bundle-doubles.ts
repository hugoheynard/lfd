import { Bundle } from "../../../domain/entities/bundle.js";
import { BundleKeyTakenError } from "../../../domain/errors/bundle-errors.js";
import type {
  BundleChoiceArticle,
  BundleChoiceVerdict,
} from "../../../domain/ports/bundle-choice-article.js";
import { BundleChoiceCatalogue } from "../../../domain/ports/bundle-choice.catalogue.js";
import { BundleChoiceSearch } from "../../../domain/ports/bundle-choice.search.js";
import { BundleReader } from "../../../domain/ports/bundle.reader.js";
import { BundleRepository } from "../../../domain/ports/bundle.repository.js";
import type { BundleSnapshot } from "../../../domain/entities/bundle-shapes.js";

/**
 * Le dépôt en mémoire. Il garde des agrégats relus par `reconstitute` : un
 * handler qui muterait l'agrégat sans le rendre au port ne passerait pas pour
 * avoir écrit.
 */
export class InMemoryBundles extends BundleRepository {
  readonly rows = new Map<string, Bundle>();
  adds = 0;
  saves = 0;

  constructor(seed: readonly Bundle[] = []) {
    super();
    for (const bundle of seed) {
      this.rows.set(bundle.key, copyOf(bundle));
    }
  }

  load(key: string): Promise<Bundle | null> {
    const found = this.rows.get(key);
    return Promise.resolve(found === undefined ? null : copyOf(found));
  }

  add(bundle: Bundle): Promise<void> {
    if (this.rows.has(bundle.key)) {
      return Promise.reject(new BundleKeyTakenError(bundle.key));
    }
    this.adds += 1;
    this.rows.set(bundle.key, copyOf(bundle));
    return Promise.resolve();
  }

  save(bundle: Bundle): Promise<void> {
    this.saves += 1;
    this.rows.set(bundle.key, copyOf(bundle));
    return Promise.resolve();
  }

  /** L'état écrit — ou une erreur de test si rien ne l'a été. */
  stored(key: string): BundleSnapshot {
    const found = this.rows.get(key);
    if (found === undefined) {
      throw new RangeError(`aucune formule « ${key} » écrite`);
    }
    return found.snapshot();
  }
}

/** Le port de lecture, sur le même stockage que le dépôt. */
export class InMemoryBundleReader extends BundleReader {
  constructor(private readonly bundles: InMemoryBundles) {
    super();
  }

  list(): Promise<readonly BundleSnapshot[]> {
    return Promise.resolve([...this.bundles.rows.values()].map((bundle) => bundle.snapshot()));
  }

  find(key: string): Promise<BundleSnapshot | null> {
    return Promise.resolve(this.bundles.rows.get(key)?.snapshot() ?? null);
  }
}

/** Un article du catalogue, vu par les formules. */
export function article(
  sku: string,
  verdict: BundleChoiceVerdict = "admissible",
): BundleChoiceArticle {
  return { sku, name: `Article ${sku}`, shelf: "Rayon", thumbnailUrl: null, verdict };
}

/** Le catalogue réduit aux articles qu'on lui donne ; compte les SKU qu'on lui demande. */
export class FixedChoiceCatalogue extends BundleChoiceCatalogue {
  readonly asked: (readonly string[])[] = [];

  constructor(private readonly articles: readonly BundleChoiceArticle[]) {
    super();
  }

  articlesAmong(skus: readonly string[]): Promise<ReadonlyMap<string, BundleChoiceArticle>> {
    this.asked.push(skus);
    return Promise.resolve(
      new Map(
        this.articles
          .filter((entry) => skus.includes(entry.sku))
          .map((entry) => [entry.sku, entry]),
      ),
    );
  }
}

/** La recherche, sur la même liste ; garde la dernière demande. */
export class FixedChoiceSearch extends BundleChoiceSearch {
  lastAsk: { readonly term: string; readonly limit: number } | null = null;

  constructor(private readonly articles: readonly BundleChoiceArticle[]) {
    super();
  }

  search(term: string, limit: number): Promise<readonly BundleChoiceArticle[]> {
    this.lastAsk = { term, limit };
    return Promise.resolve(this.articles.slice(0, limit));
  }
}

/** Les articles du petit déjeuner, tous admissibles. */
export const BREAKFAST_ARTICLES = [
  "VIE-001-1",
  "VIE-002-1",
  "PAI-001-1",
  "BOI-001-1",
  "BOI-002-1",
].map((sku) => article(sku));

function copyOf(bundle: Bundle): Bundle {
  return Bundle.reconstitute({ ...bundle.snapshot() });
}
