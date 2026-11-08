import type {
  MailDeliveryCounts,
  MailDeliveryCriteria,
  MailRejection,
} from "../services/mail-rejections.js";

/**
 * Port de **lecture** des retours du fournisseur, comptés (T1b) : ce que la
 * carte de santé affiche et ce sur quoi la veille sonne. Distinct de
 * `MailBacklogReader` (ISP) : l'un compte ce qui ne part pas, l'autre ce qui
 * est parti et ce qu'il en est advenu. Il ne change rien.
 */
export abstract class MailDeliveryCountsReader {
  /** Les e-mails acceptés depuis `since`, par retour. */
  abstract counts(criteria: MailDeliveryCriteria): Promise<MailDeliveryCounts>;

  /**
   * Les modèles rebondis ou signalés dont le retour est arrivé depuis
   * `since` (et non envoyés depuis), le plus touché d'abord.
   */
  abstract rejections(criteria: MailDeliveryCriteria): Promise<readonly MailRejection[]>;
}
