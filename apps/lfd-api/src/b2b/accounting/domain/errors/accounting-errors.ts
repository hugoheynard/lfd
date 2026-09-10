import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
  TechnicalError,
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

/**
 * Le logo déposé n'est pas dessinable sur un mandat.
 *
 * Le message porte la RAISON et le GESTE, pas un code : il est lu par une
 * assistante de gestion devant un écran de dépôt, qui doit savoir quoi refaire
 * du fichier qu'elle a sous la main — recadrer, réexporter, ou en reprendre un
 * autre.
 */
export class InvalidEntityLogoError extends DomainError {
  constructor(readonly reason: string) {
    super("accounting.entity_logo.invalid", `Logo refusé : ${reason}`);
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

/** Aucun logo n'est attaché à cette entité — le cas courant, pas une anomalie. */
export class EntityLogoNotFoundError extends ResourceNotFoundError {
  constructor(readonly legalEntityId: string) {
    super(
      "accounting.entity_logo.not_found",
      `Aucun logo pour l'entité juridique « ${legalEntityId} ». ` +
        `Déposez-en un dans Comptabilité › Entités juridiques.`,
    );
  }
}

// ─── Panne : le système se contredit lui-même (500) ──────────────────────────

/**
 * Le logo rangé n'est plus une image que nous savons dessiner.
 *
 * Seul {@link EntityLogo} a pu écrire cet objet, donc ce refus ne peut pas venir
 * d'une saisie : il signale que le bucket et la base ne racontent plus la même
 * chose — une clé écrasée à la main, un objet remplacé hors du produit. C'est
 * une panne, et elle doit se voir plutôt que se rattraper en servant du vide.
 */
export class EntityLogoUnreadableError extends TechnicalError {
  constructor(readonly legalEntityId: string) {
    super(
      "accounting.entity_logo.unreadable",
      `Le logo rangé pour l'entité juridique « ${legalEntityId} » n'est ni un PNG ni un ` +
        `JPEG. Redéposez-le depuis Comptabilité › Entités juridiques, et signalez-le : ` +
        `le fichier a été remplacé en dehors du produit.`,
    );
  }
}

/**
 * La borne d'un cycle tombe sur une heure locale qui n'existe pas.
 *
 * Inatteignable aujourd'hui — la clôture est à minuit, et minuit n'est sauté par
 * aucun passage à l'heure d'été en Europe de l'Ouest. Le refus existe pour le
 * jour où l'heure de clôture deviendrait un réglage : rendre un instant faux en
 * silence coûterait un cycle entier décalé, découvert au relevé bancaire.
 */
export class BillingCycleBoundaryError extends TechnicalError {
  constructor(
    readonly day: string,
    readonly time: string,
  ) {
    super(
      "accounting.billing_cycle.impossible_boundary",
      `Le ${day} à ${time} n'existe pas dans le fuseau des affaires (passage à l'heure d'été).`,
    );
  }
}
