import {
  DomainError,
  ResourceNotFoundError,
  TechnicalError,
} from "../../../../platform/shared/errors/app-error.js";

/**
 * L'opération visée n'a jamais été reçue du référentiel.
 *
 * Une surcharge s'accroche à une opération REÇUE : la réception restreint ce
 * qui est arrivé, elle ne crée rien (D1). Une opération retirée depuis, elle,
 * existe toujours — on peut encore la relire et la surcharger.
 */
export class CatalogOperationNotFoundError extends ResourceNotFoundError {
  constructor(readonly key: string) {
    super(
      "catalog.operation.not_found",
      `L’opération « ${key} » n’a jamais été reçue du référentiel. Acceptez l’envoi qui la porte, puis revenez la restreindre.`,
    );
  }
}

/** Une clientèle hors des trois — une ligne écrite à la main, ou un appelant qui a dérivé. */
export class InvalidCatalogOperationAudienceError extends DomainError {
  constructor(readonly audience: string) {
    super(
      "catalog.operation.invalid_audience",
      `Clientèle « ${audience} » inconnue : une opération s’adresse aux professionnels (« pro »), aux particuliers (« public ») ou aux deux (« both »).`,
    );
  }
}

/**
 * Une surcharge mal formée : un article retiré deux fois, un SKU vide, une
 * clôture illisible. La FORME seulement — la surcharge ne se vérifie pas
 * contre le référentiel, elle se combine à la lecture (D9).
 */
export class InvalidOperationOverrideError extends DomainError {
  constructor(readonly reason: string) {
    super(
      "catalog.operation.invalid_override",
      `Surcharge de l’opération refusée : ${reason}. Corrigez la saisie et enregistrez à nouveau.`,
    );
  }
}

/**
 * Une colonne du miroir qui ne se relit pas — une ligne écrite à la main, ou
 * une ingestion qui a dérivé. Bruyante plutôt que montrée comme valable.
 */
export class UnreadableOperationColumnError extends TechnicalError {
  constructor(readonly column: string) {
    super(
      "catalog.operation.unreadable",
      `La colonne ${column} du miroir des opérations ne se relit pas. Demandez un nouvel envoi du référentiel, puis acceptez-le.`,
    );
  }
}
