import type { MandateStatus, PaymentMandateView } from "@lfd/contracts";

import {
  MandateAcceptanceInFutureError,
  MandateNotRevocableError,
} from "../errors/mandate-errors.js";

/** Ce que le prestataire rend une fois le mandat créé chez lui. */
export interface RegisteredMandate {
  readonly stripeCustomerId: string;
  readonly paymentMethodId: string;
  /** Référence opposable (RUM) rendue par Stripe. */
  readonly reference: string;
  readonly last4: string;
  readonly bankCode: string;
  readonly country: string;
  readonly status: MandateStatus;
}

/** L'état complet d'un mandat, tel qu'il vit en base. Aucun type Prisma ici. */
export interface MandateSnapshot extends RegisteredMandate {
  readonly id: string;
  readonly companyId: string;
  readonly acceptedAt: Date;
  readonly revokedAt: Date | null;
  readonly proofStorageKey: string | null;
  readonly proofFileName: string | null;
}

/** Un mandat prêt à être écrit : tout sauf l'identité, que la base donne. */
export type MandateToCreate = Omit<MandateSnapshot, "id">;

/**
 * Prépare un mandat fraîchement enregistré chez le prestataire.
 *
 * Fonction plutôt que fabrique de l'agrégat : tant que la base n'a pas donné son
 * identité, il n'y a pas d'entité — seulement un état à écrire. C'est la même
 * séparation que pour la commande (`Order.draft` → `toPlace`), et elle évite le
 * faux identifiant vide qu'on traînerait sinon jusqu'au `create`.
 *
 * L'invariant reste ici, dans le domaine : `acceptedAt` est la date du **papier
 * signé** — souvent bien antérieure à la saisie, puisqu'on reprend un
 * portefeuille existant, mais jamais à venir. C'est la date qu'on opposera en
 * contestation ; une faute de frappe s'y voit tout de suite, ou jamais.
 */
export function draftMandate(input: {
  readonly companyId: string;
  readonly registration: RegisteredMandate;
  readonly acceptedAt: Date;
  readonly now: Date;
}): MandateToCreate {
  if (input.acceptedAt.getTime() > input.now.getTime()) {
    throw new MandateAcceptanceInFutureError();
  }
  return {
    ...input.registration,
    companyId: input.companyId,
    acceptedAt: input.acceptedAt,
    revokedAt: null,
    proofStorageKey: null,
    proofFileName: null,
  };
}

/** La pièce justificative déposée : le mandat papier signé, scanné. */
export interface MandateProof {
  readonly storageKey: string;
  readonly fileName: string;
}

/**
 * Le **mandat de prélèvement SEPA** d'une société : l'autorisation de débiter.
 *
 * L'agrégat ne détient **aucune coordonnée bancaire** — l'IBAN vit chez Stripe,
 * et ce qu'on garde (`last4`, `bankCode`) sert à reconnaître le compte à l'écran,
 * pas à le débiter.
 *
 * L'invariant porté ici plutôt que dans un handler : **un mandat déjà révoqué
 * ne se révoque pas deux fois** — repasser dessus écraserait la date qui fait
 * foi. Celui de la date de signature vit dans {@link draftMandate}, avant que
 * l'entité n'existe.
 *
 * L'unicité du mandat *actif* par société, elle, n'est pas ici : deux
 * enregistrements concurrents passeraient tous deux un contrôle applicatif. Elle
 * est tenue par un index partiel (cf. migration `20260811200000_mandat_prelevement`).
 */
export class PaymentMandate {
  private constructor(
    readonly id: string,
    readonly companyId: string,
    private readonly registration: RegisteredMandate,
    readonly acceptedAt: Date,
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

  /** Retire l'autorisation. Idempotent, non : un mandat révoqué garde sa date. */
  revoke(now: Date): void {
    if (this.statusValue !== "active" && this.statusValue !== "pending") {
      throw new MandateNotRevocableError(this.statusValue);
    }
    this.statusValue = "revoked";
    this.revokedAtValue = now;
  }

  /** Attache le scan du mandat signé — la pièce qui prouve le consentement. */
  attachProof(proof: MandateProof): void {
    this.proofValue = proof;
  }

  /** L'état complet, à écrire tel quel. */
  toSnapshot(): MandateSnapshot {
    return {
      ...this.registration,
      id: this.id,
      companyId: this.companyId,
      status: this.statusValue,
      acceptedAt: this.acceptedAt,
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
   * Ce que le back-office montre. Ni l'identifiant du moyen de paiement ni celui
   * du client Stripe n'en font partie : ils servent à débiter, pas à afficher, et
   * ce qui ne sort pas ne fuit pas.
   */
  toView(): PaymentMandateView {
    return {
      id: this.id,
      reference: this.registration.reference,
      status: this.statusValue,
      last4: this.registration.last4,
      bankCode: this.registration.bankCode,
      country: this.registration.country,
      acceptedAt: this.acceptedAt.toISOString(),
      revokedAt: this.revokedAtValue?.toISOString() ?? null,
      hasProof: this.proven(),
      proofFileName: this.proofValue?.fileName ?? "",
    };
  }
}
