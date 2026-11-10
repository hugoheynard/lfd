import type { PurchasedSku } from "../services/usuals.js";

/** Ce qu'on demande aux commandes : l'historique d'UNE société, depuis un jour. */
export interface PurchaseHistoryAsk {
  /** La société du lecteur, résolue en base par le contexte de la requête — jamais reçue du client. */
  readonly companyId: string;
  /** Premier jour métier de la fenêtre `AAAA-MM-JJ` (Paris), compris. */
  readonly since: string;
}

/**
 * Port de **lecture** de l'historique d'achat d'une société (R1, « vos
 * habituels ») — déclaré par la recommandation, implémenté par la commande,
 * comme `CoPurchaseReader`.
 *
 * 🔴 Le mur est dans la requête : `company_id` dans le `where`, agrégat
 * compris. Il ne rend ni commande, ni personne, ni montant : un SKU et les
 * jours de ses commandes.
 *
 * Le jour d'une commande est celui pour lequel elle est passée (retrait ou
 * livraison), sinon le jour de sa passation à Paris : « tous les mardis » dit
 * quand la société reçoit, pas quand elle clique.
 */
export abstract class PurchaseHistoryReader {
  /** Les articles commandés par cette société depuis `since`, chacun avec le jour de chaque commande. */
  abstract ofCompany(ask: PurchaseHistoryAsk): Promise<readonly PurchasedSku[]>;
}
