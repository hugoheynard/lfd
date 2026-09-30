import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
} from "../../../platform/shared/errors/app-error.js";

/**
 * Les refus de la **bibliothèque d'achat**
 * (`documentation/livraisons/plan-bibliotheque-d-achat.md`, lot B1) — lus par
 * qui compare des catalogues de fournisseurs, sans le code sous les yeux :
 * chacun nomme le cas réel et le geste de sortie.
 *
 * Un même refus sert aux deux sortes de candidats ; le code dit laquelle, pour
 * que l'écran sache quelle fiche rouvrir.
 */

/** Les deux sortes de candidats, et comment on les nomme dans une phrase. */
export type PurchaseCandidateKind = "vehicle" | "bin";

const NOUNS: Readonly<Record<PurchaseCandidateKind, { readonly the: string; readonly a: string }>> =
  {
    vehicle: { the: "Le véhicule candidat", a: "véhicule candidat" },
    bin: { the: "Le format candidat", a: "format candidat" },
  };

/** Le nom d'un candidat est vide ou trop long. */
export class InvalidPurchaseCandidateNameError extends DomainError {
  constructor(kind: PurchaseCandidateKind, maxLength: number) {
    super(
      `delivery.purchase_${kind}_candidate_name_invalid`,
      `Le nom du ${NOUNS[kind].a} est requis, et tient en ${maxLength} caractères au plus.`,
    );
  }
}

/** Une référence ou un fournisseur trop long. */
export class InvalidPurchaseTextError extends DomainError {
  constructor(label: string, maxLength: number) {
    super(
      "delivery.purchase_text_invalid",
      `${label} tient en ${maxLength} caractères au plus : raccourcissez le texte, ou laissez la case vide.`,
    );
  }
}

/** Un prix HT négatif, non entier ou démesuré. */
export class InvalidPurchasePriceError extends DomainError {
  constructor(value: number, maxCents: number) {
    super(
      "delivery.purchase_price_invalid",
      `Un prix HT de ${value} centimes n'est pas admis : saisissez un montant en centimes entiers, de 0 à ${maxCents} (${maxCents / 100} €), ou laissez le prix vide s'il est inconnu.`,
    );
  }
}

/** Un lien d'achat qui n'est pas une adresse https. */
export class InvalidPurchaseUrlError extends DomainError {
  constructor(detail: string) {
    super(
      "delivery.purchase_url_invalid",
      `Lien d'achat refusé : ${detail}. Collez l'adresse complète de la page du fournisseur, qui commence par https://, ou laissez le lien vide.`,
    );
  }
}

/** Un autre candidat non archivé de la même sorte porte déjà ce nom. */
export class PurchaseCandidateNameTakenError extends BusinessError {
  constructor(kind: PurchaseCandidateKind, name: string) {
    super(
      `delivery.purchase_${kind}_candidate_name_taken`,
      `Un ${NOUNS[kind].a} s'appelle déjà « ${name} » : choisissez un autre nom, ou archivez l'ancien d'abord.`,
    );
  }
}

/** Aucun candidat de cette sorte sous cet identifiant. */
export class PurchaseCandidateNotFoundError extends ResourceNotFoundError {
  constructor(kind: PurchaseCandidateKind, id: string) {
    super(
      `delivery.purchase_${kind}_candidate_not_found`,
      `Aucun ${NOUNS[kind].a} sous l'identifiant ${id} : rechargez la bibliothèque d'achat.`,
    );
  }
}

/** Archiver un candidat qui l'est déjà. */
export class PurchaseCandidateAlreadyArchivedError extends BusinessError {
  constructor(kind: PurchaseCandidateKind, name: string) {
    super(
      `delivery.purchase_${kind}_candidate_already_archived`,
      `${NOUNS[kind].the} « ${name} » est déjà archivé : réactivez-le si vous l'envisagez de nouveau.`,
    );
  }
}

/** Réactiver un candidat qui n'est pas archivé. */
export class PurchaseCandidateNotArchivedError extends BusinessError {
  constructor(kind: PurchaseCandidateKind, name: string) {
    super(
      `delivery.purchase_${kind}_candidate_not_archived`,
      `${NOUNS[kind].the} « ${name} » est déjà dans la bibliothèque : il n'y a rien à réactiver.`,
    );
  }
}
