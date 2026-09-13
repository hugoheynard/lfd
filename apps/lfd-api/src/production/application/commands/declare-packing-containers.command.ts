/**
 * **Annoncer combien de containers une commande occupe** — les bacs du véhicule.
 *
 * Le jour accompagne la référence : un bon appartient à une journée, et c'est
 * elle qui porte l'agrégat.
 *
 * 🔴 Rien à voir avec `SetProductionContainerCommand`, qui règle le matériel du
 * FOUR par SKU (combien de baguettes sur une tourneuse). Les deux mots se
 * ressemblent, les deux gestes n'ont ni la même clé, ni le même rythme, ni le
 * même auteur.
 */
export class DeclarePackingContainersCommand {
  constructor(
    readonly serviceDay: string,
    readonly reference: string,
    /** Le nombre de bacs. `0` est une réponse, pas une absence de réponse. */
    readonly containers: number,
  ) {}
}
