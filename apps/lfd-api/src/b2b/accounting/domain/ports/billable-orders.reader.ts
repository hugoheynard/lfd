/**
 * Ce qu'il y a à prélever sur un cycle, **par société**.
 *
 * ## L'assiette, et pourquoi elle vit ici
 *
 * Le montant prélevé n'est pas une facture — nous n'en émettons pas (§0 quater
 * de `architecture-prelevement-sepa-direct.md`). C'est la **somme des commandes
 * passées au compte** pendant le cycle, et son critère est une règle
 * d'ARGENT : le poser au mauvais endroit se paie en prélèvements manquants ou
 * en double.
 *
 * Le port est déclaré par `accounting` parce que la règle lui appartient ;
 * `orders` possède les données et ne sait rien du prélèvement. L'adaptateur
 * traduit la règle en SQL **une fois**, et c'est le seul endroit du dépôt où
 * « ce qui est prélevable » s'écrit.
 *
 * ⚠️ Une alternative défendable serait un port publié par `orders` rendant des
 * lignes déjà filtrées. Elle a été écartée parce qu'elle ferait connaître le
 * prélèvement à `orders`, alors que la §2 du document tient à ce que `orders`
 * reste inchangé et n'en sache rien.
 */

/** Ce qu'une société doit pour un cycle. Agrégé : un débit par société. */
export interface BillableCompany {
  readonly companyId: string;
  /** La raison sociale, telle qu'elle s'imprimera en `Dbtr/Nm`. */
  readonly companyName: string;
  readonly orderCount: number;
  /** TTC, en centimes — c'est ce qu'on encaisse. */
  readonly totalCents: number;
}

export abstract class BillableOrdersReader {
  /**
   * Les sociétés à prélever sur `[from, to[`.
   *
   * 🔴 Bornes **inclusive puis exclusive**, comme le cycle : une commande passée
   * exactement à l'instant de clôture appartient au cycle suivant. Deux appels
   * sur des cycles qui se suivent ne peuvent donc ni compter deux fois une
   * commande, ni en perdre une.
   */
  abstract billableBetween(from: Date, to: Date): Promise<readonly BillableCompany[]>;
}
