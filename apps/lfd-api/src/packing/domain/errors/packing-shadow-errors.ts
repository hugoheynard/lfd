import { TechnicalError } from "../../../platform/shared/errors/app-error.js";

/**
 * Une demande de retour sur une journée `packing` est arrivée à un binaire
 * qui ne sait que tenir l'ombre (K1). La trancher ici serait décider à la place
 * du colisage réel ; l'ignorer la perdrait. Elle échoue donc, et reste visible
 * dans la boîte d'envoi jusqu'au binaire qui sait y répondre.
 */
export class ReturnDecisionNotYetServedError extends TechnicalError {
  constructor(requestId: string) {
    super(
      "packing.return_decision_not_served",
      `La demande de retour « ${requestId} » vise une journée colisée par le nouveau poste, que ce ` +
        "déploiement ne sait pas encore trancher. Rien n'a été rendu ; le message reste dans la boîte " +
        "d'envoi — déployer la bascule du colisage (K2) puis le rejouer depuis la carte de santé.",
    );
  }
}
