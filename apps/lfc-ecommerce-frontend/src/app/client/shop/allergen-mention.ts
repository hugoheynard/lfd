import type { ShopItemAllergensView } from '@lfd/contracts';

import { fill } from '../copy/client-copy.service';

/** Les mots de la mention, tels que le dictionnaire les écrit. */
export interface AllergenMentionForms {
  readonly allergensNone: string;
  readonly allergensPrecautionary: string;
  readonly allergensTileContains: string;
  readonly allergensTileMayContain: string;
}

/**
 * **La mention compacte d'une carte du rayon** — quand la vitrine montre les
 * allergènes « aussi dans la galerie » (Hugo, 2026-10-27,
 * `plan-allergenes-en-boutique.md`). Des phrases, dans l'ordre de la fiche :
 * les allergènes (ou « Aucun allergène », déclaré ; ou « Information précise
 * non disponible » sous précaution) d'abord, les traces ensuite — jamais les
 * traces seules. La carte coupe à l'affichage ; le texte reste entier pour
 * un lecteur d'écran, et la fiche le donne en liste.
 */
export function allergenMention(
  allergens: ShopItemAllergensView | undefined,
  forms: AllergenMentionForms,
): readonly string[] {
  if (allergens === undefined) {
    return [];
  }
  const lead = leadOf(allergens, forms);
  const traces =
    allergens.mayContain.length === 0
      ? []
      : [fill(forms.allergensTileMayContain, { list: allergens.mayContain.join(', ') })];
  return [...lead, ...traces];
}

function leadOf(allergens: ShopItemAllergensView, forms: AllergenMentionForms): string[] {
  const contains =
    allergens.contains.length === 0
      ? []
      : [fill(forms.allergensTileContains, { list: allergens.contains.join(', ') })];
  switch (allergens.state) {
    case 'precautionary':
      return [...contains, forms.allergensPrecautionary];
    case 'none':
      return [forms.allergensNone];
    case 'declared':
      return contains;
  }
}
