/**
 * **Une commande au compte de ce payeur attend-elle sa facture ?** Déclaré
 * par le compte, implémenté par la comptabilité (qui seule sait ce que
 * « facturée » veut dire) ; relié dans `appBootstrap`. Lu par le geste de la
 * fiche Chorus avant un changement du moment de l'engagement.
 */
export abstract class PayerUninvoicedOrdersReader {
  abstract hasUninvoicedOrders(payerCompanyId: string): Promise<boolean>;
}
