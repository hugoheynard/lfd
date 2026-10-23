import type { AccountMailsCopy } from "../model/account-mails.model.js";

/** La famille « compte client », en italien. Traduction du français, pas une variante. */
export const ACCOUNT_MAILS_IT: AccountMailsCopy = {
  "customer.access-opened": {
    subject: "Il suo accesso all'area professionale {company}",
    title: "Benvenuto, {firstName}",
    titleWithoutName: "Benvenuto",
    opened:
      "Un accesso all'area professionale di {company} è appena stato aperto a suo nome " +
      "dal team di La Folie Coffee.",
    choosePassword:
      "Non resta che scegliere la sua password. Il link qui sotto è valido 7 giorni; " +
      "trascorso questo termine, ci chieda semplicemente di inviargliene uno nuovo.",
    choosePasswordCta: "Scegliere la mia password",
    signInWithCode:
      "Acceda con il suo indirizzo {email}: riceverà un codice via e-mail, " +
      "da digitare nella schermata di accesso. Nessuna password da ricordare.",
    signInCta: "Accedere",
    passwordLink: "Oppure scelga una password (link valido 7 giorni)",
    footer:
      "Non si aspettava questa e-mail? La ignori: finché nessuno accede " +
      "con questo indirizzo, l'accesso resta inutilizzato.",
  },
  "customer.company-attached": {
    subject: "{company} è stata aggiunta alla sua area professionale",
    title: "Buongiorno, {firstName}",
    titleWithoutName: "Buongiorno",
    attached:
      "L'esercizio {company} è appena stato collegato alla sua area professionale " +
      "dal team di La Folie Coffee.",
    nothingToCreate:
      "Lo ritroverà al prossimo accesso, con le sue credenziali abituali — " +
      "nulla di nuovo da creare.",
    footer: "Non si aspettava questo collegamento? Risponda a questa e-mail, lo rimuoveremo.",
  },
  "customer.login-method-linked": {
    subject: "Un accesso {method} è stato aggiunto al suo account",
    title: "Buongiorno, {firstName}",
    titleWithoutName: "Buongiorno",
    linked:
      "Ora può accedere al suo account La Folie Coffee con " +
      "{method}, oltre al suo metodo abituale.",
    sameAccount: "È lo stesso account: stessi ordini, stesse informazioni.",
    footer:
      "Non è stato lei? Risponda a questa e-mail: " +
      "rimuoveremo questo metodo di accesso e verificheremo cosa è successo.",
  },
  "customer.password-reset": {
    subject: "Il suo link per cambiare password",
    title: "Cambiare la sua password",
    requested: "Ha appena chiesto di cambiare la password del suo account La Folie Coffee.",
    linkRules:
      "Il link qui sotto è monouso e scade tra {validity}. " +
      "Deve seguirlo per scegliere la sua nuova password.",
    validityOneHour: "{count} ora",
    validityHours: "{count} ore",
    cta: "Scegliere una nuova password",
    footer:
      "Non ha fatto questa richiesta? Non segua questo link e risponda a questa " +
      "e-mail: verificheremo cosa è successo.",
  },
  "customer.sub-account-activity": {
    title: {
      placed: "Ordine effettuato da uno dei suoi siti",
      cancelled: "Ordine annullato su uno dei suoi siti",
      abandoned: "Pagamento abbandonato su uno dei suoi siti",
      payment_failed: "Pagamento non riuscito su uno dei suoi siti",
    },
    action: {
      placed: "ha effettuato l'ordine",
      cancelled: "ha visto annullare l'ordine",
      abandoned: "ha abbandonato il pagamento dell'ordine",
      payment_failed: "non è riuscito a pagare l'ordine",
    },
    subject: "{site} — {title} ({order})",
    body: "Il suo sito {site} {action} {order}.",
    bodyEnteredByTeam: "Il suo sito {site} {action} {order} (ordine inserito dal nostro team).",
    siteLabel: "Sito",
    orderLabel: "Ordine",
    dayLabel: "Per il",
    totalLabel: "Importo IVA inclusa",
    footer:
      "Riceve questo messaggio perché questo sito è collegato al suo account. " +
      "Per non riceverlo più, ci scriva: regoliamo questi avvisi ruolo per ruolo.",
  },
  "customer.sub-account-gesture": {
    title: {
      problem_reported: "Problema segnalato da uno dei suoi siti",
      delivery_address_added: "Indirizzo di consegna aggiunto su uno dei suoi siti",
      delivery_address_updated: "Indirizzo di consegna modificato su uno dei suoi siti",
      delivery_address_removed: "Indirizzo di consegna rimosso su uno dei suoi siti",
      default_delivery_set: "Indirizzo di consegna predefinito cambiato su uno dei suoi siti",
      contact_added: "Contatto aggiunto su uno dei suoi siti",
      contact_updated: "Contatto modificato su uno dei suoi siti",
      contact_removed: "Contatto rimosso su uno dei suoi siti",
      primary_contact_changed: "Contatto principale cambiato su uno dei suoi siti",
      bank_account_changed: "Nuove coordinate bancarie su uno dei suoi siti",
      mandate_proof_attached: "Prova di mandato depositata su uno dei suoi siti",
      subscription_created: "Paniere ricorrente creato su uno dei suoi siti",
      subscription_paused: "Paniere ricorrente messo in pausa su uno dei suoi siti",
      subscription_resumed: "Paniere ricorrente ripreso su uno dei suoi siti",
      subscription_stopped: "Paniere ricorrente interrotto su uno dei suoi siti",
    },
    action: {
      problem_reported: "ha segnalato un problema sull'ordine",
      delivery_address_added: "ha aggiunto un indirizzo di consegna",
      delivery_address_updated: "ha modificato un indirizzo di consegna",
      delivery_address_removed: "ha rimosso un indirizzo di consegna",
      default_delivery_set: "ha cambiato il suo indirizzo di consegna predefinito",
      contact_added: "ha aggiunto un contatto",
      contact_updated: "ha modificato un contatto",
      contact_removed: "ha rimosso un contatto",
      primary_contact_changed: "ha cambiato il suo contatto principale",
      bank_account_changed: "ha registrato nuove coordinate bancarie",
      mandate_proof_attached: "ha depositato una prova di mandato",
      subscription_created: "ha creato un paniere ricorrente",
      subscription_paused: "ha messo in pausa un paniere ricorrente",
      subscription_resumed: "ha ripreso un paniere ricorrente",
      subscription_stopped: "ha interrotto un paniere ricorrente",
    },
    subject: "{site} — {title}",
    subjectWithReference: "{site} — {title} ({reference})",
    body: "Il suo sito {site} {action}.",
    bodyWithReference: "Il suo sito {site} {action} {reference}.",
    bodyByTeam: "Il suo sito {site} {action} (fatto dal nostro team).",
    bodyWithReferenceByTeam: "Il suo sito {site} {action} {reference} (fatto dal nostro team).",
    siteLabel: "Sito",
    referenceLabel: "Riferimento",
    referenceLabelOf: { problem_reported: "Ordine" },
    footer:
      "Riceve questo messaggio perché questo sito è collegato al suo account. " +
      "Per non riceverlo più, ci scriva: regoliamo questi avvisi ruolo per ruolo.",
  },
};
