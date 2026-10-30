import type {
  PromotionAudienceTargetView,
  PromotionEffectKindValue,
  PromotionFulfillmentKindValue,
  PromotionScopeTargetValue,
  PromotionTermsPayload,
  PromotionView,
} from '@lfd/contracts';

import { businessDayStart } from '../shared/business-day';
import { parisToday } from '../shared/paris-today';
import { minimalAudiences, touchesBranch } from './promotion-audience-tree/audience-selection';

/**
 * **Le brouillon de l'éditeur des promotions** (plan
 * `documentation/pricing/plan-promotions-par-audience-et-acheminement.md`,
 * § 13.9, lot L8) — pur : ce que l'écran saisit, dans les unités qu'un
 * humain tape (« 20 » pour −20 %, « 0,50 » pour 50 centimes), et sa
 * traduction vers le corps que le serveur attend.
 *
 * Il ne juge que la FORME (un nombre lisible, une date) : les invariants —
 * point ⇔ acheminement, effet ⇔ point, « seulement » non vide, famille dans
 * le sens du mode, chevauchement — sont tenus par l'agrégat, dont le refus
 * nommé revient tel quel à l'écran.
 */

export interface PromotionScopeRuleDraft {
  readonly target: PromotionScopeTargetValue;
  readonly targetId: string;
  readonly eligible: boolean;
}

export interface PromotionDraft {
  readonly internalName: string;
  readonly labelFr: string;
  readonly labelEn: string;
  readonly labelIt: string;
  /** Le libellé Particuliers (L8b) ; vide = le commun. */
  readonly individualsFr: string;
  readonly individualsEn: string;
  readonly individualsIt: string;
  /** Le libellé Pros (L8b) ; vide = le commun. */
  readonly prosFr: string;
  readonly prosEn: string;
  readonly prosIt: string;
  /** Le motif, au journal ; vide = aucun. */
  readonly reason: string;
  readonly effectKind: PromotionEffectKindValue;
  /** Dans l'unité affichée : des pour-cent, ou des euros. */
  readonly effectValue: string;
  /** `AAAA-MM-JJ`, minuit à Paris — borne incluse. */
  readonly validFrom: string;
  /** `AAAA-MM-JJ`, le premier jour NON couvert ; vide = sans fin. */
  readonly validTo: string;
  /** Le public, ensemble minimal (L8b) ; une société garde son identifiant tel que saisi. */
  readonly audiences: readonly PromotionAudienceTargetView[];
  readonly fulfillmentKind: PromotionFulfillmentKindValue;
  readonly pickupId: string;
  readonly scopeMode: 'all_except' | 'only';
  readonly rules: readonly PromotionScopeRuleDraft[];
  /** Vide = aucune condition de quantité. */
  readonly minQuantity: string;
  readonly stacksOverMercuriale: boolean;
  /** Cumulable avec les autres promotions cumulables (§ 16) — point ligne seulement. */
  readonly cumulative: boolean;
}

/** Les effets d'un point : une promotion d'acheminement s'applique au panier. */
export function effectsFor(
  fulfillment: PromotionFulfillmentKindValue,
): readonly PromotionEffectKindValue[] {
  return fulfillment === 'any'
    ? ['percent_off', 'unit_amount_off', 'fixed_unit_price']
    : ['percent_off', 'basket_amount_off'];
}

/** Les cibles d'un point : le tarif ne connaît que le SKU, le panier connaît le produit. */
export function targetsFor(
  fulfillment: PromotionFulfillmentKindValue,
): readonly PromotionScopeTargetValue[] {
  return fulfillment === 'any' ? ['category', 'variant'] : ['category', 'product'];
}

const NO_AUDIENCE_LABELS = {
  individualsFr: '',
  individualsEn: '',
  individualsIt: '',
  prosFr: '',
  prosEn: '',
  prosIt: '',
} as const;

export function emptyDraft(today: string, pickupId: string | null): PromotionDraft {
  return {
    internalName: '',
    labelFr: '',
    labelEn: '',
    labelIt: '',
    ...NO_AUDIENCE_LABELS,
    reason: '',
    effectKind: 'percent_off',
    effectValue: '',
    validFrom: today,
    validTo: '',
    // Sur un site : les particuliers et les pros en cours d'inscription — ce
    // que « tous sauf les pros actifs » disait, dans les mots de l'arbre.
    audiences:
      pickupId === null
        ? [{ kind: 'everyone', companyId: null }]
        : minimalAudiences(
            new Set(['individuals_guest', 'individuals_registered', 'pros_pending']),
          ),
    fulfillmentKind: pickupId === null ? 'any' : 'pickup_point',
    pickupId: pickupId ?? '',
    scopeMode: 'all_except',
    rules: [],
    minQuantity: '',
    stacksOverMercuriale: false,
    cumulative: false,
  };
}

