import type { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";

/**
 * Une ligne d'une commande, **telle que le fournil en a besoin**.
 *
 * Aucun montant, et ce n'est pas une omission : le fournil fabrique, il ne
 * facture pas. L'absence est portée par le TYPE — il n'y a pas de champ à
 * laisser vide — et c'est ce qui rend impossible qu'un prix arrive un jour sur
 * une feuille d'atelier par un `...spread` distrait.
 */
export interface ProducibleLine {
  readonly sku: string;
  readonly productName: string;
  readonly quantity: number;
}

/**
 * Une commande d'une journée, vue de la production.
 *
 * C'est un **snapshot**, pas une `OrderView` : le contexte du commerce en porte
 * trente champs dont le fournil n'a que faire, et les lui donner ferait
 * dépendre ses écrans de la forme des tables de commerce — exactement ce que ce
 * chantier existe pour défaire.
 *
 * `orderId` est un **identifiant opaque**. La production ne joint rien : elle le
 * garde pour pouvoir en reparler, jamais pour aller lire à côté.
 */
export interface ProducibleOrder {
  readonly orderId: string;
  readonly reference: string;
  /** L'enseigne, ou la raison sociale : de quoi poser la feuille sur la bonne pile. */
  readonly customerLabel: string;
  readonly fulfillmentMethod: "pickup" | "delivery";
  /** Le lieu nommé — point de retrait, ou adresse livrée, déjà résolu. */
  readonly destination: string;
  readonly lines: readonly ProducibleLine[];
}

/**
 * **La seule fenêtre de la production sur une commande.**
 *
 * ⚠️ **Il vit dans `channels/commerce/`, et l'emplacement EST la frontière.**
 * C'est le même motif que `pim/channels/b2b-platform/` : ce dossier est la porte
 * que la production publie POUR le commerce, et tout ce qu'on y trouve est fait
 * pour être consommé de l'extérieur. Le reste de `production/` est son intérieur
 * — ses tables, son agrégat, ses règles.
 *
 * `lint:context-boundaries` le tient : `b2b → production` n'est autorisé QUE par
 * ce chemin. Une frontière qui est un dossier se voit en ouvrant `src/` ; un
 * suffixe `.port.ts` se discute.
 *
 * Port de LECTURE, implémenté par le commerce et relié dans `appBootstrap` : le
 * fournil ne connaît ni `PrismaService`, ni les tables `orders`. Il demande « ce
 * qu'il y a à produire ce jour-là » et reçoit des faits.
 *
 * ⚠️ Ce port ne rend **que ce qui est producible** — ni les annulées, ni les
 * brouillons. La règle appartient au commerce, qui seul sait ce que ses statuts
 * veulent dire ; la production n'a pas à connaître son énuméré.
 */
export abstract class DayOrdersReader {
  abstract producibleFor(day: ServiceDay): Promise<readonly ProducibleOrder[]>;
}
