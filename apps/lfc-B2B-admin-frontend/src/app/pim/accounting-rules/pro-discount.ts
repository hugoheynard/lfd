import { MAX_RATIO_BP } from '@lfd/pim-contracts';

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
