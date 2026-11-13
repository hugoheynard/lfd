import type { SetMandateDefaultsPayload } from "@lfd/contracts";
import type {
  CorrectLegalEntityPayload,
  DeclareLegalEntityPayload,
  SetBankCollectionLimitsPayload,
  SetCollectionSchedulePayload,
  SetCreditorAccountPayload,
  SetInvoicePaymentTermsPayload,
} from "@lfd/contracts";

/**
 * Les intentions d'écriture sur une entité émettrice.
 *
 * Groupées dans un fichier, leurs handlers séparés : une commande est une
 * structure de données de trois lignes, et six fichiers de trois lignes cachent
 * l'ensemble plus qu'ils ne le rangent. Les handlers, eux, portent chacun une
 * règle — c'est là que l'unité par fichier paie.
 */
export class DeclareLegalEntityCommand {
  constructor(
    readonly payload: DeclareLegalEntityPayload,
    /** La fiche staff de qui déclare — l'acteur de l'intention. */
    readonly staffUserId: string,
    /** La clé d'intention de l'écran : un second envoi rend la même entité. */
    readonly intentKey: string,
  ) {}
}

export class CorrectLegalEntityCommand {
  constructor(
    readonly legalEntityId: string,
    readonly payload: CorrectLegalEntityPayload,
  ) {}
}

/** L'attribution de l'ICS — **sans retour**, et l'agrégat le fera respecter. */
export class AssignCreditorIdentifierCommand {
  constructor(
    readonly legalEntityId: string,
    readonly ics: string,
  ) {}
}

/**
 * Le compte où l'argent arrive.
 *
 * L'IBAN traverse cette commande en clair, et c'est le seul endroit du système
 * où il le fait. Il ne redescend jamais : la vue n'en rend que quatre
 * caractères, et le journal non plus.
 */
export class SetCreditorAccountCommand {
  constructor(
    readonly legalEntityId: string,
    readonly payload: SetCreditorAccountPayload,
    /** La fiche staff de qui saisit — l'auteur d'une proposition en attente. */
    readonly staffId: string,
  ) {}
}

/**
 * La confirmation d'une modification du compte en attente, par un AUTRE
 * membre que son auteur, qui ressaisit l'IBAN depuis le RIB de la banque.
 */
export class ConfirmCreditorAccountCommand {
  constructor(
    readonly legalEntityId: string,
    readonly pendingId: string,
    readonly iban: string,
    readonly staffId: string,
  ) {}
}

/** L'annulation d'une modification du compte en attente. */
export class CancelPendingCreditorAccountCommand {
  constructor(
    readonly legalEntityId: string,
    readonly pendingId: string,
  ) {}
}

/**
 * Les réglages de mandat de l'entité — zones 20 et 12 du modèle EPC.
 *
 * Sur l'entité et non sur le compte d'un client : ils décrivent ce que NOUS
 * vendons, et la même phrase part sur tous les mandats qu'elle émet.
 */
export class SetMandateDefaultsCommand {
  constructor(
    readonly legalEntityId: string,
    readonly payload: SetMandateDefaultsPayload,
  ) {}
}

export class SetPreNotificationCommand {
  constructor(
    readonly legalEntityId: string,
    readonly days: number,
  ) {}
}

/**
 * Le calendrier de prélèvement : délai de constitution, échéance N, date
 * limite de dépôt (plan `prelevement-automatique.md`, PA1).
 */
export class SetCollectionScheduleCommand {
  constructor(
    readonly legalEntityId: string,
    readonly payload: SetCollectionSchedulePayload,
  ) {}
}

/**
 * Les plafonds de la convention d'émission, pour un schéma SEPA — unitaire,
 * par remise, mensuel (plan `plan-plafonds-de-la-banque.md`, PL1).
 */
export class SetBankCollectionLimitsCommand {
  constructor(
    readonly legalEntityId: string,
    readonly payload: SetBankCollectionLimitsPayload,
  ) {}
}

/** Activer ou désactiver la constitution automatique — un geste à part. */
export class SetAutoCollectionCommand {
  constructor(
    readonly legalEntityId: string,
    readonly enabled: boolean,
  ) {}
}

/**
 * Les mentions de paiement de la facture — pénalités de retard, indemnité de
 * recouvrement, escompte (plan `facture-emise.md`).
 */
export class SetInvoicePaymentTermsCommand {
  constructor(
    readonly legalEntityId: string,
    readonly payload: SetInvoicePaymentTermsPayload,
  ) {}
}

/**
 * L'échéance des factures au virement, en jours après l'émission (V6,
 * `le-paiement-par-virement.md`).
 */
export class SetTransferDueDaysCommand {
  constructor(
    readonly legalEntityId: string,
    readonly days: number,
  ) {}
}

/**
 * Le préfixe de numéro des factures (plan `plan-zero-faille.md`, F14, lot ZA)
 * — un geste à part, jamais un champ de la correction : il se gèle à la
 * première pièce, et un geste sans retour ne se range pas parmi des champs
 * qui se corrigent tous les jours.
 */
export class SetInvoicePrefixCommand {
  constructor(
    readonly legalEntityId: string,
    readonly prefix: string,
  ) {}
}

/** Archiver, ou remettre en service. Le drapeau évite deux commandes jumelles. */
export class SetLegalEntityArchivedCommand {
  constructor(
    readonly legalEntityId: string,
    readonly archived: boolean,
  ) {}
}

/**
 * Dépose (ou remplace) le **logo** de l'entité.
 *
 * Les octets traversent la commande, comme pour un KBIS : c'est le domaine qui
 * décide s'ils sont dessinables, pas le contrôleur, et il ne peut le faire qu'en
 * les voyant. Le `fileName` n'est pas rangé — il sert au refus, qui doit nommer
 * le fichier que la personne a sous la main.
 */
export class SetLegalEntityLogoCommand {
  constructor(
    readonly legalEntityId: string,
    readonly fileName: string,
    readonly bytes: Buffer,
    /** La fiche staff de qui dépose — l'acteur de l'intention. */
    readonly staffUserId: string,
    /** La clé d'intention de l'écran : un second envoi ne redépose rien. */
    readonly intentKey: string,
  ) {}
}

/** Retire le logo. Le mandat ressort alors avec sa cellule vide, et c'est valide. */
export class RemoveLegalEntityLogoCommand {
  constructor(readonly legalEntityId: string) {}
}
