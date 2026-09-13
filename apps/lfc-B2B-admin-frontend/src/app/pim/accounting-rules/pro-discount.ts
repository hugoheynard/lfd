import { MAX_RATIO_BP, type ProPricePolicy } from '@lfd/pim-contracts';
import { MILLICENTS_PER_CENT } from '@lfd/money';
import { formatCents } from '@lfd/b2b-ui/order';

/**
 * **La remise professionnelle, telle qu'on la dit — et le rapport, tel qu'on le
 * stocke.**
 *
 * On pense « le pro paie 10 % de moins » ; le modèle porte « 9 000 points de
 * base ». Les deux sont la même décision vue de deux côtés, et la traduction
 * vit ici, en un seul endroit : dans le sens écran → serveur à
 * l'enregistrement, dans l'autre à la relecture.
 *
 * Pourquoi ne PAS stocker la remise, puisque c'est le mot qu'on emploie : le
 * rapport est ce qui **multiplie** un prix. Le dériver d'une soustraction à
 * chaque lecture ajouterait un endroit où se tromper de sens — et se tromper de
 * sens ici ferait payer 110 % au professionnel.
 */

/** Deux décimales : au-delà, une remise n'a plus de sens commercial. */
const CENTIS = 100;

/**
 * La remise saisie (en %) vers le rapport en points de base.
 *
 * `null` quand la saisie ne peut pas devenir une décision : hors de `[0, 100[`,
 * ou pas un nombre. **100 % est exclu** — un prix professionnel nul n'est pas
 * une remise, et la base le refuserait (`pro_price_ratio_bp > 0`). Rendre
 * `null` plutôt que de corriger en silence : l'écran doit désactiver son bouton,
 * pas enregistrer autre chose que ce qui est écrit.
 */
export function discountToRatioBp(discountPercent: number): number | null {
  if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent >= 100) {
    return null;
  }
  const ratioBp = MAX_RATIO_BP - Math.round(discountPercent * CENTIS);
  return ratioBp > 0 && ratioBp <= MAX_RATIO_BP ? ratioBp : null;
}

/** Le rapport relu du serveur, vers la remise que l'écran affiche. */
export function ratioBpToDiscount(ratioBp: number): number {
  return (MAX_RATIO_BP - ratioBp) / CENTIS;
}

/** « −10 % », virgule française et signe compris. Pour la pastille. */
export function formatDiscount(ratioBp: number): string {
  const discount = ratioBpToDiscount(ratioBp);
  if (discount === 0) {
    // « −0 % » se lit comme une erreur. Un rapport à 100 % est un réglage
    // légitime — la maison a décidé que le pro paie le prix public — et il doit
    // se lire comme tel.
    return 'aucune remise';
  }
  return `−${String(discount).replace('.', ',')} %`;
}

/**
 * Le **taux de TVA figé** que l'écran propose pour la méthode de la plaquette.
 *
 * 20 %, parce que c'est le nombre qu'une réunion de communication a employé et
 * qui est parti à l'impression. Une PROPOSITION de saisie, jamais un réglage :
 * il n'entre en base que si quelqu'un choisit la plaquette, et le référentiel
 * des taux n'a aucun droit de le changer ensuite.
 */
export const DEFAULT_BROCHURE_VAT = 20;

/** Le réglage d'origine, assemblé — méthode, rapport, pas de taux figé. */
export function ratioTtcPolicy(ratioBp: number): ProPricePolicy {
  return { method: 'ratio_ttc', ratioBp, fixedVatPercent: null };
}

/** Le réglage de la plaquette : dépouillé au taux FIGÉ, puis remisé. */
export function brochurePolicy(ratioBp: number, fixedVatPercent: number): ProPricePolicy {
  return { method: 'remise_apres_tva_max', ratioBp, fixedVatPercent };
}

/**
 * Un hors taxe en **millicentimes** vers une somme lisible.
 *
 * Le comparateur travaille en millicentimes parce que c'est l'unité qui part
 * sur le fil : arrondir au centime pour l'afficher est juste, arrondir pour
 * CALCULER l'écart ne le serait pas — deux arrondis se mangeraient l'écart
 * qu'on cherche justement à montrer.
 */
export function formatMillicents(millicents: number): string {
  return formatCents(Math.round(millicents / MILLICENTS_PER_CENT));
}

/** Le même, **signé** : l'écart n'a de sens qu'avec son sens. */
export function formatSignedMillicents(millicents: number): string {
  if (Math.abs(millicents) < MILLICENTS_PER_CENT / 2) {
    // Moins d'un demi-centime : « +0,00 € » ferait chercher une différence là où
    // les deux méthodes coïncident — c'est le cas d'un article déjà au taux figé.
    return 'identique';
  }
  const sign = millicents > 0 ? '+' : '−';
  return `${sign}${formatMillicents(Math.abs(millicents))}`;
}

/** « 20,9 % » — la remise RÉELLE, celle que la plaquette ignore. */
export function formatDiscountBp(bp: number | null): string | null {
  return bp === null ? null : `${(bp / CENTIS).toFixed(1).replace('.', ',')} %`;
}
