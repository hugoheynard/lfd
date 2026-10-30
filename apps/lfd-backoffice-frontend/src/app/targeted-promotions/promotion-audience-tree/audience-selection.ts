import type { PromotionAudienceKindValue, PromotionAudienceTargetView } from '@lfd/contracts';

/**
 * **Le public de l'éditeur, en cases à cocher en étages** (plan
 * `documentation/pricing/plan-promotions-par-audience-et-acheminement.md`,
 * § 15.9, lot L8b) — pur.
 *
 * L'arbre a quatre feuilles — la partition de la clientèle — et deux
 * branches au-dessus, sous « Tout le monde ». Une société n'en est pas une
 * feuille (elle peut être active ou en attente) : elle vit à côté, sous Pros.
 *
 * La valeur que l'éditeur garde et envoie est l'ENSEMBLE MINIMAL : tous les
 * enfants d'un parent ⇒ le parent. Le serveur ramène tout public à cette
 * forme de toute façon ; l'envoyer déjà minimal rend l'écran et la fiche
 * identiques à ce qui sera stocké.
 */

export type AudienceLeaf =
  'individuals_guest' | 'individuals_registered' | 'pros_active' | 'pros_pending';

export type AudienceBranch = 'individuals' | 'pros';

/** Une case de l'arbre : la racine, une branche, ou une feuille. */
export type AudienceBox = 'everyone' | AudienceBranch | AudienceLeaf;

export const BRANCH_LEAVES: Readonly<Record<AudienceBranch, readonly AudienceLeaf[]>> = {
  individuals: ['individuals_guest', 'individuals_registered'],
  pros: ['pros_active', 'pros_pending'],
};

const ALL_LEAVES: readonly AudienceLeaf[] = [...BRANCH_LEAVES.individuals, ...BRANCH_LEAVES.pros];

/** Les feuilles que couvre un public de clientèle ; `[]` pour une société. */
function leavesOf(kind: PromotionAudienceKindValue): readonly AudienceLeaf[] {
  switch (kind) {
    case 'everyone':
      return ALL_LEAVES;
    case 'individuals':
    case 'pros':
      return BRANCH_LEAVES[kind];
    case 'everyone_but_active_pros':
      return ['individuals_guest', 'individuals_registered', 'pros_pending'];
    case 'company':
    case 'company_and_sites':
      return [];
    default:
      return [kind];
  }
}

const isCompany = (target: PromotionAudienceTargetView): boolean =>
  target.kind === 'company' || target.kind === 'company_and_sites';

/** Les feuilles couvertes par un public. */
export function coveredLeaves(
  audiences: readonly PromotionAudienceTargetView[],
): ReadonlySet<AudienceLeaf> {
  return new Set(audiences.flatMap((target) => leavesOf(target.kind)));
}

/**
 * **L'ensemble minimal** : les feuilles cochées remontées au plus large
 * parent complet (les quatre ⇒ « Tout le monde »), puis les sociétés.
 * « Tout le monde » est exclusif : il ne garde aucune société.
 */
export function minimalAudiences(
  leaves: ReadonlySet<AudienceLeaf>,
  companies: readonly PromotionAudienceTargetView[] = [],
): PromotionAudienceTargetView[] {
  const target = (kind: PromotionAudienceKindValue): PromotionAudienceTargetView => ({
    kind,
    companyId: null,
  });
  if (ALL_LEAVES.every((leaf) => leaves.has(leaf))) {
    return [target('everyone')];
  }
  const branches = (['individuals', 'pros'] as const).flatMap((branch) => {
    const members = BRANCH_LEAVES[branch];
    if (members.every((leaf) => leaves.has(leaf))) {
      return [target(branch)];
    }
    return members.filter((leaf) => leaves.has(leaf)).map(target);
  });
  return [...branches, ...companies.filter(isCompany)];
}

/** L'état d'une case : cochée, partielle (`indeterminate`), grisée. */
export interface BoxState {
  readonly checked: boolean;
  readonly indeterminate: boolean;
  readonly disabled: boolean;
}

/**
 * L'état de chaque case pour ce public : un parent coché coche ET grise ses
 * enfants ; certains enfants cochés le rendent partiel ; « Tout le monde »
 * coché grise tout le reste.
 */
export function boxStateOf(
  box: AudienceBox,
  audiences: readonly PromotionAudienceTargetView[],
): BoxState {
  const leaves = coveredLeaves(audiences);
  const everyone = ALL_LEAVES.every((leaf) => leaves.has(leaf));
  if (box === 'everyone') {
    return { checked: everyone, indeterminate: !everyone && leaves.size > 0, disabled: false };
  }
  if (box === 'individuals' || box === 'pros') {
    const members = BRANCH_LEAVES[box];
    const all = members.every((leaf) => leaves.has(leaf));
    const some = members.some((leaf) => leaves.has(leaf));
    return { checked: all, indeterminate: some && !all, disabled: everyone };
  }
  const branch: AudienceBranch = BRANCH_LEAVES.individuals.includes(box) ? 'individuals' : 'pros';
  const branchFull = BRANCH_LEAVES[branch].every((leaf) => leaves.has(leaf));
  return { checked: leaves.has(box), indeterminate: false, disabled: everyone || branchFull };
}

/** Cocher ou décocher une case : la nouvelle valeur, minimale. */
export function toggledAudiences(
  audiences: readonly PromotionAudienceTargetView[],
  box: AudienceBox,
  checked: boolean,
): PromotionAudienceTargetView[] {
  if (box === 'everyone') {
    return checked ? minimalAudiences(new Set(ALL_LEAVES)) : [];
  }
  const leaves = new Set(coveredLeaves(audiences));
  const touched = box === 'individuals' || box === 'pros' ? BRANCH_LEAVES[box] : [box];
  for (const leaf of touched) {
    if (checked) {
      leaves.add(leaf);
    } else {
      leaves.delete(leaf);
    }
  }
  return minimalAudiences(leaves, audiences.filter(isCompany));
}

/** La société nommée du public, s'il y en a une : l'éditeur en propose une. */
export function namedCompanyOf(
  audiences: readonly PromotionAudienceTargetView[],
): PromotionAudienceTargetView | null {
  return audiences.find(isCompany) ?? null;
}

/**
 * Nommer (ou retirer) LA société du public : `null` la retire ; sinon son
 * identifiant tel que saisi, et « ± ses sites ».
 */
export function withCompany(
  audiences: readonly PromotionAudienceTargetView[],
  company: { readonly companyId: string; readonly withSites: boolean } | null,
): PromotionAudienceTargetView[] {
  const kept = audiences.filter((target) => !isCompany(target));
  if (company === null || leavesOf('everyone').every((leaf) => coveredLeaves(kept).has(leaf))) {
    return kept;
  }
  return [
    ...kept,
    {
      kind: company.withSites ? 'company_and_sites' : 'company',
      companyId: company.companyId,
    },
  ];
}

/** Le public touche-t-il cette branche ? Une société est sous Pros. */
export function touchesBranch(
  audiences: readonly PromotionAudienceTargetView[],
  branch: AudienceBranch,
): boolean {
  const leaves = coveredLeaves(audiences);
  const some = BRANCH_LEAVES[branch].some((leaf) => leaves.has(leaf));
  return branch === 'pros' ? some || audiences.some(isCompany) : some;
}
