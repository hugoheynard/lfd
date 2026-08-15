import type { CartAdjustment } from '@lfd/contracts';

/**
 * Une **altération de prix** : de combien, dans quelle unité, et dans quel sens.
 *
 * Généralise le `CartAdjustment` du contrat, qui ne porte **que** la grandeur :
 * son sens vient de l'emplacement où il est lu (la remise d'un point de retrait
 * baisse, le frais d'une zone monte). Ça marche tant qu'un emplacement n'a qu'un
 * sens possible — et ça cesse de marcher dès qu'un écran laisse choisir. On
 * garde donc la forme du contrat (`bp` / `cents`, entiers, jamais de flottant
 * pour de l'argent) et on lui ajoute le sens.
 *
 * La grandeur reste **toujours positive** : « −20 % » se dit par `direction`,
 * pas par un signe. Deux façons d'exprimer la même chose finiraient par se
 * contredire — un `bp: -2000` avec `direction: 'increase'` n'aurait aucune
 * lecture évidente.
 */
export type PriceDirection = 'increase' | 'decrease';

export type PriceAlteration =
  | { readonly direction: PriceDirection; readonly mode: 'percent'; readonly bp: number }
  | { readonly direction: PriceDirection; readonly mode: 'amount'; readonly cents: number };

/** La grandeur en unités de saisie (20 = 20 % ou 20 €), quelle que soit l'unité. */
export function alterationValue(alteration: PriceAlteration): number {
  return (alteration.mode === 'percent' ? alteration.bp : alteration.cents) / 100;
}

/** La grandeur en texte court : « 20 % » ou « 20,00 € ». */
export function formatAlteration(alteration: PriceAlteration): string {
  return alteration.mode === 'percent'
    ? `${alterationValue(alteration)} %`
    : `${alterationValue(alteration).toFixed(2).replace('.', ',')} €`;
}

/**
 * Ce que l'altération fait, en une phrase à la deuxième personne.
 *
 * Elle existe parce qu'un « − » devant un nombre se lit mal quand on vient de
 * cliquer sur un bouton nommé « Réduction » : deux fois la même information,
 * et l'œil ne sait plus laquelle porte le sens. Une phrase ne s'inverse pas.
 */
export function alterationSentence(alteration: PriceAlteration | null): string {
  if (alteration === null) {
    return 'Le prix reste inchangé.';
  }
  const verb = alteration.direction === 'increase' ? 'augmentez' : 'réduisez';
  return `Vous ${verb} le prix de ${formatAlteration(alteration)}.`;
}

/**
 * Vers le `CartAdjustment` du contrat — **le sens est perdu**, volontairement.
 *
 * À n'appeler que là où le sens est structurel et donc redondant : la remise
 * d'un point baisse toujours, le frais d'une zone monte toujours. Ailleurs,
 * transporter l'altération entière.
 */
export function toCartAdjustment(alteration: PriceAlteration | null): CartAdjustment | null {
  if (alteration === null) {
    return null;
  }
  return alteration.mode === 'percent'
    ? { mode: 'percent', bp: alteration.bp }
    : { mode: 'amount', cents: alteration.cents };
}

/** Depuis le contrat, en lui rendant le sens que son emplacement lui donne. */
export function fromCartAdjustment(
  adjustment: CartAdjustment | null,
  direction: PriceDirection,
): PriceAlteration | null {
  if (adjustment === null) {
    return null;
  }
  return adjustment.mode === 'percent'
    ? { direction, mode: 'percent', bp: adjustment.bp }
    : { direction, mode: 'amount', cents: adjustment.cents };
}

/**
 * Construit une altération depuis ce que l'humain a tapé (20 = 20 % ou 20 €).
 *
 * Rend `null` pour un champ vide ou une grandeur négative : une altération de
 * « rien » n'altère rien, et le signe se dit par le sens, pas par le nombre.
 * Zéro est refusé pour la même raison — « augmenter le prix de 0 € » est une
 * phrase que personne ne veut lire sur un écran de réglage.
 */
export function buildAlteration(
  value: number | null,
  mode: 'percent' | 'amount',
  direction: PriceDirection,
): PriceAlteration | null {
  if (value === null || value <= 0) {
    return null;
  }
  const units = Math.round(value * 100);
  return mode === 'percent'
    ? { direction, mode: 'percent', bp: units }
    : { direction, mode: 'amount', cents: units };
}
