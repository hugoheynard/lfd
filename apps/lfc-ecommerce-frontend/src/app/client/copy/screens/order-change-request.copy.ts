/**
 * **Demander une modification après l'heure limite** — le tiroir et l'écran de
 * modification en mode « demande » (plan
 * `documentation/commandes/plan-modifier-une-commande.md`, M4). Greffé dans
 * `orders.revision.request` ; à part de `orders.copy.ts` pour ne pas
 * l'allonger.
 *
 * Les refus du serveur ne sont PAS ici : ils se disent par leur message, que
 * le serveur écrit pour le client (`contact.order_change.*`).
 */
export interface OrderChangeRequestCopy {
  /** Le bouton du tiroir quand l'heure limite est passée. */
  readonly requestAction: string;
  /** Sous le bouton : `{when}` reçoit l'heure limite passée. */
  readonly requestNote: string;
  /** Sous le bouton, sans échéance connue. */
  readonly requestNoteWithoutWhen: string;
  /** Le tiroir : une demande attend notre réponse. */
  readonly requestPendingNote: string;
  /** Le tiroir : la dernière demande a été appliquée. */
  readonly requestAppliedNote: string;
  /** Le tiroir : la dernière demande a été refusée — `{reason}` reçoit notre mot. */
  readonly requestRefusedNote: string;
  /** L'écran, en mode demande : titre. */
  readonly requestTitle: string;
  /** L'écran, en mode demande : pourquoi on demande au lieu de modifier. */
  readonly requestLead: string;
  /** Le titre de la carte qui remplace le nouveau total. */
  readonly requestSendTitle: string;
  /** Ce qui se passe ensuite. */
  readonly requestSendNote: string;
  /** Sous le nouveau total d'une demande : il est indicatif (§14, décision de Hugo du 2026-10-23). */
  readonly requestQuoteIndicative: string;
  /** Le mot facultatif à l'équipe. */
  readonly requestMessageLabel: string;
  readonly requestMessagePlaceholder: string;
  readonly requestSubmitCta: string;
  readonly requestSubmittingCta: string;
  /** Le repli d'un refus dont le serveur n'a pas dit la phrase. */
  readonly requestRefused: string;
  readonly requestSentToast: string;
}

export const ORDER_CHANGE_REQUEST_FR: OrderChangeRequestCopy = {
  requestAction: 'Demander une modification',
  requestNote:
    'L’heure limite ({when}) est passée : vous pouvez encore nous demander une modification, notre équipe vous répond par e-mail.',
  requestNoteWithoutWhen:
    'L’heure limite est passée : vous pouvez encore nous demander une modification, notre équipe vous répond par e-mail.',
  requestPendingNote: 'Modification demandée — en attente de notre réponse.',
  requestAppliedNote:
    'Votre demande de modification a été acceptée : la commande ci-dessus est à jour.',
  requestRefusedNote: 'Votre demande de modification n’a pas pu être acceptée : « {reason} »',
  requestTitle: 'Demander une modification',
  requestLead:
    'L’heure limite est passée : composez la commande voulue, notre équipe l’examine et vous répond par e-mail.',
  requestSendTitle: 'Votre demande',
  requestSendNote:
    'Rien ne change tant que notre équipe n’a pas répondu. Si elle accepte, le nouveau total vous est confirmé par e-mail.',
  requestQuoteIndicative:
    'Montant indicatif, sous réserve d’acceptation par notre équipe ; le montant appliqué peut différer si les prix changent d’ici là.',
  requestMessageLabel: 'Un mot pour notre équipe (facultatif)',
  requestMessagePlaceholder: 'Par exemple : une personne de plus au déjeuner.',
  requestSubmitCta: 'Demander cette modification',
  requestSubmittingCta: 'Envoi…',
  requestRefused: 'La demande n’a pas pu être envoyée.',
  requestSentToast: 'Demande envoyée : nous vous répondons par e-mail.',
};

export const ORDER_CHANGE_REQUEST_EN: OrderChangeRequestCopy = {
  requestAction: 'Request a change',
  requestNote:
    'The deadline ({when}) has passed: you can still ask us for a change, our team will reply by email.',
  requestNoteWithoutWhen:
    'The deadline has passed: you can still ask us for a change, our team will reply by email.',
  requestPendingNote: 'Change requested — awaiting our reply.',
  requestAppliedNote: 'Your change request was accepted: the order above is up to date.',
  requestRefusedNote: 'Your change request could not be accepted: “{reason}”',
  requestTitle: 'Request a change',
  requestLead:
    'The deadline has passed: put together the order you want, our team will review it and reply by email.',
  requestSendTitle: 'Your request',
  requestSendNote:
    'Nothing changes until our team has replied. If they accept, the new total is confirmed by email.',
  requestQuoteIndicative:
    'Indicative amount, subject to acceptance by our team; the amount applied may differ if prices change in the meantime.',
  requestMessageLabel: 'A word for our team (optional)',
  requestMessagePlaceholder: 'For example: one more person at lunch.',
  requestSubmitCta: 'Request this change',
  requestSubmittingCta: 'Sending…',
  requestRefused: 'The request could not be sent.',
  requestSentToast: 'Request sent: we will reply by email.',
};

export const ORDER_CHANGE_REQUEST_IT: OrderChangeRequestCopy = {
  requestAction: 'Chiedi una modifica',
  requestNote:
    'L’orario limite ({when}) è passato: puoi ancora chiederci una modifica, il nostro team ti risponde via e-mail.',
  requestNoteWithoutWhen:
    'L’orario limite è passato: puoi ancora chiederci una modifica, il nostro team ti risponde via e-mail.',
  requestPendingNote: 'Modifica richiesta — in attesa della nostra risposta.',
  requestAppliedNote:
    'La tua richiesta di modifica è stata accettata: l’ordine qui sopra è aggiornato.',
  requestRefusedNote: 'La tua richiesta di modifica non è stata accettata: «{reason}»',
  requestTitle: 'Chiedi una modifica',
  requestLead:
    'L’orario limite è passato: componi l’ordine che desideri, il nostro team lo esamina e ti risponde via e-mail.',
  requestSendTitle: 'La tua richiesta',
  requestSendNote:
    'Nulla cambia finché il nostro team non ha risposto. Se accetta, il nuovo totale ti viene confermato via e-mail.',
  requestQuoteIndicative:
    'Importo indicativo, soggetto all’accettazione del nostro team; l’importo applicato può variare se nel frattempo i prezzi cambiano.',
  requestMessageLabel: 'Una parola per il nostro team (facoltativa)',
  requestMessagePlaceholder: 'Per esempio: una persona in più a pranzo.',
  requestSubmitCta: 'Chiedi questa modifica',
  requestSubmittingCta: 'Invio…',
  requestRefused: 'Non è stato possibile inviare la richiesta.',
  requestSentToast: 'Richiesta inviata: ti rispondiamo via e-mail.',
};
