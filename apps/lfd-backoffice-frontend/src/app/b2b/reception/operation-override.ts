import type {
  ReceivedOperationAudience,
  ReceivedOperationView,
  SetOperationOverridePayload,
} from '@lfd/contracts';
import type { FoldSelectOption } from 'fold-ng';

import { parisInstant, parisMoment } from '../../pim/operations/operation-schedule';

/**
 * **La surcharge d'une opération reçue, telle qu'on la saisit** — et sa
 * traduction vers ce que le serveur attend.
 *
 * 🔴 La clôture se saisit en heure de Paris, un jour et une heure, et se
 * convertit par `localToInstant` de `@lfd/contracts` (via `parisInstant`) :
 * jamais un `T00:00Z` collé à un jour. `lint:business-day` scanne ce dossier.
 *
 * Aucune comparaison avec le référentiel ici : une clôture plus tardive que la
 * sienne est acceptée par le serveur et n'a simplement aucun effet — c'est le
 * plus tôt des deux qui ferme (D9). L'écran le montre par `effective`.
 */
export interface OverrideDraft {
  readonly isHidden: boolean;
  /** Vides tous les deux = on garde la clôture reçue. */
  readonly orderUntilDay: string;
  readonly orderUntilTime: string;
  /** `null` = on garde la clientèle reçue. */
  readonly audience: ReceivedOperationAudience | null;
  readonly hiddenSkus: readonly string[];
}

export type OverrideReading =
  | { readonly ok: true; readonly payload: SetOperationOverridePayload }
  | { readonly ok: false; readonly problem: string };

const AUDIENCES: Readonly<Record<ReceivedOperationAudience | 'none', string>> = {
  both: 'Professionnels et particuliers',
  pro: 'Professionnels',
  public: 'Particuliers',
  none: 'Aucune — la clientèle restreinte ne recouvre pas celle reçue',
};

export function audienceLabel(audience: ReceivedOperationAudience | 'none'): string {
  return AUDIENCES[audience];
}

/** La valeur du choix « garder ce qui est reçu » — `fold-listbox` ne porte pas `null`. */
export const KEEP_AUDIENCE = 'keep';
export type AudienceChoice = ReceivedOperationAudience | typeof KEEP_AUDIENCE;

export const AUDIENCE_CHOICES: readonly FoldSelectOption<AudienceChoice>[] = [
  { value: KEEP_AUDIENCE, label: 'Garder la clientèle reçue' },
  { value: 'pro', label: 'Professionnels seulement' },
  { value: 'public', label: 'Particuliers seulement' },
];

/** Ce que l'écran remet dans les champs : la surcharge en place, ou rien. */
export function overrideDraftOf(view: ReceivedOperationView): OverrideDraft {
  const override = view.override;
  const until = override?.orderUntil == null ? null : parisMoment(override.orderUntil);
  return {
    isHidden: override?.isHidden ?? false,
    orderUntilDay: until?.day ?? '',
    orderUntilTime: until?.time ?? '',
    audience: override?.audience ?? null,
    hiddenSkus: override?.hiddenSkus ?? [],
  };
}

/**
 * La saisie, convertie — ou la phrase qui dit ce qui manque.
 *
 * Les SKU retirés sont rangés dans l'ordre de la sélection reçue, et ceux
 * qu'elle ne porte plus sont gardés : les effacer en silence serait décider à
 * la place de l'opérateur pour un article que l'envoi suivant peut ramener.
 */
export function readOverride(draft: OverrideDraft, selection: readonly string[]): OverrideReading {
  const day = draft.orderUntilDay.trim();
  const time = draft.orderUntilTime.trim();
  let orderUntil: string | null = null;
  if (day !== '' || time !== '') {
    if (day === '' || time === '') {
      return {
        ok: false,
        problem: 'Pour fermer la commande plus tôt, renseignez le jour ET l’heure.',
      };
    }
    orderUntil = parisInstant(day, time);
    if (orderUntil === null) {
      return {
        ok: false,
        problem: 'Cette heure n’existe pas à Paris ce jour-là (passage à l’heure d’été).',
      };
    }
  }
  return {
    ok: true,
    payload: {
      isHidden: draft.isHidden,
      orderUntil,
      audience: draft.audience,
      hiddenSkus: orderedLike(draft.hiddenSkus, selection),
    },
  };
}

function orderedLike(skus: readonly string[], selection: readonly string[]): string[] {
  const wanted = new Set(skus);
  const inSelection = selection.filter((sku) => wanted.has(sku));
  const elsewhere = [...wanted].filter((sku) => !selection.includes(sku));
  return [...inSelection, ...elsewhere];
}

/** Deux saisies disent-elles la même chose ? L'ordre des retraits n'en fait pas partie. */
export function sameDraft(a: OverrideDraft, b: OverrideDraft): boolean {
  return (
    a.isHidden === b.isHidden &&
    a.orderUntilDay === b.orderUntilDay &&
    a.orderUntilTime === b.orderUntilTime &&
    a.audience === b.audience &&
    [...a.hiddenSkus].sort().join('\n') === [...b.hiddenSkus].sort().join('\n')
  );
}
