import { DomainError } from "../../../../platform/shared/errors/app-error.js";

/**
 * La langue envoyée avec la commande n'est pas une des trois langues de la
 * boutique. Le contrat la refuse déjà ; le value object le redit pour tout
 * chemin qui ne passerait pas par lui (semis, tests).
 */
export class UnknownOrderLocaleError extends DomainError {
  constructor(readonly locale: string) {
    super(
      "orders.locale.unknown",
      `Langue de commande inconnue (« ${locale} ») : la boutique ne connaît que le français, l'anglais et l'italien. Rechargez la boutique et repassez la commande.`,
    );
  }
}

/**
 * Une commande saisie par l'équipe ne porte pas de langue : celle de l'écran
 * du back-office ne dit rien du client (lot A3). Aucun chemin HTTP ne
 * l'exprime ; le refus garde le semis et les tests du même côté.
 */
export class StaffOrderLocaleError extends DomainError {
  constructor() {
    super(
      "orders.locale.staff_entry",
      "Une commande saisie par l'équipe n'enregistre pas de langue : seule la boutique, côté client, la transmet.",
    );
  }
}
