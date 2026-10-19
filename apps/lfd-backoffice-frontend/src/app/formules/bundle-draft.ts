import type {
  BundleChoiceCandidateView,
  BundleChoiceStanding,
  BundleView,
  CreateBundlePayload,
  SaveBundleCompositionPayload,
} from '@lfd/contracts';

/**
 * La composition d'une formule telle qu'on la saisit. Elle se RÉÉCRIT en
 * entier (`PUT …/composition`) : ces fonctions rendent toujours une liste
 * neuve et ne mutent jamais celle qu'on leur passe — un signal ne voit que
 * les références neuves.
 */

/** Le serveur exige au moins deux groupes (`bundles.too_few_groups`). */
export const MIN_GROUPS = 2;

export interface ChoiceDraft {
  readonly sku: string;
  readonly name: string | null;
  readonly shelf: string | null;
  readonly thumbnailUrl: string | null;
  readonly standing: BundleChoiceStanding;
}

export interface GroupDraft {
  /** L'identité de la ligne à l'écran, stable même quand le libellé change. */
  readonly id: string;
  /** La clé du groupe enregistré ; `null` pour un groupe neuf. */
  readonly key: string | null;
  readonly label: string;
  readonly choices: readonly ChoiceDraft[];
}

let nextLocalId = 0;

/** Un groupe neuf, vide : sa clé sera tirée de son libellé par le serveur. */
export function newGroup(label = ''): GroupDraft {
  nextLocalId += 1;
  return { id: `new-${String(nextLocalId)}`, key: null, label, choices: [] };
}

export function groupsOf(bundle: BundleView): readonly GroupDraft[] {
  return bundle.groups.map((group) => ({
    id: group.key,
    key: group.key,
    label: group.label,
    choices: group.choices.map((choice) => ({ ...choice })),
  }));
}

export function choiceOf(candidate: BundleChoiceCandidateView): ChoiceDraft {
  return { ...candidate, standing: 'admissible' };
}

/** Échange l'élément avec son voisin (`-1` = monter, `+1` = descendre). Hors bornes : rien. */
export function swapped<T>(list: readonly T[], index: number, step: -1 | 1): readonly T[] {
  const here = list[index];
  const there = list[index + step];
  if (here === undefined || there === undefined) {
    return list;
  }
  const next = [...list];
  next[index] = there;
  next[index + step] = here;
  return next;
}

function updated(
  groups: readonly GroupDraft[],
  id: string,
  change: (group: GroupDraft) => GroupDraft,
): readonly GroupDraft[] {
  return groups.map((group) => (group.id === id ? change(group) : group));
}

export function renamed(groups: readonly GroupDraft[], id: string, label: string) {
  return updated(groups, id, (group) => ({ ...group, label }));
}

export function withoutGroup(groups: readonly GroupDraft[], id: string): readonly GroupDraft[] {
  return groups.filter((group) => group.id !== id);
}

/** Ajoute en fin de groupe ; un article déjà dans CE groupe ne se double pas (le serveur le refuserait). */
export function withChoice(groups: readonly GroupDraft[], id: string, choice: ChoiceDraft) {
  return updated(groups, id, (group) =>
    group.choices.some((kept) => kept.sku === choice.sku)
      ? group
      : { ...group, choices: [...group.choices, choice] },
  );
}

export function withoutChoice(groups: readonly GroupDraft[], id: string, sku: string) {
  return updated(groups, id, (group) => ({
    ...group,
    choices: group.choices.filter((choice) => choice.sku !== sku),
  }));
}

export function choiceMoved(
  groups: readonly GroupDraft[],
  id: string,
  index: number,
  step: -1 | 1,
) {
  return updated(groups, id, (group) => ({
    ...group,
    choices: swapped(group.choices, index, step),
  }));
}

/** Ce que le serveur lirait : libellés tels quels, l'ordre compte. */
function signature(groups: readonly GroupDraft[]): string {
  return JSON.stringify(
    groups.map((group) => [group.key, group.label, group.choices.map((c) => c.sku)]),
  );
}

export function sameComposition(a: readonly GroupDraft[], b: readonly GroupDraft[]): boolean {
  return signature(a) === signature(b);
}

export function compositionPayload(groups: readonly GroupDraft[]): SaveBundleCompositionPayload {
  return {
    groups: groups.map((group) => ({
      key: group.key,
      label: group.label.trim(),
      choices: group.choices.map((choice) => choice.sku),
    })),
  };
}

export function creationPayload(
  name: string,
  description: string,
  groups: readonly GroupDraft[],
): CreateBundlePayload {
  return {
    name: name.trim(),
    description: description.trim() === '' ? null : description.trim(),
    groups: groups.map((group) => ({
      label: group.label.trim(),
      choices: group.choices.map((choice) => choice.sku),
    })),
  };
}

/**
 * Ce qui manque à la composition pour que le serveur l'accepte — une phrase,
 * pour que le bouton fermé dise pourquoi. `null` : rien ne manque d'ici. Le
 * serveur reste juge (articles servis, doublons entre groupes).
 */
export function compositionProblem(groups: readonly GroupDraft[]): string | null {
  if (groups.length < MIN_GROUPS) {
    return `Une formule compte au moins ${String(MIN_GROUPS)} groupes : le client prend un article dans chacun.`;
  }
  if (groups.some((group) => group.label.trim() === '')) {
    return 'Chaque groupe porte un libellé (« Boisson », « Viennoiserie »…).';
  }
  if (groups.some((group) => group.choices.length === 0)) {
    return 'Chaque groupe propose au moins un article.';
  }
  return null;
}

/** Pourquoi un article choisi ne pourrait plus être ajouté ; `null` s'il est admissible. */
export function standingReason(standing: BundleChoiceStanding): string | null {
  switch (standing) {
    case 'admissible':
      return null;
    case 'not_served_to_public':
      return 'Plus servi au public';
    case 'operation_only':
      return 'Réservé aux opérations';
    case 'unknown':
      return 'Inconnu du catalogue';
  }
}

/** Les articles d'une formule qui ne sont plus admissibles. */
export function inadmissibleCount(bundle: BundleView): number {
  return bundle.groups
    .flatMap((group) => group.choices)
    .filter((choice) => choice.standing !== 'admissible').length;
}

export function articleCount(bundle: BundleView): number {
  return bundle.groups.reduce((sum, group) => sum + group.choices.length, 0);
}
