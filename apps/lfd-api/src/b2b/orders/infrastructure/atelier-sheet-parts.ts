import type { BillingAddressPayload, OrderFulfillment, SheetContact } from "@lfd/contracts";

/**
 * Les morceaux du bon d'atelier que DEUX lecteurs composent : la fiche de
 * l'écran (`PrismaOrderReader.listForProduction`) et ce que le commerce remet
 * au fournil à l'arrêt (`PrismaDayOrdersReader`, E1b). Une seule règle pour le
 * contact et le point nommé — sans quoi le dossier envoyé et l'impression de
 * l'écran diraient deux choses du même bon.
 */

/**
 * **Qui appeler en livrant**, dans l'ordre : le contact convenu sur la commande,
 * puis le détenteur du compte, puis personne.
 *
 * La fiche ne relit **plus le carnet d'adresses**. Elle le faisait, et c'était
 * le défaut : changer le contact d'une adresse réécrivait des bons déjà partis
 * en tournée. Ce qui a été convenu à la passation est figé sur la commande, et
 * ce qui bouge ensuite passe par un avenant.
 *
 * Le détenteur reste une lecture vivante, faute de mieux — mais il ne change
 * pas d'un jour à l'autre comme un réglage, et c'est un repli, pas la règle.
 * Rendre `null` plutôt qu'un nom bricolé permet à la fiche d'écrire « aucun
 * contact », ce qui est une information et pas un blanc.
 */
export function contactOf(
  agreed: OrderFulfillment,
  company: HolderSide | null,
): SheetContact | null {
  const onOrder = agreed.contact.value;
  if (onOrder !== null) {
    return {
      source: "order",
      name: `${onOrder.prenom} ${onOrder.nom}`.trim(),
      phone: onOrder.telephone,
    };
  }
  const holder = company?.memberships[0]?.user;
  if (holder === undefined) {
    return null;
  }
  const name = `${holder.firstName} ${holder.lastName}`.trim();
  return name === "" ? null : { source: "holder", name, phone: holder.phone };
}

/** Le détenteur du compte tel que la requête le ramène (0 ou 1 ligne). */
export interface HolderSide {
  readonly memberships: readonly {
    readonly user: {
      readonly firstName: string;
      readonly lastName: string;
      readonly phone: string;
    };
  }[];
}

/**
 * Le nom du point de retrait figé à la commande. Le snapshot est validé plutôt
 * que casté — une commande antérieure au point de retrait n'en porte pas, et un
 * JSON d'une autre forme ne doit pas remonter en vue.
 */
export function pickupLabelOf(address: BillingAddressPayload | null): string | null {
  if (address === null || address.label === "") {
    return null;
  }
  return address.label;
}
