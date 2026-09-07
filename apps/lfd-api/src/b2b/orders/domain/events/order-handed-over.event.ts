import type { HandoverVia } from "../services/handover.js";

/**
 * Fait de domaine : **une commande vient d'être remise**. Publié par le contexte
 * `orders` après persistance ; le contexte ne sait pas qui l'écoute.
 *
 * C'est le fait le plus important du cycle : celui qu'on cherchera le jour où un
 * client dit n'avoir rien reçu. Il porte donc **qui** a remis et **quand** — pas
 * pour qu'un abonné les recalcule, mais pour qu'ils soient figés dans la trace
 * au moment où ils étaient vrais.
 */
export class OrderHandedOverEvent {
  constructor(
    readonly orderId: string,
    readonly orderNumber: string,
    /** Le client à qui la commande appartient — le sujet de la trace. */
    readonly placedByUserId: string,
    /** L'identité staff qui a scanné (claim `sub`), figée. */
    readonly handedOverBy: string,
    /** L'instant de la remise, tel que l'horloge du serveur l'a donné. */
    readonly handedOverAt: Date,
    /**
     * **Comment** elle a été constatée. Porté par le fait, pas relu ensuite :
     * une remise scannée et une remise saisie n'ont pas la même force, et le
     * journal doit garder laquelle c'était — pas ce que la ligne dira demain.
     */
    readonly via: HandoverVia,
  ) {}
}
