import { readLocalized, type Locale } from "@lfd/pim-contracts";

import type {
  IncoProjector,
  OutsideAnnexLabel,
} from "../../../allergens/domain/services/inco-projector.js";
import type { IncoCategory } from "../../../allergens/domain/value-objects/inco-category.js";
import type { VariantAllergenSheetSnapshot } from "../../product/domain/entities/variant.js";
import type { LocalizedText } from "../../shared/domain/value-objects/localized-text.js";

/** Ce qu'une case dit. */
export type MatrixPresence = "contains" | "traces" | "absent";

/** L'état d'une ligne — cf. `AllergenMatrixRowState` du contrat. */
export type MatrixRowState = "not_declared" | "none_declared" | "to_review" | "declared";

export interface MatrixCell {
  readonly category: IncoCategory;
  readonly presence: MatrixPresence;
  readonly contains: readonly string[];
  readonly traces: readonly string[];
}

/** La colonne « Autres » : ce qui est déclaré hors annexe II, nommé (Q3). */
export interface MatrixOthersCell {
  readonly presence: MatrixPresence;
  readonly contains: readonly OutsideAnnexLabel[];
  readonly traces: readonly OutsideAnnexLabel[];
}

export interface MatrixRowJudgement {
  readonly state: MatrixRowState;
  readonly cells: readonly MatrixCell[];
  readonly others: MatrixOthersCell | null;
}

/**
 * Les deux catégories dont l'annexe II impose de NOMMER le contenu — la
 * céréale, le fruit à coque (objection BLOQUANTE de vitruve, plan §6). Pour
 * les autres, le signe suffit.
 */
export const NAMED_CATEGORIES: ReadonlySet<IncoCategory> = new Set<IncoCategory>([
  "gluten",
  "tree_nuts",
]);

/** Ce dont une ligne a besoin pour se juger : le rangement et les noms d'entrées. */
export interface MatrixRanking {
  readonly projector: IncoProjector;
  readonly columns: readonly IncoCategory[];
  /** Code → libellé granulaire, entrées archivées comprises. */
  readonly entryNames: ReadonlyMap<string, LocalizedText>;
  readonly locale: Locale;
}

/**
 * **Juge une déclaration RÉSOLUE** — pure, sans base et sans horloge.
 *
 * 🔴 Un seul rangement : `IncoProjector` (plan §2). Les précisions nommées le
 * réinterrogent code par code, et la colonne « Autres » lit son
 * `outsideAnnex` ; rien ne se range à côté de lui.
 *
 * « À revoir » = un code rangé NULLE PART (Q3, qui l'emporte sur §1 : un code
 * hors annexe mais connu se nomme dans « Autres », il ne se revoit pas).
 *
 * `null` = personne n'a rien déclaré (ni la déclinaison, ni le défaut qu'elle
 * suit) : aucune case — une case vide se lirait « absent ».
 */
export function judgeDeclaration(
  sheet: VariantAllergenSheetSnapshot | null,
  ranking: MatrixRanking,
): MatrixRowJudgement {
  if (sheet === null) {
    return { state: "not_declared", cells: [], others: null };
  }
  const declared = ranking.projector.project(sheet.declared);
  const traces = ranking.projector.project(sheet.mayContain);
  const declaredOutside = ranking.projector.outsideAnnex(sheet.declared);
  const tracesOutside = ranking.projector.outsideAnnex(sheet.mayContain);
  const unknown = declaredOutside.unknown.length + tracesOutside.unknown.length > 0;
  const contained = new Set(declared.labels.map((label) => label.category));
  const traced = new Set(traces.labels.map((label) => label.category));
  const cells = ranking.columns.map((category) =>
    cellOf(category, contained, traced, sheet, ranking),
  );
  const others: MatrixOthersCell = {
    presence: presenceOf(declaredOutside.named.length > 0, tracesOutside.named.length > 0),
    contains: declaredOutside.named,
    traces: tracesOutside.named,
  };
  return { state: stateOf(sheet, unknown), cells, others };
}

/** Contenir l'emporte : une trace n'est jamais une présence. */
function presenceOf(contains: boolean, traces: boolean): MatrixPresence {
  if (contains) {
    return "contains";
  }
  return traces ? "traces" : "absent";
}

function stateOf(sheet: VariantAllergenSheetSnapshot, unknown: boolean): MatrixRowState {
  if (unknown) {
    return "to_review";
  }
  // « Aucun » est l'affirmation entière : ni allergène, ni trace. Une trace
  // seule n'est pas « aucun allergène » — ses cases parlent.
  return sheet.declared.length === 0 && sheet.mayContain.length === 0
    ? "none_declared"
    : "declared";
}

function cellOf(
  category: IncoCategory,
  contained: ReadonlySet<IncoCategory>,
  traced: ReadonlySet<IncoCategory>,
  sheet: VariantAllergenSheetSnapshot,
  ranking: MatrixRanking,
): MatrixCell {
  // Une présence n'est pas affaiblie par une trace d'une autre céréale.
  const presence = presenceOf(contained.has(category), traced.has(category));
  if (!NAMED_CATEGORIES.has(category)) {
    return { category, presence, contains: [], traces: [] };
  }
  return {
    category,
    presence,
    contains: namesIn(category, sheet.declared, ranking),
    traces: namesIn(category, sheet.mayContain, ranking),
  };
}

/** Les libellés granulaires des codes que `IncoProjector` range dans `category`. */
function namesIn(
  category: IncoCategory,
  codes: readonly string[],
  ranking: MatrixRanking,
): string[] {
  const names: string[] = [];
  for (const code of codes) {
    const [label] = ranking.projector.project([code]).labels;
    const name = ranking.entryNames.get(code);
    if (label?.category === category && name !== undefined) {
      names.push(readLocalized(name, ranking.locale));
    }
  }
  return names;
}
