import type { ServableOccurrence, UnservableOccurrence } from "../services/servable-occurrence.js";
import type { IsoDate } from "../value-objects/iso-date.js";

/**
 * **Ce que le panier sait répondre au planificateur** : l'échéance d'un jour,
 * prête à devenir une commande, ou pourquoi elle ne l'est pas. Déclaré et
 * implémenté par le contexte des paniers, lu par la passation d'une échéance
 * (`orders`), qui ne lit jamais les tables des paniers.
 *
 * Sans mur de personne : c'est la machine qui demande, pour le compte de
 * l'acheteur que l'échéance nomme ; la passation oppose ensuite le mur à cet
 * acheteur-là.
 */
export abstract class RecurringOccurrences {
  abstract occurrenceOn(
    subscriptionId: string,
    date: IsoDate,
  ): Promise<ServableOccurrence | UnservableOccurrence>;
}
