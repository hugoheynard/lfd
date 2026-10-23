import type { BillingMailsCopy } from "../model/billing-mails.model.js";

/**
 * La famille « facturation et prélèvement », en français — la langue de
 * référence. Le mandat reprend le vocabulaire du formulaire joint
 * (`sepa-mandate-wording.ts`, vérifié le 2026-09-15) : un courriel qui dirait
 * « interentreprises » sur un papier CORE ferait douter du papier.
 */
export const BILLING_MAILS_FR: BillingMailsCopy = {
  "customer.invoice-issued": {
    title: "Votre facture {number}",
    subject: "{title} — {seller}",
    greeting: "Bonjour,",
    intro:
      "{seller} a émis la facture {number} adressée à {buyer}{period}, d'un montant de {total} TTC.",
    periodClause: " pour les commandes {period}",
    attachedNote:
      "Elle est jointe à ce message au format PDF Factur-X : votre logiciel comptable peut en lire les données.",
    invoiceLabel: "Facture",
    dateLabel: "Date",
    periodLabel: "Période",
    addressedToLabel: "Adressée à",
    dueLabel: "Échéance",
    paymentLabel: "Règlement",
    totalLabel: "Total TTC",
    cta: "Voir mes factures",
    footer:
      "Cette facture est consultable à tout moment dans votre espace client, rubrique « Mes factures ». Pour toute question, répondez à ce message.",
  },
  "customer.collection-notice": {
    title: {
      notice: "Avis de prélèvement",
      correction: "Avis de prélèvement rectifié",
      cancellation: "Prélèvement annulé",
    },
    subject: "{title} — {creditor} · {day}",
    greeting: "Bonjour,",
    cancelled:
      "Le prélèvement de {amount} que nous vous avions annoncé pour le {day} sur le compte de " +
      "{debtor} n'aura pas lieu. Aucune somme ne sera débitée à cette date.",
    correctionLead: "Cet avis remplace le précédent.",
    representationLead: "Il s'agit d'une nouvelle présentation du prélèvement rejeté du {day}.",
    announced:
      "{creditor} prélèvera {amount} sur le compte de {debtor} le {day}, au titre {pieces}.",
    piecesStatement: "de l'arrêté de facturation {statement}",
    piecesOneInvoice: "de la facture {number}",
    piecesInvoices: "des factures {numbers}",
    creditorLabel: "Créancier",
    creditorIdentifierLabel: "Identifiant créancier (ICS)",
    mandateReferenceLabel: "Référence du mandat (RUM)",
    cancelledAmountLabel: "Montant annulé",
    announcedDayLabel: "Date annoncée",
    previousLabel: "Annoncé précédemment",
    previousValue: "{amount} le {day}",
    collectionDayLabel: "Date du prélèvement",
    representationLabel: "Nouvelle présentation du rejet du",
    statementLabel: "Arrêté de facturation",
    invoiceLabel: "Facture",
    invoicesLabel: "Factures",
    amountLabel: "Montant",
    footer:
      "Ce prélèvement SEPA est effectué au titre du mandat référencé ci-dessus. " +
      "Pour toute question, répondez à ce message avant la date du prélèvement.",
  },
  "customer.mandate-to-sign": {
    scheme: {
      // CORE : ni « interentreprises », ni « aucun remboursement », ni
      // consigne de déclaration — la banque d'un débiteur CORE n'en exige aucune.
      CORE: {
        documentName: "mandat de prélèvement SEPA",
        footer:
          "Ce mandat relève du schéma SEPA CORE. Vous bénéficiez du droit d'être remboursé par " +
          "votre banque selon les conditions décrites dans la convention que vous avez passée avec " +
          "elle : une demande de remboursement doit être présentée dans les 8 semaines suivant la " +
          "date de débit de votre compte pour un prélèvement autorisé.",
      },
      // 🔴 B2B : la déclaration à la banque est une ÉTAPE, pas une remarque —
      // sans elle, la banque du débiteur refuse le premier prélèvement.
      B2B: {
        documentName: "mandat de prélèvement SEPA interentreprises",
        footer:
          "Important : ce mandat relève du schéma SEPA interentreprises (B2B). Il est " +
          "destiné uniquement à des transactions interentreprises et ne donne droit à " +
          "aucun remboursement une fois votre compte débité. Avant le premier " +
          "prélèvement, déclarez-le à votre banque avec la référence du mandat et " +
          "l'identifiant du créancier ci-dessus — sans cette déclaration, votre banque " +
          "refusera le prélèvement.",
      },
    },
    subject: "Votre {document} — {ref}",
    title: "Votre {document} à signer",
    greeting: "Bonjour,",
    intro:
      "Vous trouverez en pièce jointe le {document} établi pour {company}. Il est prérempli : " +
      "il ne vous reste qu'à le dater, le signer, et nous le renvoyer scanné ou photographié.",
    mandateReferenceLabel: "Référence du mandat (RUM)",
    creditorIdentifierLabel: "Identifiant créancier (ICS)",
    creditorLabel: "Créancier",
  },
};
