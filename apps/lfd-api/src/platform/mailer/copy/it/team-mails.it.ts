import type { TeamMailsCopy } from "../model/team-mails.model.js";

/** La famille « équipe », en italien. Traduction du français, pas une variante. */
export const TEAM_MAILS_IT: TeamMailsCopy = {
  "staff.appointment-booked": {
    kicker: "Appuntamento",
    subject: "Nuovo appuntamento — {contact} · {when}",
    title: "È appena stato preso un appuntamento",
    contactLabel: "Contatto",
    whenLabel: "Quando",
    purposeLabel: "Motivo",
    channelLabel: "Canale",
    cta: "Aprire l'appuntamento",
    footer: "Avviso interno LFC — inviato al team commerciale.",
  },
  "staff.account-alert": {
    kicker: "Avviso account",
    subject: "Avviso — {company} · {rule}",
    title: "{rule} su {company}",
    accountLabel: "Account",
    orderLabel: "Ordine",
    cta: "Aprire l'account",
  },
  "staff.invited": {
    kicker: "Invito",
    subject: "Il suo accesso al back-office La Folie Douce",
    title: "Benvenuto nel team, {firstName}",
    titleWithoutName: "Benvenuto nel team",
    opened: "Un accesso al back-office è appena stato aperto a suo nome.",
    choosePassword:
      "Non resta che scegliere la sua password. Il link qui sotto è valido 7 giorni; " +
      "trascorso questo termine, chieda a un amministratore di inviargliene uno nuovo.",
    cta: "Scegliere la mia password",
    footer:
      "Non si aspettava questa e-mail? La ignori: senza una password scelta, nessun accesso è aperto.",
  },
  "staff.password-reset": {
    kicker: "Password",
    subject: "Il suo link per la password — back-office La Folie Douce",
    title: "Nuova password, {firstName}",
    titleWithoutName: "Nuova password",
    issued: "È appena stato emesso un link di cambio password per il suo accesso al back-office.",
    linkRules:
      "È valido 7 giorni ed è monouso. Se non l'ha richiesto, la sua " +
      "password attuale resta valida: basta ignorare questo messaggio.",
    cta: "Scegliere una nuova password",
  },
  "staff.access-suspended": {
    kicker: "Accesso sospeso",
    subject: "Il suo accesso al back-office è sospeso",
    title: "Accesso sospeso, {firstName}",
    titleWithoutName: "Accesso sospeso",
    suspended: "Il suo accesso al back-office La Folie Douce è stato sospeso.",
    whatRemains:
      "Le sue credenziali restano valide: nulla è stato eliminato, e un amministratore " +
      "può riaprire l'accesso in qualsiasi momento. Nel frattempo, l'accesso sarà rifiutato.",
    footer: "Questa e-mail la avvisa di un cambiamento di accesso. Non richiede alcuna azione.",
  },
  "staff.access-restored": {
    kicker: "Accesso ripristinato",
    subject: "Il suo accesso al back-office è ripristinato",
    title: "Accesso ripristinato, {firstName}",
    titleWithoutName: "Accesso ripristinato",
    restored: "Il suo accesso al back-office La Folie Douce è di nuovo aperto.",
    howToSignIn:
      "Acceda con la sua password abituale. Se non la ricorda più, " +
      "chieda un link a un amministratore.",
    cta: "Aprire il back-office",
  },
  "staff.production-dossier": {
    kicker: "Dossier di produzione",
    subject: "Dossier di produzione — piano del {day}",
    subjectCompleted: "Dossier di produzione completato — piano del {day}",
    greeting: "Buongiorno {firstName},",
    greetingWithoutName: "Buongiorno,",
    arrested: "Il piano di produzione del {day} è stato chiuso {by} il {at}.",
    arrestedWithoutAuthor: "Il piano di produzione del {day} è stato chiuso il {at}.",
    completed:
      "Il piano del {day} è stato completato {by} il {at}: " +
      "nuovi ordini sono stati aggiunti all'infornata.",
    completedWithoutAuthor:
      "Il piano del {day} è stato completato il {at}: " +
      "nuovi ordini sono stati aggiunti all'infornata.",
    attachment:
      "Trova in allegato il dossier da stampare: un riepilogo di ciò che " +
      "occorre produrre, poi un buono per ordine.",
    attachmentWithResupplies:
      "Trova in allegato il dossier da stampare: un riepilogo di ciò che " +
      "occorre produrre, poi un buono per ordine e per rifornimento.",
    figures: "In cifre: {figures}.",
    figuresPlain: "{orders} e {pieces}",
    figuresSplit: "{orders} — {split} — e {pieces}",
    figuresWithResupplies: "{head} — {resupplies} e {share}",
    ordersWithSplit: "{orders} — {split}",
    pickupShare: "{count} con ritiro",
    deliveryShare: "{count} con consegna",
    resupplyPieceShare: "{pieces} di cui {count} di rifornimento",
    orderOne: "{count} ordine",
    orderMany: "{count} ordini",
    pieceOne: "{count} pezzo",
    pieceMany: "{count} pezzi",
    resupplyOne: "{count} rifornimento",
    resupplyMany: "{count} rifornimenti",
    replacesPrevious: "Questo dossier sostituisce il precedente.",
    signature: "La Folie Coffee — Laboratorio",
    footer:
      "Questa e-mail parte automaticamente a ogni chiusura del piano. Per non riceverla più, " +
      "chieda al team di rimuoverla dai destinatari (Produzione › Impostazioni).",
  },
  "staff.support-requested": {
    kicker: "Richiesta di assistenza",
    subject: "Richiesta di contatto — {contact} · {purpose}",
    title: "Un cliente chiede di essere contattato",
    contactLabel: "Contatto",
    purposeLabel: "Motivo",
    availabilityLabel: "Disponibilità",
    phoneLabel: "Telefono",
    footer: "Avviso interno LFC — inviato al team commerciale.",
  },
  "staff.customer-request": {
    kicker: "Richiesta cliente",
    subject: "{form} — {reason} · {author}",
    subjectWithOrder: "{form} — {reason} · {order} · {author}",
    urgentSubject: "[Urgente] {subject}",
    title: "È arrivata una richiesta tramite «{form}»",
    reasonLabel: "Motivo",
    orderLabel: "Ordine",
    photosLabel: "Foto",
    photosValue: "{count} — da vedere nel back-office",
    fromLabel: "Da",
    emailLabel: "E-mail",
    phoneLabel: "Telefono",
    originLabel: "Provenienza",
    clientLabel: "Cliente",
    cta: "Aprire la richiesta",
    footer:
      "Rispondere a questa e-mail scrive direttamente al suo autore. La richiesta è archiviata nel back-office, sotto Commerciale › Richieste clienti.",
  },
  "ops.deploy-check": {
    kicker: "Verifica del rilascio",
    subject: "[LFC] Posta operativa — {revision}",
    title: "La posta in uscita funziona",
    revisionLabel: "Revisione",
    senderLabel: "Mittente",
    message:
      "Questa e-mail è partita dal backend distribuito. La sua sola presenza qui prova che " +
      "la chiave Resend raggiunge il container, che il mittente è su un dominio " +
      "verificato e che il messaggio viene recapitato.",
    footer:
      "Messaggio automatico di controllo, inviato a ogni distribuzione. " +
      "Se smette di arrivare, il canale e-mail è caduto — anche se nient'altro lo dice.",
  },
  "agency.vitrine-notice": {
    kicker: "Avviso vetrina",
    footer:
      "Riceve questo messaggio come contatto di un abbonato al webhook della vetrina di La Folie Douce.",
  },
};
