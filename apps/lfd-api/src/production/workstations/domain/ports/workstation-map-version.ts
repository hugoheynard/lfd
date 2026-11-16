/**
 * **« La carte des postes a-t-elle changé ? »** — un numéro que la fiche
 * d'atelier met dans l'étiquette de son contenu gardé (`WorksheetContents`) :
 * les gestes des postes n'écrivent aucun journal de journée, et sans ce numéro
 * un placement ne se verrait sur la fiche qu'au prochain mouvement du jour.
 *
 * Le numéro est l'instant du dernier geste qui a écrit la carte, en
 * millisecondes ; `0` tant qu'elle est vide. Chaque geste qui change la carte
 * réécrit au moins une ligne à l'instant du `Clock` — un produit remis « à
 * ranger » réécrit le poste qu'il quitte (`WorkstationMap.place`) —, donc le
 * numéro change à chaque geste. Il se compare par égalité.
 *
 * Limite assumée : deux gestes dont l'instant de requête est inversé par
 * rapport à l'ordre de validation laissent le numéro au plus grand des deux.
 * La fiche gardée entre-temps reste servie jusqu'au geste ou au mouvement
 * suivant. On ne règle pas les postes pendant le service (plan § 3.5).
 */
export abstract class WorkstationMapVersion {
  abstract versionOf(): Promise<number>;
}
