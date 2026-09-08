import { attainmentBp, isoRevenueRatioBp, requiredVolume } from '@lfd/money';
import type { ElasticityComparison, ItemElasticityView } from '@lfd/contracts';

/**
 * **L'effort de vente d'un prix qu'on est en train de TAPER.**
 *
 * ## Pourquoi l'écran recalcule ici, alors qu'il ne calcule rien d'autre
 *
 * Le serveur mesure l'effort d'une décision **posée** : il compare le tarif
 * catalogue au prix que la caisse applique aujourd'hui. Pendant une
 * négociation, ce prix-là n'existe pas encore — il est dans le champ, il change
 * à chaque frappe, et un aller-retour par frappe sur quatre-vingt-douze lignes
 * n'est pas une option.
 *
 * La colonne restait donc **figée sur l'ancien prix** pendant qu'on tapait le
 * nouveau : elle répondait à une question qu'on ne posait plus.
 *
 * ## Ce qui autorise le recalcul, et ce qui l'aurait interdit
 *
 * Rien n'est réimplémenté : `isoRevenueRatioBp`, `requiredVolume` et
 * `attainmentBp` viennent de `@lfd/money` — **les mêmes fonctions** que le
 * serveur appelle. Elles y ont été déplacées pour ça. Deux arithmétiques du
 * même chiffre auraient annoncé un objectif pendant la négociation et un autre
 * une fois le prix posé, sur le même article, le même jour.
 *
 * Ce qui NE se recalcule pas ici : les **volumes** et les **fenêtres**. Ils
 * viennent d'une mesure sur les commandes de ce client, ils ne dépendent pas du
 * prix, et l'écran les reprend tels quels. Seuls bougent les trois nombres qui
 * dérivent du prix — le ratio, l'objectif, et l'atteinte de l'objectif.
 */
export function liveEffort(
  measured: ItemElasticityView | null,
  canonicalMillicents: number,
  typedMillicents: number | null,
): ItemElasticityView | null {
  // Rien de mesuré : ni ratio ni objectif ne veulent dire quoi que ce soit.
  // Une colonne vide dit « on ne sait pas », ce qui est la vérité.
  if (measured === null) {
    return null;
  }
  // Rien de tapé : on montre ce que le serveur a mesuré, c'est-à-dire l'effort
  // de ce qui est POSÉ aujourd'hui. C'est bien la question tant qu'on n'a pas
  // commencé à négocier.
  if (typedMillicents === null) {
    return measured;
  }

  const ratioBp = isoRevenueRatioBp(canonicalMillicents, typedMillicents);
  return {
    fromMillicents: canonicalMillicents,
    toMillicents: typedMillicents,
    isoRevenueRatioBp: ratioBp,
    sinceChange: measured.sinceChange === null ? null : retarget(measured.sinceChange, ratioBp),
    rolling: retarget(measured.rolling, ratioBp),
  };
}

/**
 * La même comparaison, visant l'objectif du **nouveau** prix.
 *
 * L'objectif se calcule sur le volume de RÉFÉRENCE — celui d'avant —, jamais
 * sur le réalisé : « je vendais 400, je baisse de 20 %, il m'en faut 500 ». Le
 * calculer sur le réalisé donnerait un objectif qui suit ce qu'on fait, donc
 * toujours atteint. C'est la règle du serveur, et elle vaut ici pour la même
 * raison.
 */
function retarget(comparison: ElasticityComparison, ratioBp: number | null): ElasticityComparison {
  const targetVolume = requiredVolume(comparison.baselineVolume, ratioBp);
  return {
    ...comparison,
    targetVolume,
    attainmentBp: attainmentBp(comparison.observedVolume, targetVolume),
  };
}
