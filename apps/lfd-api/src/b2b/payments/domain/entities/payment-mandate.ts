import type { CustomerMandateView, MandateStatus, PaymentMandateView } from "@lfd/contracts";

import type { MandatePaymentType } from "../../../accounting/domain/value-objects/mandate-defaults.js";
import type { SepaScheme } from "../../../accounting/domain/value-objects/sepa-scheme.js";

import {
  MandateAcceptanceInFutureError,
  MandateNotProvableError,
  MandateNotRevocableError,
  MandateNotSignableError,
  MandateUnprovenError,
} from "../errors/mandate-errors.js";
import { MandateProofRevisionStaleError } from "../errors/mandate-proof-errors.js";
import { proofRevisionOf } from "../services/proof-revision.js";

/**
 * L'état complet d'un mandat, tel qu'il vit en base. Aucun type Prisma ici.
 *
 * Ni client ni moyen de paiement chez un prestataire : le mandat est frappé
 * chez nous et traité directement avec la banque. Les deux champs Stripe en
 * sont sortis le 2026-09-19 — aucun mandat Stripe en production (Hugo) ; leurs
 * colonnes restent en base, ni lues ni écrites, jusqu'à leur migration.
 *
 * `acceptedAt` est `null` tant que le papier n'est pas revenu signé, et c'est
 * l'invariant central : la date du consentement est celle de la SIGNATURE, pas
 * celle de la frappe. Les confondre daterait l'autorisation du jour où on l'a
 * demandée — exactement ce qu'un débiteur conteste.
 */
export interface MandateSnapshot {
  readonly id: string;
  readonly companyId: string;
  /** La RUM. Frappée par nous, ou reprise d'un portefeuille existant. */
  readonly reference: string;
  readonly last4: string;
  readonly bankCode: string;
  readonly country: string;
  readonly status: MandateStatus;
  /** `null` tant que le mandat n'est pas signé. */
  readonly acceptedAt: Date | null;
  readonly revokedAt: Date | null;
  readonly proofStorageKey: string | null;
  readonly proofFileName: string | null;
  /**
   * Laquelle de NOS entités a émis. `null` reste admis par la colonne — une
   * reprise de portefeuille n'a pas d'émetteur connu —, mais toute frappe
   * d'ici le renseigne.
   */
  readonly creditorId: string | null;
  /**
   * 🔴 Le schéma et le type de paiement FIGÉS à la frappe. Le papier et le lot
   * lisent ceux-ci, jamais le réglage courant de l'émetteur.
   */
  readonly scheme: SepaScheme;
  readonly paymentType: MandatePaymentType;
}

/** Un mandat prêt à être écrit : tout sauf l'identité, que la base donne. */
export type MandateToCreate = Omit<MandateSnapshot, "id">;

/**
 * Frappe un mandat **maison** : la RUM existe, le papier est prêt à imprimer,
 * personne n'a encore signé.
 *
 * On crée l'autorisation AVANT qu'elle soit donnée — d'où `acceptedAt` à
 * `null`, qui n'est pas une donnée manquante mais l'état même du brouillon.
 *
 * 🔴 **`creditorId` est obligatoire.** Un mandat
 * que nous émettons nomme l'entité sous l'ICS de laquelle il est émis : c'est
 * elle que le débiteur opposera à sa banque avec la RUM. Un brouillon sans
 * émetteur serait un papier qu'on ne pourrait pas imprimer.
 *
 * Aucun `last4` ni `bankCode` : ils viennent du RIB, lu à l'impression.
 *
 * ⚠️ Cette phrase disait « le RIB peut être recopié après la frappe » jusqu'au
 * 2026-09-14. Ce n'est plus vrai : la frappe EXIGE un RIB, staff comme client
 * (décision de Hugo ; depuis le 2026-09-15, code `bank_account_missing` de
 * `MandateMentionsMissingError`). Le mandat ne fige pas
 * pour autant le compte (plan mandat client §8) : réécrire le RIB révoque le
 * brouillon, qui ne peut plus nommer un compte qui n'est plus le bon.
 */
export function mintMandate(input: {
  readonly companyId: string;
  readonly creditorId: string;
  readonly reference: string;
  readonly scheme: SepaScheme;
  readonly paymentType: MandatePaymentType;
}): MandateToCreate {
  return {
    companyId: input.companyId,
    creditorId: input.creditorId,
    reference: input.reference,
    scheme: input.scheme,
    paymentType: input.paymentType,
    status: "draft",
    last4: "",
    bankCode: "",
    country: "",
    acceptedAt: null,
    revokedAt: null,
    proofStorageKey: null,
    proofFileName: null,
  };
}

/**
 * Ce qui NE change pas au cours de la vie d'un mandat : sa référence, son
 * émetteur, le compte qu'il désigne.
 *
 * Séparé des champs mutables — statut, dates, pièce — pour que la relecture de
 * l'agrégat dise d'un coup d'œil ce qui peut bouger. Une RUM qui se réécrirait
 * invaliderait le papier qui la porte.
 */
