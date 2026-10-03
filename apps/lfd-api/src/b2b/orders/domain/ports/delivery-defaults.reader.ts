import type { DeliveryContact, FulfillmentWindow, WindowMode } from "@lfd/contracts";

/**
 * Les **réglages d'une adresse du carnet** qui préremplissent une commande :
 * qui reçoit, faut-il signer, dans quelle tranche.
 *
 * Port distinct de la lecture des adresses côté compte : ici on ne veut ni la
 * ligne postale, ni le libellé, ni l'archivage — seulement les trois valeurs qui
 * entrent dans l'acheminement convenu. Un port large aurait fait dépendre le
 * chemin de commande de tout ce que le carnet sait faire.
 */
export interface DeliveryDefaults {
  readonly contact: DeliveryContact | null;
  readonly signatureRequired: boolean;
  readonly window: FulfillmentWindow | null;
  /**
   * Créneau ou échéance pour CETTE adresse ; `null` = elle hérite du réglage
   * global de livraison (CA-D2). La résolution se fait à la passation, avec le
   * global : une adresse dictée n'a pas de carnet, mais a un mode.
   */
  readonly windowMode: WindowMode | null;
  /**
   * Les échéances préférées de l'adresse **pour le jour servi**, triées. Une
   * échéance de cette liste demandée par la commande est une reprise
   * (`default`), toute autre heure un choix (`override`).
   */
  readonly deadlines: readonly string[];
  /**
   * L'adresse du carnet, **confirmée sous le mur** de la société — ou `null`
   * quand elle n'y est pas (inconnue, ou d'une autre maison).
   *
   * 🔴 C'est ce qui rend le lien `orders.delivery_address_id` sûr à écrire :
   * l'identifiant vient du corps de la commande, et seul un identifiant rendu
   * ICI a été lu avec `company_id` dans le `where`. Écrire celui du corps
   * relierait la commande d'un client aux consignes et à la procédure d'une
   * autre maison, que la feuille de route servirait ensuite au livreur.
   */
  readonly bookAddressId: string | null;
}

/** Aucun réglage : adresse dictée à la volée, ou adresse sans consignes. */
export const NO_DELIVERY_DEFAULTS: DeliveryDefaults = {
  contact: null,
  signatureRequired: false,
  window: null,
  windowMode: null,
  deadlines: [],
  bookAddressId: null,
};

export abstract class DeliveryDefaultsReader {
  /**
   * Les consignes d'une adresse du carnet **de cette société**. Rend
   * {@link NO_DELIVERY_DEFAULTS} quand l'adresse n'existe pas, n'appartient pas
   * à `companyId`, ou n'a rien de renseigné — une commande ne se refuse pas
   * parce qu'un réglage est vide.
   *
   * 🔴 **La société est un argument, et pas une option.** L'identifiant
   * d'adresse vient du corps de la commande : lu sans le mur, il importait dans
   * la commande de n'importe quel client le contact de livraison (nom,
   * téléphone), la signature et le créneau d'une AUTRE maison (corrigé le
   * 2026-09-15).
   *
   * `day` (`YYYY-MM-DD`, ou `null`) choisit les échéances préférées d'un
   * réglage par jour.
   */
  abstract of(addressId: string, companyId: string, day: string | null): Promise<DeliveryDefaults>;
}