const BP_PER_PERCENT = 100;
const MILLICENTS_PER_EURO = 100_000;
const CENTS_PER_EURO = 100;

/** L'unité saisie de chaque effet, et son facteur vers l'entier du serveur. */
const EFFECT_FACTOR: Readonly<Record<PromotionEffectKindValue, number>> = {
  percent_off: BP_PER_PERCENT,
  unit_amount_off: MILLICENTS_PER_EURO,
  fixed_unit_price: MILLICENTS_PER_EURO,
  basket_amount_off: CENTS_PER_EURO,
};

/** Un nombre français (« 0,50 ») ; `null` s'il ne se lit pas. */
function decimalOf(text: string): number | null {
  const trimmed = text.trim().replace(',', '.');
  if (trimmed === '' || !/^\d+(\.\d+)?$/u.test(trimmed)) {
    return null;
  }
  return Number(trimmed);
}

/** Le brouillon d'une promotion existante — pour la modifier. */
export function draftOf(view: PromotionView): PromotionDraft {
  const quantity = view.conditions.find((condition) => condition.kind === 'min_quantity');
  return {
    internalName: view.internalName,
    labelFr: view.label.fr,
    labelEn: view.label.en ?? '',
    labelIt: view.label.it ?? '',
    individualsFr: view.audienceLabels.individuals?.fr ?? '',
    individualsEn: view.audienceLabels.individuals?.en ?? '',
    individualsIt: view.audienceLabels.individuals?.it ?? '',
    prosFr: view.audienceLabels.pros?.fr ?? '',
    prosEn: view.audienceLabels.pros?.en ?? '',
    prosIt: view.audienceLabels.pros?.it ?? '',
    reason: '',
    effectKind: view.effect.kind,
    effectValue: String(view.effect.value / EFFECT_FACTOR[view.effect.kind]).replace('.', ','),
    validFrom: parisToday(new Date(view.validFrom)),
    validTo: view.validTo === null ? '' : parisToday(new Date(view.validTo)),
    audiences: view.audiences,
    fulfillmentKind: view.fulfillment.kind,
    pickupId: view.fulfillment.pickupId ?? '',
    scopeMode: view.scope.mode,
    rules: view.scope.rules.map(({ target, targetId, eligible }) => ({
      target,
      targetId,
      eligible,
    })),
    minQuantity: quantity === undefined ? '' : String(quantity.value),
    stacksOverMercuriale: view.stacksOverMercuriale,
    cumulative: view.cumulative,
  };
}

/** Ce que la forme refuse, en mots ; `null` quand le corps peut partir. */
export function draftProblem(draft: PromotionDraft): string | null {
  if (draft.internalName.trim() === '' || draft.labelFr.trim() === '') {
    return 'Donnez un nom interne et un libellé client.';
  }
  if (draft.audiences.length === 0) {
    return 'Cochez au moins un public.';
  }
  if (draft.audiences.some((target) => target.companyId?.trim() === '')) {
    return "Saisissez l'identifiant de la société.";
  }
  if (decimalOf(draft.effectValue) === null) {
    return "Saisissez la valeur de l'effet, en chiffres.";
  }
  if (businessDayStart(draft.validFrom) === null) {
    return 'Choisissez le premier jour de la promotion.';
  }
  if (draft.validTo !== '' && businessDayStart(draft.validTo) === null) {
    return 'La date de fin ne se lit pas.';
  }
  if (draft.minQuantity.trim() !== '' && !/^\d+$/u.test(draft.minQuantity.trim())) {
    return 'La quantité minimum est un nombre entier.';
  }
  return null;
}

/**
 * Le corps à envoyer. À n'appeler que sur un brouillon sans
 * {@link draftProblem} : une valeur illisible y vaudrait zéro, que le serveur
 * refuserait en le nommant.
 */