type MandateIdentity = Omit<
  MandateSnapshot,
  "id" | "companyId" | "status" | "acceptedAt" | "revokedAt" | "proofStorageKey" | "proofFileName"
>;

/** La pièce justificative déposée : le mandat papier signé, scanné. */
export interface MandateProof {
  readonly storageKey: string;
  readonly fileName: string;
}

/**
 * Le **mandat de prélèvement SEPA** d'une société : l'autorisation de débiter.
 *
 * L'agrégat ne détient **aucune coordonnée bancaire** — l'IBAN vit sur le RIB
 * de la société (`company_bank_accounts`), et ce qu'on garde ici (`last4`,
 * `bankCode`) sert à reconnaître le compte à l'écran, pas à le débiter.
 *
 * L'invariant porté ici plutôt que dans un handler : **un mandat déjà révoqué
 * ne se révoque pas deux fois** — repasser dessus écraserait la date qui fait
 * foi. Celui de la date de signature vit dans {@link PaymentMandate.sign}.
 *
 * L'unicité du mandat *actif* par société, elle, n'est pas ici : deux
 * enregistrements concurrents passeraient tous deux un contrôle applicatif. Elle
 * est tenue par un index partiel (cf. migration `20260811200000_mandat_prelevement`).
 */
export class PaymentMandate {
  private constructor(
    readonly id: string,
    readonly companyId: string,
    private readonly identity: MandateIdentity,
    private acceptedAtValue: Date | null,
    private revokedAtValue: Date | null,
    private proofValue: MandateProof | null,
    private statusValue: MandateStatus,
  ) {}

  /** Reconstruit un mandat depuis sa ligne en base. */
  static reconstitute(snapshot: MandateSnapshot): PaymentMandate {
    const proof =
      snapshot.proofStorageKey === null || snapshot.proofFileName === null
        ? null
        : { storageKey: snapshot.proofStorageKey, fileName: snapshot.proofFileName };
    return new PaymentMandate(
      snapshot.id,
      snapshot.companyId,
      snapshot,
      snapshot.acceptedAt,
      snapshot.revokedAt,
      proof,
      snapshot.status,
    );
  }

  /** La RUM — frappée par nous, ou reprise d'un portefeuille. Ne bouge jamais. */
  get reference(): string {
    return this.identity.reference;
  }

  /** La date de signature, ou `null` pour un brouillon. */
  get acceptedAt(): Date | null {
    return this.acceptedAtValue;
  }

  /** L'entité émettrice, ou `null` pour un mandat repris sans émetteur connu. */
  get creditorId(): string | null {
    return this.identity.creditorId;
  }

  get status(): MandateStatus {
    return this.statusValue;
  }

  /** Peut-on prélever sur ce mandat ? Un seul état l'autorise. */
  debitable(): boolean {
    return this.statusValue === "active";
  }

  /**
   * Le mandat est-il **prouvé** ? En contestation, la charge de la preuve est
   * sur nous : un mandat actif sans pièce est un mandat sans filet.
   */
  proven(): boolean {
    return this.proofValue !== null;
  }

  /**
   * Le mandat est-il signé ? Un brouillon ne l'est pas, et c'est la seule
   * question qui décide s'il peut être imprimé ou s'il peut prélever.
   */
  signed(): boolean {
    return this.acceptedAtValue !== null;
  }

  /**
   * Le papier est revenu signé : le brouillon devient l'autorisation.
   *
   * `at` est la date portée par le PAPIER, pas celle de la saisie — c'est elle
   * qu'on oppose en contestation, et elle est souvent antérieure de plusieurs
   * jours. Jamais à venir : c'est la date qu'on opposera en contestation, et
   * une faute de frappe s'y voit tout de suite, ou jamais.
   *
   * 🔴 **Ne révoque pas l'ancien mandat, et c'est délibéré.** L'unicité de
   * l'actif est tenue par un index partiel ; passer un second mandat en `active`
   * sans avoir révoqué le premier lève une violation de contrainte, pas une
   * erreur métier. L'appelant doit charger les deux et les écrire dans la MÊME
   * transaction — un agrégat ne connaît pas ses voisins, et c'est ce qui
   * l'empêche de faire semblant de les gérer.
   */
  sign(at: Date, now: Date, proofRevision: string): void {
    if (this.statusValue !== "draft") {
      throw new MandateNotSignableError(this.statusValue);
    }
    // 🔴 Depuis le 2026-09-14 : l'activation autorise un débit, et le scan est
    // la seule pièce qui répond en contestation. On prouve AVANT d'activer —
    // c'est ce qui permet de refuser le dépôt sur un mandat actif.
    if (this.proofValue === null) {
      throw new MandateUnprovenError();
    }
    // Depuis le 2026-09-15 : on active sur la pièce RELUE, pas sur celle que la
    // base porte au moment du clic (plan `plan-restes-du-mandat.md` §7 #9).
    if (proofRevision !== proofRevisionOf(this.proofValue.storageKey)) {
      throw new MandateProofRevisionStaleError();
    }
    if (at.getTime() > now.getTime()) {
      throw new MandateAcceptanceInFutureError();
    }
    this.acceptedAtValue = at;
    this.statusValue = "active";
  }

