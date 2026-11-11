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
 * Le réglage répond à une question — **le cumul** : une promotion
 * s'ajoute-t-elle au prix négocié (prix ferme ou remise générale) ? Trois
 * réponses : « Non, jamais » (le défaut d'une mercuriale neuve), « Oui,
 * toutes », « Seulement celles choisies ». La liste ne vaut qu'en
 * `selected` : l'écran la garde en mémoire quand on bascule (un aller-retour
 * ne perd rien), et ne l'envoie qu'en `selected`.
 *
 * L'exemple de « Oui » suit le moteur : la promotion s'applique au prix qui
 * sort de la mercuriale, étage après étage (`resolve-price.ts`, prix courant
 * repris à chaque étage — vérifié le 2026-11-11), d'où −10 % puis −20 % =
 * −28 %, et non −30 %.
 */
export type PromotionPolicyForm = MercurialePromotionPolicyView;

export const NO_PROMOTION_POLICY: PromotionPolicyForm = { mode: 'none', promotionIds: [] };

/** Le titre du réglage, posé en question : c'est du cumul qu'il s'agit. */
export const POLICY_QUESTION = 'Les promotions s’ajoutent-elles aux prix négociés ?';

/** Le nom du réglage dans un résumé : « Promotions en plus des prix négociés : non ». */
export const POLICY_SUMMARY_LABEL = 'Promotions en plus des prix négociés';

export const POLICY_MODE_LABELS: Readonly<Record<MercurialePromotionModeValue, string>> = {
  none: 'Non, jamais',
  all: 'Oui, toutes',
  selected: 'Seulement celles choisies',
};

export const POLICY_MODE_HINTS: Readonly<Record<MercurialePromotionModeValue, string>> = {
  none: 'Non : un article à prix ferme ou couvert par la remise générale garde son prix négocié, sans promotion en plus — ex. −10 % (remise) et une promotion −20 % : le client paie −10 %.',
  all: 'Oui : la promotion s’applique en plus, sur le prix négocié — ex. −10 % (remise) puis −20 % du reste = −28 %.',
  selected:
    'Seulement celles choisies : les promotions cochées ci-dessous s’appliquent en plus du prix négocié (−10 % puis −20 % du reste = −28 %), les autres non. Une promotion créée plus tard n’y entre pas d’elle-même.',
};

/**
 * Ce que le réglage ne touche PAS, dit sous chaque choix : sans cette phrase,
 * « Non » se lit comme « ce client n'a aucune promotion », alors que ses
 * articles hors mercuriale les reçoivent comme tout le monde.
 */
export const POLICY_SCOPE_HINT =
  'Les articles hors mercuriale reçoivent les promotions normalement.';

/** L'aide complète d'un choix : sa phrase avec exemple, puis ce qu'il ne touche pas. */
export function policyHint(mode: MercurialePromotionModeValue): string {
  return `${POLICY_MODE_HINTS[mode]} ${POLICY_SCOPE_HINT}`;
}

/** Le corps envoyé : la liste seulement en « Seulement celles choisies ». */
export function policyPayload(policy: PromotionPolicyForm): MercurialePromotionPolicyPayload {
  return {
    mode: policy.mode,
    promotionIds: policy.mode === 'selected' ? [...policy.promotionIds] : [],
  };
}

/** Ce qui manque pour l'envoyer — le domaine refuse un « Seulement celles choisies » vide. */
export function policyProblem(policy: PromotionPolicyForm): string | null {
  return policy.mode === 'selected' && policy.promotionIds.length === 0
    ? 'En « Seulement celles choisies », choisissez au moins une promotion.'
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

/** La réponse courte à la question du cumul, en tête d'une phrase. */
const POLICY_ANSWERS: Readonly<Record<MercurialePromotionModeValue, string>> = {
  none: 'non',
  all: 'oui, toutes',
  selected: 'seulement',
};

/**
 * La politique en une réponse : « non », « oui, toutes », « seulement
 * Rentrée, Été (archivée) ». Une promotion que la lecture ne connaît pas
 * garde son identifiant plutôt que de disparaître.
 */
export function policyPhrase(
  policy: PromotionPolicyForm,
  promotions: readonly PromotionView[] | null,
): string {
  if (policy.mode !== 'selected') {
    return POLICY_ANSWERS[policy.mode];
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
  return `${POLICY_ANSWERS.selected} ${names.join(', ')}`;
}

/** « Promotions en plus des prix négociés : non ». */
export function policySummary(
  policy: PromotionPolicyForm,
  promotions: readonly PromotionView[] | null,
): string {
  return `${POLICY_SUMMARY_LABEL} : ${policyPhrase(policy, promotions)}`;
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
