import type { MailSendDelivery, MailSendState, OrderMailView } from '@lfd/contracts';

/** La teinte d'un état d'e-mail, celle des badges fold. */
export type OrderMailTone = 'neutral' | 'info' | 'success' | 'warning' | 'alert';

/** L'état d'un e-mail de la commande, en mots simples, et sa teinte. */
export interface OrderMailStatus {
  readonly label: string;
  readonly tone: OrderMailTone;
}

/**
 * L'étape où en est l'e-mail côté envoi, telle que le serveur la sert : demandé,
 * en cours, accepté par le service d'envoi, échoué, refusé. Aucune étape n'est
 * dite plus loin qu'elle ne l'est : « accepté » n'est pas « remis ».
 */
const STATE_STATUS: Readonly<Record<MailSendState, OrderMailStatus>> = {
  requested: { label: 'Demandé', tone: 'neutral' },
  sending: { label: 'Envoi en cours', tone: 'neutral' },
  accepted: { label: 'Accepté par l’envoi', tone: 'info' },
  failed: { label: 'Échec de l’envoi', tone: 'alert' },
  refused: { label: 'Refusé', tone: 'alert' },
};

/** Le retour du destinataire, quand il est connu : il dit l'étape la plus avancée. */
const DELIVERY_STATUS: Readonly<Record<MailSendDelivery, OrderMailStatus>> = {
  dry_run: { label: 'Non envoyé — mode dev', tone: 'neutral' },
  delayed: { label: 'Remise retardée', tone: 'warning' },
  delivered: { label: 'Remis', tone: 'success' },
  complained: { label: 'Signalé comme indésirable', tone: 'alert' },
  bounced: { label: 'Rebond', tone: 'alert' },
};

/**
 * L'état d'un e-mail de la commande, pour l'onglet « Documents » : l'étape
 * exacte servie par l'API, sans le nom du prestataire ni le jargon d'un envoi
 * à blanc. Un retour du destinataire (remis, rebond…) l'emporte sur l'étape
 * d'envoi ; un échec d'envoi l'emporte sur tout.
 */
export function orderMailStatus(mail: Pick<OrderMailView, 'state' | 'delivery'>): OrderMailStatus {
  if (mail.state === 'failed' || mail.state === 'refused' || mail.delivery === null) {
    return STATE_STATUS[mail.state];
  }
  return DELIVERY_STATUS[mail.delivery];
}
