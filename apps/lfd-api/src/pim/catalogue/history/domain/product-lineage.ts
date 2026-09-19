import { TechnicalError } from "../../../../platform/shared/errors/app-error.js";
import { PIM_EVENTS, type PimSubjectType } from "../../../journal/pim-journal.js";
import type { HistoryFact, HistoryThread } from "../../../journal/product-history-journal.js";

/** Une chose dont la fiche hérite, nommée comme on l'affiche aujourd'hui. */
export interface LineageLink {
  /** L'identifiant sous lequel le journal l'adresse : id, clé ou code. */
  readonly id: string;
  readonly label: string;
}

/** Une révision du catalogue, sous ses DEUX adresses au journal. */
export interface RevisionMark {
  /** Sujet de `catalog_revision.pushed`. */
  readonly id: string;
  /** Sujet de `catalog_revision.taken` — posé avant que l'id n'existe. */
  readonly hash: string;
}

/**
 * **Ce qu'une fiche porte aujourd'hui**, et qui peut donc la toucher sans la
 * nommer.
 *
 * Résolu par le référentiel dans ses propres tables ; l'historique ne fait
 * qu'en tirer des fils. « Aujourd'hui » est voulu (plan du journal, lot 3) :
 * une famille quittée, un taux qu'elle n'applique plus n'ont plus de prise sur
 * elle, et les y garder raconterait l'histoire d'une autre fiche.
 */
export interface ProductLineage {
  readonly productId: string;
  /** Sa famille d'abord, puis chacun de ses ancêtres. */
  readonly categories: readonly LineageLink[];
  /** Les taux qu'elle applique, contexte par contexte — dérogation comprise. */
  readonly vatRates: readonly LineageLink[];
  /** Les ingrédients qu'elle cite — adressés par leur clé. */
  readonly ingredients: readonly LineageLink[];
  /** Les appellations de ces ingrédients — adressées par leur code. */
  readonly appellations: readonly LineageLink[];
  /** Les révisions dont la photo contient une de ses déclinaisons. */
  readonly revisions: readonly RevisionMark[];
}

export type InheritedKind = "category" | "vat_rate" | "ingredient" | "appellation";

/** Le cercle d'un fait — la même forme que le contrat. */
export type HistoryPlacement =
  | { readonly circle: "product" }
  | {
      readonly circle: "inherited";
      readonly inheritedFrom: {
        readonly kind: InheritedKind;
        readonly id: string;
        readonly label: string;
      };
    }
  | { readonly circle: "revision" };

/**
 * Les héritages, en DONNÉES : un héritage de plus est une ligne ici, pas une
 * branche dans la lecture ni dans l'adaptateur.
 *
 * Le préfixe garde chaque fil dans le référentiel : un fait d'un autre bloc
 * portant le même sujet n'y entre pas.
 */
const INHERITANCES: readonly {
  readonly kind: InheritedKind;
  readonly subjectType: PimSubjectType;
  readonly prefix: string;
  readonly links: (lineage: ProductLineage) => readonly LineageLink[];
}[] = [
  {
    kind: "category",
    subjectType: "product_category",
    prefix: "product_category.",
    links: (lineage) => lineage.categories,
  },
  {
    kind: "vat_rate",
    subjectType: "vat_rate",
    prefix: "vat_rate.",
    links: (lineage) => lineage.vatRates,
  },
  {
    kind: "ingredient",
    subjectType: "ingredient",
    prefix: "ingredient.",
    links: (lineage) => lineage.ingredients,
  },
  {
    kind: "appellation",
    subjectType: "appellation",
    prefix: "appellation.",
    links: (lineage) => lineage.appellations,
  },
];

/**
 * Les faits propres à la fiche. Par **préfixe** et pas par le seul sujet : la
 * plateforme marchande parle aussi de produits, sous ses propres droits.
 *
 * `variant.*` en est (Hugo, 2026-09-19 : « tout doit être journalisé ») : une
 * déclinaison ajoutée, renommée ou alignée est un fait DE la fiche — son sujet
 * est le produit, seul son type la distingue.
 */
const OWN_FACTS_PREFIXES = ["product.", "variant."] as const;

const PRODUCT: HistoryPlacement = { circle: "product" };
const REVISION: HistoryPlacement = { circle: "revision" };

/**
 * **L'historique d'une fiche, en fils et en cercles.**
 *
 * Il tire de la lignée les fils que le journal doit lire, et replace chaque
 * fait relu dans son cercle. Les deux viennent de la même table de placements :
 * un fil lu sans cercle, ou un cercle sans fil, ne peuvent pas exister.
 */
export class ProductHistoryMap {
  private constructor(
    readonly threads: readonly HistoryThread[],
    private readonly placements: ReadonlyMap<string, HistoryPlacement>,
  ) {}

  static of(lineage: ProductLineage): ProductHistoryMap {
    const placements = new Map<string, HistoryPlacement>();
    const threads: HistoryThread[] = [];
    const weave = (
      subjectType: PimSubjectType,
      entries: readonly (readonly [string, HistoryPlacement])[],
      types: HistoryThread["types"],
    ): void => {
      if (entries.length === 0) {
        return;
      }
      for (const [subjectId, placement] of entries) {
        placements.set(keyOf(subjectType, subjectId), placement);
      }
      threads.push({ subjectType, subjectIds: entries.map(([id]) => id), types });
    };

    for (const prefix of OWN_FACTS_PREFIXES) {
      weave("product", [[lineage.productId, PRODUCT]], { prefix });
    }
    for (const inheritance of INHERITANCES) {
      const entries = inheritance
        .links(lineage)
        .map(
          (link) =>
            [
              link.id,
              { circle: "inherited", inheritedFrom: { kind: inheritance.kind, ...link } },
            ] as const,
        );
      weave(inheritance.subjectType, entries, { prefix: inheritance.prefix });
    }
    weave(
      "catalog_revision",
      lineage.revisions.map((revision) => [revision.hash, REVISION] as const),
      { exactly: [PIM_EVENTS.catalogRevisionTaken] },
    );
    weave(
      "catalog_revision",
      lineage.revisions.map((revision) => [revision.id, REVISION] as const),
      { exactly: [PIM_EVENTS.catalogRevisionPushed] },
    );
    return new ProductHistoryMap(threads, placements);
  }

  /**
   * Le cercle d'un fait relu.
   *
   * @throws {HistoryFactOutsideLineageError} le fait n'appartient à aucun fil —
   *   le journal a rendu autre chose que ce qu'on lui a demandé.
   */
  place(fact: HistoryFact): HistoryPlacement {
    const placement = this.placements.get(keyOf(fact.subjectType, fact.subjectId));
    if (placement === undefined) {
      throw new HistoryFactOutsideLineageError(fact.id);
    }
    return placement;
  }
}

/**
 * Sans ambiguïté malgré un identifiant libre : la sorte de sujet est une valeur
 * close, qui ne porte jamais de `:`.
 */
function keyOf(subjectType: string, subjectId: string): string {
  return `${subjectType}:${subjectId}`;
}

/**
 * Le journal a rendu un fait qu'aucun fil ne demandait. Une panne de
 * l'adaptateur, pas une donnée : on refuse plutôt que de ranger le fait dans
 * un cercle inventé.
 */
export class HistoryFactOutsideLineageError extends TechnicalError {
  constructor(readonly factId: string) {
    super(
      "pim.history.fact_outside_lineage",
      `Le fait « ${factId} » n'appartient à aucun fil de cet historique : la lecture du journal est à vérifier.`,
    );
  }
}
