import type {
  MercurialePromotionModeValue,
  MercurialePromotionPolicyPayload,
  MercurialePromotionPolicyView,
  PosedMercurialeView,
  PromotionView,
} from '@lfd/contracts';

/**
 * **La politique de promotions d'une mercuriale, côté écran**
 * (`documentation/promotions/plan-la-mercuriale-decide.md`, §§ 7-8).
 *
 * Trois positions : « Aucune promotion » (le défaut d'une mercuriale neuve),
 * « Toutes les promotions », « Au choix ». La liste ne vaut qu'en « Au
 * choix » : l'écran la garde en mémoire quand on bascule (un aller-retour ne
 * perd rien), et ne l'envoie qu'en `selected`.
 */
export type PromotionPolicyForm = MercurialePromotionPolicyView;

export const NO_PROMOTION_POLICY: PromotionPolicyForm = { mode: 'none', promotionIds: [] };

export const POLICY_MODE_LABELS: Readonly<Record<MercurialePromotionModeValue, string>> = {
  none: 'Aucune promotion',
  all: 'Toutes les promotions',
  selected: 'Au choix',
};

export const POLICY_MODE_HINTS: Readonly<Record<MercurialePromotionModeValue, string>> = {
  none: 'Ce client paie son prix négocié, sans aucune promotion en plus — ni au catalogue, ni au panier — sur les quantités où le tarif négocié s’applique.',
  all: 'Les promotions qui visent ce client s’ajoutent à son prix négocié, comme pour un client sans mercuriale.',
  selected:
    'Seules les promotions choisies ici s’ajoutent à son prix négocié. Une promotion créée plus tard n’y entre pas d’elle-même.',
};

/** Le corps envoyé : la liste seulement en « Au choix ». */
export function policyPayload(policy: PromotionPolicyForm): MercurialePromotionPolicyPayload {
  return {
    mode: policy.mode,
    promotionIds: policy.mode === 'selected' ? [...policy.promotionIds] : [],
  };
}

/** Ce qui manque pour l'envoyer — le domaine refuse un « Au choix » vide. */
export function policyProblem(policy: PromotionPolicyForm): string | null {
  return policy.mode === 'selected' && policy.promotionIds.length === 0
    ? 'En « Au choix », choisissez au moins une promotion.'
    : null;
}

export function samePolicy(a: PromotionPolicyForm, b: PromotionPolicyForm): boolean {
  const left = policyPayload(a);
  const right = policyPayload(b);
  return (
    left.mode === right.mode &&
    left.promotionIds.length === right.promotionIds.length &&
    [...left.promotionIds].sort().join('\n') === [...right.promotionIds].sort().join('\n')
  );
}

/** Une promotion telle que le choix la montre : son nom, son résumé, archivée ou non. */
export interface PromotionChoice {
  readonly value: string;
  readonly label: string;
  readonly archived: boolean;
}

/**
 * **Les promotions qu'on peut choisir** : les non archivées, nommées et
 * résumées ; une archivée n'y figure que si elle est déjà choisie, et le dit
 * (elle reste dans la liste, sans effet — § 8).
 */
export function promotionChoices(
  promotions: readonly PromotionView[],
  chosen: readonly string[],
): readonly PromotionChoice[] {
  const kept = new Set(chosen);
  return promotions
    .filter((promotion) => promotion.archived === null || kept.has(promotion.id))
    .map((promotion) => ({
      value: promotion.id,
      label: choiceLabel(promotion),
      archived: promotion.archived !== null,
    }));
}

function choiceLabel(promotion: PromotionView): string {
  const archived = promotion.archived === null ? '' : ' (archivée)';
  return `${promotion.internalName}${archived} — ${promotion.summary}`;
}

/**
 * La politique en une phrase : « Aucune promotion », « Toutes les
 * promotions », « Au choix : Rentrée, Été (archivée) ». Une promotion que la
 * lecture ne connaît pas garde son identifiant plutôt que de disparaître.
 */
export function policyPhrase(
  policy: PromotionPolicyForm,
  promotions: readonly PromotionView[] | null,
): string {
  if (policy.mode !== 'selected') {
    return POLICY_MODE_LABELS[policy.mode];
  }
  const byId = new Map((promotions ?? []).map((promotion) => [promotion.id, promotion]));
  const names = policy.promotionIds.map((id) => {
    const promotion = byId.get(id);
    if (promotion === undefined) {
      return id;
    }
    return promotion.archived === null
      ? promotion.internalName
      : `${promotion.internalName} (archivée)`;
  });
  return `${POLICY_MODE_LABELS.selected} : ${names.join(', ')}`;
}

/** D'où vient la politique en vigueur : la pose, ou un avenant à sa date d'effet. */
export type PolicyOrigin =
  { readonly kind: 'pose' } | { readonly kind: 'amendment'; readonly validFrom: string };

/**
 * La politique en vigueur à `now` est celle du dernier avenant qui en porte
 * une et a pris effet, sinon celle de la pose (§ 8, réorienté). Une
 * mercuriale qui n'a pas commencé se lit à son début, comme le serveur.
 */
export function policyOrigin(mercuriale: PosedMercurialeView, now: Date): PolicyOrigin {
  const start = new Date(mercuriale.validFrom).getTime();
  const at = Math.max(now.getTime(), start);
  const effective = (mercuriale.amendments ?? [])
    .filter(
      (amendment) =>
        amendment.promotionPolicy !== undefined &&
        amendment.promotionPolicy !== null &&
        new Date(amendment.validFrom).getTime() <= at,
    )
    .sort((a, b) => new Date(a.validFrom).getTime() - new Date(b.validFrom).getTime());
  const last = effective.at(-1);
  return last === undefined ? { kind: 'pose' } : { kind: 'amendment', validFrom: last.validFrom };
}

const DAY = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeZone: 'Europe/Paris' });

export function originPhrase(origin: PolicyOrigin): string {
  return origin.kind === 'pose'
    ? 'depuis la pose'
    : `depuis l’avenant du ${DAY.format(new Date(origin.validFrom))}`;
}
