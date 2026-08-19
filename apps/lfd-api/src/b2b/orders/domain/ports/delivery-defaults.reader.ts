import type { DeliveryContact, FulfillmentWindow } from "@lfd/contracts";

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
}

/** Aucun réglage : adresse dictée à la volée, ou adresse sans consignes. */
export const NO_DELIVERY_DEFAULTS: DeliveryDefaults = {
  contact: null,
  signatureRequired: false,
  window: null,
};

export abstract class DeliveryDefaultsReader {
  /**
   * Les consignes d'une adresse du carnet. Rend {@link NO_DELIVERY_DEFAULTS}
   * quand l'adresse n'existe pas ou n'a rien de renseigné — une commande ne se
   * refuse pas parce qu'un réglage est vide.
   */
  abstract of(addressId: string): Promise<DeliveryDefaults>;
}