export function termsOf(draft: PromotionDraft): PromotionTermsPayload {
  const atLine = draft.fulfillmentKind === 'any';
  const minQuantity = draft.minQuantity.trim();
  return {
    internalName: draft.internalName.trim(),
    label: labelOf(draft.labelFr, draft.labelEn, draft.labelIt) ?? { fr: '', en: null, it: null },
    // Un libellé d'une branche que le public ne touche plus n'est pas envoyé :
    // l'écran l'a caché, l'agrégat le refuserait.
    audienceLabels: {
      individuals: touchesBranch(draft.audiences, 'individuals')
        ? labelOf(draft.individualsFr, draft.individualsEn, draft.individualsIt)
        : null,
      pros: touchesBranch(draft.audiences, 'pros')
        ? labelOf(draft.prosFr, draft.prosEn, draft.prosIt)
        : null,
    },
    reason: draft.reason.trim() === '' ? null : draft.reason.trim(),
    effect: {
      kind: draft.effectKind,
      value: Math.round((decimalOf(draft.effectValue) ?? 0) * EFFECT_FACTOR[draft.effectKind]),
    },
    ownFloor: null,
    stacksOverMercuriale: atLine && draft.stacksOverMercuriale,
    // Le cumul ne se bâtit qu'au point ligne : une promotion d'acheminement
    // ne l'envoie pas (l'agrégat la refuserait, plan § 16.1).
    cumulative: atLine && draft.cumulative,
    validFrom: businessDayStart(draft.validFrom) ?? '',
    validTo: draft.validTo === '' ? null : businessDayStart(draft.validTo),
    audiences: draft.audiences.map((target) => ({
      kind: target.kind,
      companyId: target.companyId === null ? null : target.companyId.trim(),
    })),
    fulfillment: {
      kind: draft.fulfillmentKind,
      pickupId: draft.fulfillmentKind === 'pickup_point' ? draft.pickupId : null,
    },
    scope: { mode: draft.scopeMode, rules: [...draft.rules] },
    conditions: minQuantity === '' ? [] : [{ kind: 'min_quantity', value: Number(minQuantity) }],
  };
}

/** Un libellé saisi ; `null` sans français — le commun suffit (§ 15.12 Q2). */
function labelOf(fr: string, en: string, it: string): PromotionTermsPayload['label'] | null {
  const optional = (text: string) => (text.trim() === '' ? null : text.trim());
  return fr.trim() === '' ? null : { fr: fr.trim(), en: optional(en), it: optional(it) };
}

/**
 * Changer d'acheminement change le point d'application : l'effet et les
 * cibles qui n'y ont pas de sens sont ramenés à ce qui en a, plutôt que
 * d'envoyer un corps que l'agrégat refuserait.
 */
export function withFulfillment(
  draft: PromotionDraft,
  kind: PromotionFulfillmentKindValue,
): PromotionDraft {
  const targets = targetsFor(kind);
  return {
    ...draft,
    fulfillmentKind: kind,
    effectKind: effectsFor(kind).includes(draft.effectKind) ? draft.effectKind : 'percent_off',
    rules: draft.rules.filter((rule) => targets.includes(rule.target)),
    stacksOverMercuriale: kind === 'any' && draft.stacksOverMercuriale,
    cumulative: kind === 'any' && draft.cumulative,
  };
}

/** Le mode change le sens d'une famille : ses règles sont retournées avec lui. */
export function withScopeMode(draft: PromotionDraft, mode: 'all_except' | 'only'): PromotionDraft {
  const familyEligible = mode === 'only';
  return {
    ...draft,
    scopeMode: mode,
    rules: draft.rules.map((rule) =>
      rule.target === 'category' ? { ...rule, eligible: familyEligible } : rule,
    ),
  };
}

/**
 * Les cibles d'un type, remplacées en bloc par une liste choisie. Une famille
 * suit le sens du mode ; un produit ou une déclinaison prend `eligible`.
 */
export function withTargets(
  draft: PromotionDraft,
  target: PromotionScopeTargetValue,
  ids: readonly string[],
  eligible: boolean,
): PromotionDraft {
  const sense = target === 'category' ? draft.scopeMode === 'only' : eligible;
  const kept = draft.rules.filter(
    (rule) => rule.target !== target || (target !== 'category' && rule.eligible !== sense),
  );
  const taken = new Set(kept.filter((rule) => rule.target === target).map((rule) => rule.targetId));
  return {
    ...draft,
    rules: [
      ...kept,
      ...ids
        .filter((id) => !taken.has(id))
        .map((targetId) => ({ target, targetId, eligible: sense })),
    ],
  };
}

/** Les identifiants d'un type et d'un sens, dans l'ordre du brouillon. */
export function targetIds(
  draft: PromotionDraft,
  target: PromotionScopeTargetValue,
  eligible: boolean,
): string[] {
  return draft.rules
    .filter(
      (rule) => rule.target === target && (target === 'category' || rule.eligible === eligible),
    )
    .map((rule) => rule.targetId);
}
