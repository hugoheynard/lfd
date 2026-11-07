/**
 * Port **d'attente** : laisser passer un délai avant de relire. La sonde de
 * déploiement s'en sert pour espacer ses relectures de l'envoi différé
 * (plan `plan-service-e-mails.md`, § 25).
 *
 * Un port plutôt qu'un `setTimeout` dans le handler : le test l'avance d'un
 * coup avec l'horloge du mur, sans attendre deux minutes.
 */
export abstract class Pause {
  abstract wait(ms: number): Promise<void>;
}
