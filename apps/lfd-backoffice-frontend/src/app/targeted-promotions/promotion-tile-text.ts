import type {
  PromotionEffectKindValue,
  PromotionTermsPayload,
  PromotionView,
} from '@lfd/contracts';

/**
 * **Le texte d'une promotion sur les vignettes, côté écran**
 * (`documentation/promotions/plan-texte-de-la-vignette.md`) — pur : le
 * brouillon, son contrat, et l'aperçu de ce que la boutique lira.
 *
 * La borne et la règle « pas de traduction sans français » sont jugées par
 * l'agrégat, dont le refus nommé revient tel quel à l'écran ; la borne est
 * recopiée ici (`PROMOTION_TILE_TEXT_MAX_LENGTH`, lu le 2026-11-01) pour la
 * dire dans l'aide du champ.
 */
export const TILE_TEXT_MAX_LENGTH = 60;

/** Le texte saisi, une chaîne par langue ; vide = aucun texte dans cette langue. */
export interface DraftTileText {
  readonly fr: string;
  readonly en: string;
  readonly it: string;
}

export const NO_TILE_TEXT: DraftTileText = { fr: '', en: '', it: '' };

/** Le brouillon d'une promotion existante. */
export function draftTileTextOf(view: PromotionView): DraftTileText {
  const text = view.tileText;
  return text === null ? NO_TILE_TEXT : { fr: text.fr, en: text.en ?? '', it: text.it ?? '' };
}

/**
 * Le corps à envoyer : `null` quand rien n'est saisi. Une traduction sans
 * français PART telle quelle, pour que le serveur la refuse en le nommant
 * plutôt que l'écran ne l'efface en silence.
 */
export function tileTextPayloadOf(text: DraftTileText): PromotionTermsPayload['tileText'] {
  const optional = (value: string) => (value.trim() === '' ? null : value.trim());
  const fr = text.fr.trim();
  const en = optional(text.en);
  const it = optional(text.it);
  return fr === '' && en === null && it === null ? null : { fr, en, it };
}

/** L'effet tel que l'écran le connaît : `value` dans l'unité saisie, `null` illisible. */
export interface DraftEffectValue {
  readonly kind: PromotionEffectKindValue;
  readonly value: number | null;
}

const AMOUNT_DECIMALS = 2;

/**
 * **Ce que la vignette dira, en français** : le texte réglé, sinon la valeur
 * seule (« −20 % », « −5,00 € ») — le même gabarit que la boutique
 * (`discountPercent`, `discountAmount`). `null` quand la valeur ne se lit pas
 * encore et qu'aucun texte n'est saisi.
 */
export function tileTextPreview(text: DraftTileText, effect: DraftEffectValue): string | null {
  const own = text.fr.trim();
  if (own !== '') {
    return own;
  }
  if (effect.value === null) {
    return null;
  }
  if (effect.kind === 'percent_off') {
    return `−${String(effect.value).replace('.', ',')} %`;
  }
  return `−${effect.value.toFixed(AMOUNT_DECIMALS).replace('.', ',')} €`;
}
