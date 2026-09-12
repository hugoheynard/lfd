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

/**
 * 🔴 **Cette erreur ne porte PAS l'IBAN refusé, et c'est tout son sujet.**
 *
 * Ses sœurs ci-dessus recopient la valeur fautive dans leur message ; celle-ci
 * ne le peut pas, parce que ce message **repart au client**. `AppErrorFilter`
 * ne neutralise que les erreurs `technical` — une `DomainError` voit son
 * `message` rendu tel quel dans la réponse HTTP (vérifié le 2026-09-12,
 * `platform/shared/http/app-error.filter.ts`).
 *
 * Un IBAN refusé est un IBAN **mal saisi**, donc à un caractère du vrai. Le
 * renvoyer ferait voyager un compte bancaire — le nôtre pour le créancier, celui
 * d'un client pour le débiteur — dans une réponse, un journal d'accès, un
 * rapport d'erreur de navigateur.
 *
 * ⚠️ Le champ `raw` a été **retiré**, pas seulement omis du message. Le garder
 * laisserait la fuite à un `console.log` de distance : ce qu'on ne peut pas
 * écrire vaut mieux que ce qu'il faut penser à ne pas écrire.
 *
 * La `reason`, elle, reste entière — elle dit quoi corriger sans rien révéler,
 * et c'est ce dont a besoin le personnel qui lit l'écran sans le code sous les
 * yeux.
 */
export class InvalidIbanError extends DomainError {
  constructor(readonly reason: string) {
    super("accounting.iban.invalid", `IBAN invalide — ${reason}`);
  }
}

export class InvalidBicError extends DomainError {
  constructor(
    readonly raw: string,
    readonly reason: string,
  ) {
    super("accounting.bic.invalid", `BIC « ${raw} » : ${reason}`);
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

/**
 * Le créancier imprimé sur les mandats déjà signés ne se réécrit pas.
 *
 * Le raisonnement est celui de l'ICS, appliqué à ce que le PAPIER porte : un
 * mandat SEPA nomme le créancier — titulaire et adresse — et le débiteur a
 * autorisé CE nom-là. Le changer ici n'irait pas rechercher les signatures : on
 * prélèverait au nom de quelqu'un que personne n'a autorisé.
 *
 * ⚠️ L'IBAN et le BIC ne sont PAS concernés, et c'est volontaire : aucun mandat
 * ne les porte. Changer de banque reste libre, pour toujours.
 */
export class CreditorIdentityIsFrozenError extends BusinessError {
  constructor(
    readonly current: string,
    readonly attempted: string,
  ) {
    super(
      "accounting.creditor_identity.frozen",
      `Des mandats ont déjà été émis au nom de « ${current} » : ce nom ne peut pas devenir ` +
        `« ${attempted} ». Les papiers signés portent l'ancien. Vous pouvez toujours changer ` +
        `d'IBAN ou de BIC — aucun mandat ne les porte. Pour encaisser sous une autre identité, ` +
        `déclarez une seconde entité juridique et faites resigner les mandats concernés.`,
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

/**
 * On n'archive pas la dernière entité en service.
 *
 * Rien ne se corromprait : les documents déjà émis citent l'entité par son
 * identifiant, et archiver n'efface rien. Ce qui se casse est plus sournois —
 * **plus rien ne peut être émis ni prélevé**, et l'écran qui le dirait est
 * justement celui qu'on vient de vider. Le refus existe pour ça : c'est un
 * accident à un clic, dont le symptôme n'apparaît qu'au prochain cycle.
 *
 * Le message nomme le geste de sortie, parce qu'il est lu par quelqu'un qui n'a
 * pas le code sous les yeux : déclarer la remplaçante d'abord.
 */
export class LastActiveLegalEntityError extends BusinessError {
  constructor(readonly legalEntityId: string) {
    super(
      "accounting.legal_entity.last_active",
      "Cette entité est la seule en service : l'archiver empêcherait toute " +
        "émission et tout prélèvement. Déclarez d'abord celle qui la remplace.",
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

/**
 * Une valeur ne tient pas dans le peigne de cases que le formulaire EPC lui
 * réserve.
 *
 * 🔴 **Elle existe parce que le dessin tronquait en SILENCE.** `comb` remplit
 * case par case et ignore tout caractère au-delà de la dernière : un IBAN de 31
 * caractères — la Norvège en a 15, Malte 31 — sortait amputé sur le papier
 * signé pendant que la base en gardait la forme entière. L'écart ne se serait
 * vu qu'en contestation, c'est-à-dire au pire moment.
 *
 * `BusinessError` et non `TechnicalError` : ce n'est pas une panne, c'est un
 * fait opposable — **ce client ne peut pas être mandaté sur ce formulaire**. Le
 * message le dit en toutes lettres, parce qu'il est lu par quelqu'un qui n'a
 * pas le code sous les yeux et qui doit décider quoi faire du dossier.
 */
export class MandateFieldTooLongError extends BusinessError {
  constructor(
    readonly field: string,
    readonly length: number,
    readonly capacity: number,
  ) {
    super(
      "accounting.mandate.field_too_long",
      `${field} fait ${String(length)} caractères, et le formulaire SEPA n'en imprime que ` +
        `${String(capacity)}. Le mandat ne peut pas être édité tel quel pour ce compte.`,
    );
  }
}

/**
 * Plusieurs entités émettrices actives, et rien pour choisir.
 *
 * Levée seulement là où un document doit nommer UN créancier sans qu'on lui ait
 * dit lequel. Refuser est la seule issue honnête : un mandat émis au nom de la
 * mauvaise entité est un papier signé pour quelqu'un d'autre, et l'erreur ne se
 * verrait qu'en contestation.
 */
export class SeveralIssuersError extends BusinessError {
  constructor(readonly count: number) {
    super(
      "accounting.issuer.ambiguous",
      `${String(count)} entités émettrices sont actives : impossible de savoir laquelle doit ` +
        `figurer sur ce mandat. Archivez celles qui n'émettent plus.`,
    );
  }
}

/**
 * Aucune entité émettrice active, alors qu'un document doit en nommer une.
 *
 * Distinct de {@link SeveralIssuersError} : l'un se répare en archivant, l'autre
 * en déclarant. Les confondre enverrait chercher le mauvais geste.
 */
export class NoIssuerError extends BusinessError {
  constructor() {
    super(
      "accounting.issuer.missing",
      "Aucune entité émettrice active : déclarez-en une avant d'éditer un mandat.",
    );
  }
}
