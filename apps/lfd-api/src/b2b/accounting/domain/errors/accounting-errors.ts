import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
} from "../../../../platform/shared/errors/app-error.js";

// ─── Données mal formées : le modèle se protège lui-même (400) ───────────────

export class InvalidSirenError extends DomainError {
  constructor(
    readonly raw: string,
    readonly reason: string,
  ) {
    super("accounting.siren.invalid", `SIREN « ${raw} » : ${reason}`);
  }
}

export class InvalidIbanError extends DomainError {
  constructor(
    readonly raw: string,
    readonly reason: string,
  ) {
    super("accounting.iban.invalid", `IBAN « ${raw} » : ${reason}`);
  }
}

export class InvalidCreditorIdentifierError extends DomainError {
  constructor(
    readonly raw: string,
    readonly reason: string,
  ) {
    super("accounting.ics.invalid", `Identifiant créancier « ${raw} » : ${reason}`);
  }
}

export class InvalidLegalAddressError extends DomainError {
  constructor(
    readonly field: string,
    readonly reason: string,
  ) {
    super("accounting.address.invalid", `${field} : ${reason}`);
  }
}

export class InvalidLegalEntityError extends DomainError {
  constructor(
    readonly field: string,
    readonly reason: string,
  ) {
    super("accounting.legal_entity.invalid", `${field} : ${reason}`);
  }
}

// ─── Refus métier : la demande est bien formée mais impossible ici (409) ─────

/**
 * L'identifiant créancier ne se remplace pas.
 *
 * Chaque mandat signé porte l'ICS **imprimé sur le papier**. Le changer ici
 * n'irait pas rechercher les signatures : on se retrouverait à prélever sous un
 * identifiant que le débiteur n'a jamais autorisé, et chaque opération serait
 * contestable. Un ICS qui change est une nouvelle entité émettrice, avec de
 * nouveaux mandats à faire signer.
 */
export class CreditorIdentifierIsImmutableError extends BusinessError {
  constructor(
    readonly current: string,
    readonly attempted: string,
  ) {
    super(
      "accounting.ics.immutable",
      `Cette entité encaisse déjà sous l'ICS ${current} ; il ne peut pas devenir ${attempted}. ` +
        `Les mandats déjà signés portent l'ancien identifiant. Pour encaisser sous un autre ICS, ` +
        `créez une seconde entité juridique et faites resigner les mandats concernés.`,
    );
  }
}

/** Encaisser demande un ICS **et** un compte où l'argent arrive. */
export class EntityCannotCollectError extends BusinessError {
  constructor(readonly missing: readonly string[]) {
    super(
      "accounting.legal_entity.cannot_collect",
      `Cette entité juridique ne peut pas encaisser par prélèvement : ${missing.join(", ")} ` +
        `${missing.length > 1 ? "manquent" : "manque"}. Complétez-la dans Comptabilité › Entités juridiques.`,
    );
  }
}

export class LegalEntityNotFoundError extends ResourceNotFoundError {
  constructor(readonly id: string) {
    super("accounting.legal_entity.not_found", `Aucune entité juridique « ${id} ».`);
  }
}
