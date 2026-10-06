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

/** L'adresse d'acheminement, en champs postaux — de quoi l'écrire en lignes. */
export interface SheetAddress {
  readonly line1: string;
  readonly line2: string;
  readonly postalCode: string;
  readonly city: string;
}

/** La fenêtre convenue, `HH:mm`. `start: null` = « avant `end` ». */
export interface SheetWindow {
  readonly start: string | null;
  readonly end: string;
}

/**
 * Qui appeler en livrant. `holder` = le détenteur du compte, repli quand rien
 * n'a été convenu sur la commande ; `phone` peut être vide.
 */
export interface SheetContact {
  readonly source: "order" | "holder";
  readonly name: string;
  readonly phone: string;
}

/**
 * **Ce que le bon de commande imprime, au-delà de l'étiquette** — figé à
 * l'arrêt pour que le dossier envoyé soit le même papier que l'impression de
 * l'écran (plan `documentation/production/dossier-prod-du-jour.md`, E1b,
 * décision de Hugo du 2026-10-06 : « fige les champs à l'arrêt »).
 *
 * Tout est déjà RÉSOLU par le commerce : l'enseigne contre la raison sociale,
 * le contact contre le détenteur, le point nommé. Le fournil met en page, il
 * ne choisit rien. Aucun montant, comme le reste du port.
 *
 * Le numéro de révision n'y est pas : le commerce le vaut `0` sur toute
 * commande, le mécanisme d'avenant n'existe pas (vérifié le 2026-10-06 dans
 * `order-sheet.ts`, `REVISION_WITHOUT_AMENDMENTS`).
 */
export interface OrderSheetDetails {
  /** L'enseigne, `""` sans enseigne. */
  readonly tradeName: string;
  /** La raison sociale — ou la personne, sur une commande sans société. */
  readonly legalName: string;
  /** Le point de retrait NOMMÉ, quand c'en est un. */
  readonly pickupLabel: string | null;
  /** L'adresse qui correspond au mode, `null` si la commande n'en a figé aucune. */
  readonly address: SheetAddress | null;
  readonly window: SheetWindow | null;
  readonly contact: SheetContact | null;
  readonly signatureRequired: boolean;
  /** La note du client, `""` sans note. */
  readonly note: string;
  /** Passée par un abonnement — la seule origine qui apprend quelque chose au fournil. */
  readonly recurring: boolean;
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
  /**
   * **L'échéance**, `HH:mm` sur la journée : le début du créneau s'il y en a
   * un, sinon la fin de l'échéance — la règle du compte à rebours
   * (`deadline-thresholds.ts`, tranchée par Hugo le 2026-10-04). `null` =
   * aucune échéance convenue ; le colisage la place alors en dernier.
   *
   * Ajoutée pour le colisage (plan `colisage/colisage.md`, §13) :
   * la liste à coliser attribue ce qui sort du four par échéance croissante.
   */
  readonly dueAt: string | null;
  readonly lines: readonly ProducibleLine[];
  /**
   * Le reste du bon (E1b). Toujours rempli par le commerce ; `null` ne se
   * rencontre que sur une commande figée avant le lot, relue de la base.
   */
  readonly sheetDetails: OrderSheetDetails | null;
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
