import type { CorrectLegalEntityPayload, DeclareLegalEntityPayload } from "@lfd/contracts";

/**
 * Les intentions d'écriture sur une entité émettrice.
 *
 * Groupées dans un fichier, leurs handlers séparés : une commande est une
 * structure de données de trois lignes, et six fichiers de trois lignes cachent
 * l'ensemble plus qu'ils ne le rangent. Les handlers, eux, portent chacun une
 * règle — c'est là que l'unité par fichier paie.
 */
export class DeclareLegalEntityCommand {
  constructor(readonly payload: DeclareLegalEntityPayload) {}
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
    readonly iban: string,
  ) {}
}

export class SetPreNotificationCommand {
  constructor(
    readonly legalEntityId: string,
    readonly days: number,
  ) {}
}

/** Archiver, ou remettre en service. Le drapeau évite deux commandes jumelles. */
export class SetLegalEntityArchivedCommand {
  constructor(
    readonly legalEntityId: string,
    readonly archived: boolean,
  ) {}
}
