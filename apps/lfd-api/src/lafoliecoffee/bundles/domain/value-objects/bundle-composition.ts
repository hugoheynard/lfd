import {
  BundleTooFewGroupsError,
  DuplicateBundleChoiceError,
  DuplicateBundleGroupError,
  EmptyBundleGroupError,
  InvalidBundleTextError,
  UnknownBundleGroupError,
} from "../errors/bundle-errors.js";
import { keyFrom } from "./bundle-key.js";
import { BUNDLE_GROUP_LABEL_MAX_LENGTH, boundedText } from "./bundle-text.js";

/** Le moins de groupes qu'une formule compte : sinon c'est un article (§4.1). */
export const BUNDLE_MIN_GROUPS = 2;

const LABEL_FIELD = "Le libellé d'un groupe";

/** Un groupe tel que la formule le tient : sa clé, son libellé, ses choix dans l'ordre. */
export interface BundleGroup {
  readonly key: string;
  readonly label: string;
  /** Des SKU du catalogue, dans l'ordre de l'écran — jamais une famille (D2). */
  readonly choices: readonly string[];
}

/**
 * Un groupe tel que l'écran le demande. `key: null` = un groupe NEUF, dont la
 * clé se tire du libellé ; une clé donnée désigne un groupe qui existe déjà,
 * et la garde quel que soit son nouveau libellé.
 */
export interface BundleGroupDraft {
  readonly key: string | null;
  readonly label: string;
  readonly choices: readonly string[];
}

/**
 * **La composition d'une formule**, jugée en entier — les invariants du §4.1
 * qui ne dépendent pas du catalogue : au moins deux groupes, au moins un choix
 * par groupe, des clés de groupe distinctes, un article une seule fois dans
 * toute la formule, des libellés non vides et bornés.
 *
 * Jugée EN ENTIER, et c'est voulu : une formule se compose par l'écran, qui
 * envoie l'état voulu. Des gestes un par un traverseraient des états que
 * l'invariant refuse (une formule naît avec deux groupes — retirer le second
 * pour le remplacer serait refusé).
 *
 * @param known les clés des groupes qui existent déjà ; une clé donnée hors
 *   de cette liste ne désigne rien.
 */
export function composeGroups(
  drafts: readonly BundleGroupDraft[],
  known: ReadonlySet<string>,
): readonly BundleGroup[] {
  if (drafts.length < BUNDLE_MIN_GROUPS) {
    throw new BundleTooFewGroupsError(drafts.length);
  }
  const groups = drafts.map((draft) => groupOf(draft, known));
  assertDistinctKeys(groups);
  assertEachChoiceOnce(groups);
  return groups;
}

function groupOf(draft: BundleGroupDraft, known: ReadonlySet<string>): BundleGroup {
  const label = boundedText(draft.label, LABEL_FIELD, BUNDLE_GROUP_LABEL_MAX_LENGTH);
  if (draft.key !== null && !known.has(draft.key)) {
    throw new UnknownBundleGroupError(draft.key);
  }
  const key = draft.key ?? keyFrom(label);
  if (key === "") {
    // Un libellé sans lettre latine ni chiffre (« ☕ ») ne donne aucune clé.
    throw new InvalidBundleTextError(LABEL_FIELD, BUNDLE_GROUP_LABEL_MAX_LENGTH);
  }
  const choices = draft.choices.map((sku) => sku.trim()).filter((sku) => sku !== "");
  if (choices.length === 0) {
    throw new EmptyBundleGroupError(label);
  }
  return { key, label, choices };
}

function assertDistinctKeys(groups: readonly BundleGroup[]): void {
  const seen = new Set<string>();
  for (const group of groups) {
    if (seen.has(group.key)) {
      throw new DuplicateBundleGroupError(group.key);
    }
    seen.add(group.key);
  }
}

function assertEachChoiceOnce(groups: readonly BundleGroup[]): void {
  const seen = new Set<string>();
  for (const sku of groups.flatMap((group) => group.choices)) {
    if (seen.has(sku)) {
      throw new DuplicateBundleChoiceError(sku);
    }
    seen.add(sku);
  }
}

/** Les SKU de toute la formule, dans l'ordre des groupes puis des choix. */
export function choicesOf(groups: readonly BundleGroup[]): readonly string[] {
  return groups.flatMap((group) => group.choices);
}
