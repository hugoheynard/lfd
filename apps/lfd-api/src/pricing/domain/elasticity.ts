/**
 * **Ce qu'une altération coûte en volume.**
 *
 * Une remise ne se juge pas au pourcentage, elle se juge à ce qu'elle oblige à
 * vendre : baisser de 20 % impose de vendre ×1,25 pour encaisser le même
 * chiffre. Ce module ne calcule que ça — sans base, sans horloge, sans réseau —
 * et c'est ce qui permet d'en énumérer les cas limites au lieu de les découvrir
 * en production.
 *
 * **À chiffre d'affaires constant, jamais à marge constante.** L'iso-marge
 * serait plus juste commercialement et suppose un prix de revient, qui n'existe
 * nulle part dans le modèle. Un coût inventé afficherait une marge fausse avec
 * l'aplomb d'un tableau de bord ; le jour où le PIM en portera un, il deviendra
 * une seconde base sans que rien d'ici ne soit à défaire.
 */

/** 100 %, en points de base — l'unité de tous les ratios de ce module. */
export const RATIO_UNIT_BP = 10_000;

/**
 * Le ratio de volume qui laisse le **chiffre d'affaires inchangé**, en points de
 * base (`12500` = ×1,25).
 *
 * `null` quand il n'a pas de valeur finie : un article passé à zéro (offert)
 * n'atteint le chiffre d'origine à aucun volume. Rendre `Infinity` aurait
 * traversé les écrans en « ×∞ » ou, pire, en `NaN` après un arrondi.
 *
 * Un prix qui **monte** rend un ratio inférieur à 1 : on peut alors vendre moins
 * pour le même chiffre. C'est la même formule, et elle reste vraie — un
 * supplément est une altération comme une autre.
 */
export function isoRevenueRatioBp(fromCents: number, toCents: number): number | null {
  if (!Number.isFinite(fromCents) || !Number.isFinite(toCents) || toCents <= 0) {
    return null;
  }
  return Math.round((fromCents / toCents) * RATIO_UNIT_BP);
}

/**
 * Le volume qu'il faut atteindre pour tenir le chiffre, à partir d'un volume de
 * référence.
 *
 * Arrondi **au supérieur** : vendre 124,3 croissants n'existe pas, et arrondir
 * au plus proche annoncerait un objectif atteint alors qu'il manque une unité.
 */
export function requiredVolume(baselineVolume: number, ratioBp: number | null): number | null {
  if (ratioBp === null || baselineVolume <= 0) {
    return null;
  }
  return Math.ceil((baselineVolume * ratioBp) / RATIO_UNIT_BP);
}

/**
 * Où en est le volume réalisé **par rapport à l'objectif**, en points de base
 * (`10000` = objectif atteint pile).
 *
 * `null` quand il n'y a pas d'objectif — sans référence, il n'y a pas d'écart à
 * mesurer, et afficher « 0 % » ferait passer une absence de mesure pour un
 * échec.
 */
export function attainmentBp(observedVolume: number, target: number | null): number | null {
  if (target === null || target <= 0) {
    return null;
  }
  return Math.round((observedVolume / target) * RATIO_UNIT_BP);
}

/**
 * Le ratio du volume observé **sur son volume de référence** — la mesure qui
 * déverrouille un plancher dynamique.
 *
 * `null` sans référence : un article neuf n'a pas d'historique, et le traiter
 * comme un ratio de zéro dirait « la baisse n'a rien produit » là où la vérité
 * est « on ne sait pas encore ».
 */
export function observedRatioBp(baselineVolume: number, observedVolume: number): number | null {
  if (baselineVolume <= 0) {
    return null;
  }
  return Math.round((observedVolume / baselineVolume) * RATIO_UNIT_BP);
}