  /**
   * Retire l'autorisation. Idempotent, non : un mandat révoqué garde sa date.
   *
   * `draft` est révocable depuis le 2026-09-12 — un brouillon qu'on renonce à
   * faire signer doit pouvoir sortir de la table sans DELETE, et sans occuper
   * la place du brouillon unique de la société.
   */
  revoke(now: Date): void {
    if (
      this.statusValue !== "active" &&
      this.statusValue !== "pending" &&
      this.statusValue !== "draft"
    ) {
      throw new MandateNotRevocableError(this.statusValue);
    }
    this.statusValue = "revoked";
    this.revokedAtValue = now;
  }

  /**
   * Attache le scan du mandat signé — la pièce qui prouve le consentement.
   *
   * 🔴 **Sur le brouillon seulement** (depuis le 2026-09-14). Un actif a déjà
   * la pièce qu'on oppose en contestation : la remplacer ferait produire un
   * papier que personne n'a relu à l'activation. Un nouveau dépôt sur le
   * brouillon, lui, remplace le précédent — c'est encore la saisie.
   */
  attachProof(proof: MandateProof): void {
    this.refuseUnlessProvable();
    this.proofValue = proof;
  }

  /**
   * Refuse, AVANT tout effet, un dépôt que {@link attachProof} refuserait.
   *
   * Existe pour l'appelant qui doit ranger le fichier avant d'écrire sa
   * référence : sans elle, le fichier du bucket serait déjà remplacé quand le
   * refus tombe.
   */
  refuseUnlessProvable(): void {
    if (this.statusValue !== "draft") {
      throw new MandateNotProvableError(this.statusValue);
    }
  }

  /** L'état complet, à écrire tel quel. */
  toSnapshot(): MandateSnapshot {
    return {
      ...this.identity,
      id: this.id,
      companyId: this.companyId,
      status: this.statusValue,
      acceptedAt: this.acceptedAtValue,
      revokedAt: this.revokedAtValue,
      proofStorageKey: this.proofValue?.storageKey ?? null,
      proofFileName: this.proofValue?.fileName ?? null,
    };
  }

  /** La clé de stockage de la preuve, ou `null` si aucune pièce n'est déposée. */
  proofStorageKey(): string | null {
    return this.proofValue?.storageKey ?? null;
  }

  /**
   * La clé de la pièce **qu'on a le droit de détruire**, ou `null`.
   *
   * Décidé par Hugo le 2026-09-15 (plan `plan-restes-du-mandat.md` §4 et §7
   * #8) : seul un scan qui n'a **jamais** prouvé un consentement se supprime —
   * celui d'un brouillon qu'on remplace, ou d'un brouillon devenu caduc. Un
   * mandat qui a été signé, même révoqué depuis, garde sa pièce : c'est elle
   * qu'on oppose en contestation, parfois des années après.
   *
   * `acceptedAt` et non le statut seul, et c'est le sujet : un révoqué peut
   * avoir été actif. Le statut écarte `pending` et `failed`, qui viennent d'un
   * prestataire et dont la pièce n'est pas la nôtre à juger.
   */
  purgeableProofKey(): string | null {
    if (this.acceptedAtValue !== null) {
      return null;
    }
    if (this.statusValue !== "draft" && this.statusValue !== "revoked") {
      return null;
    }
    return this.proofValue?.storageKey ?? null;
  }

  /**
   * Ce que le back-office montre : de quoi reconnaître le compte, jamais de quoi
   * le débiter — ce qui ne sort pas ne fuit pas.
   */
  toView(): PaymentMandateView {
    return {
      id: this.id,
      reference: this.identity.reference,
      status: this.statusValue,
      scheme: this.identity.scheme,
      last4: this.identity.last4,
      bankCode: this.identity.bankCode,
      country: this.identity.country,
      acceptedAt: this.acceptedAtValue?.toISOString() ?? null,
      revokedAt: this.revokedAtValue?.toISOString() ?? null,
      hasProof: this.proven(),
      proofFileName: this.proofValue?.fileName ?? "",
      proofRevision: proofRevisionOf(this.proofStorageKey()),
    };
  }

  /**
   * Ce que le **client** voit de son mandat. Ni compte, ni date de révocation :
   * sa carte RIB dit déjà le compte, et un mandat révoqué se lit « aucun mandat
   * en cours » de son côté (plan mandat client, fin du §9).
   */
  toCustomerView(): CustomerMandateView {
    return {
      id: this.id,
      reference: this.identity.reference,
      status: this.statusValue,
      scheme: this.identity.scheme,
      hasProof: this.proven(),
      proofFileName: this.proofValue?.fileName ?? "",
      acceptedAt: this.acceptedAtValue?.toISOString() ?? null,
    };
  }
}
