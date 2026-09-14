import type { CustomerMandateView, MandateStatus, PaymentMandateView } from "@lfd/contracts";

import {
  MandateAcceptanceInFutureError,
  MandateNotProvableError,
  MandateNotRevocableError,
  MandateNotSignableError,
  MandateUnprovenError,
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

/**
 * L'état complet d'un mandat, tel qu'il vit en base. Aucun type Prisma ici.
 *
 * 🔴 **Il n'hérite plus de `RegisteredMandate` depuis le 2026-09-12**, et ce
 * n'est pas un détail de typage. `RegisteredMandate` décrit ce qu'un
 * PRESTATAIRE rend ; un mandat que nous frappons n'a pas de prestataire. Tant
 * que le snapshot héritait de cette forme, la seule façon d'écrire un mandat
 * maison était de mentir sur trois champs.
 *
 * `acceptedAt` est `null` tant que le papier n'est pas revenu signé, et c'est
 * l'invariant central : la date du consentement est celle de la SIGNATURE, pas
 * celle de la frappe. Les confondre daterait l'autorisation du jour où on l'a
 * demandée — exactement ce qu'un débiteur conteste.
 */
export interface MandateSnapshot {
  readonly id: string;
  readonly companyId: string;
  /** `null` pour un mandat maison : il n'y a pas de client chez un tiers. */
  readonly stripeCustomerId: string | null;
  readonly paymentMethodId: string | null;
  /** La RUM. Frappée par nous, ou rendue par le prestataire. */
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
  /** Laquelle de NOS entités a émis. `null` pour l'ère Stripe. */
  readonly creditorId: string | null;
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
    creditorId: null,
  };
}

/**
 * Frappe un mandat **maison** : la RUM existe, le papier est prêt à imprimer,
 * personne n'a encore signé.
 *
 * C'est le pendant de {@link draftMandate}, et les deux ne se ressemblent qu'en
 * surface. Là, un tiers avait déjà enregistré un mandat signé et on le recopie ;
 * ici, on crée l'autorisation AVANT qu'elle soit donnée — d'où `acceptedAt`
 * à `null`, qui n'est pas une donnée manquante mais l'état même du brouillon.
 *
 * 🔴 **`creditorId` est obligatoire, contrairement au chemin Stripe.** Un mandat
 * que nous émettons nomme l'entité sous l'ICS de laquelle il est émis : c'est
 * elle que le débiteur opposera à sa banque avec la RUM. Un brouillon sans
 * émetteur serait un papier qu'on ne pourrait pas imprimer.
 *
 * Aucun `last4` ni `bankCode` : ils viennent du RIB, lu à l'impression.
 *
 * ⚠️ Cette phrase disait « le RIB peut être recopié après la frappe » jusqu'au
 * 2026-09-14. Ce n'est plus vrai : la frappe EXIGE un RIB, staff comme client
 * (`MandateWithoutBankAccountError`, décision de Hugo). Le mandat ne fige pas
 * pour autant le compte (plan mandat client §8) : réécrire le RIB révoque le
 * brouillon, qui ne peut plus nommer un compte qui n'est plus le bon.
 */
export function mintMandate(input: {
  readonly companyId: string;
  readonly creditorId: string;
  readonly reference: string;
}): MandateToCreate {
  return {
    companyId: input.companyId,
    creditorId: input.creditorId,
    reference: input.reference,
    status: "draft",
    stripeCustomerId: null,
    paymentMethodId: null,
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
 * émetteur, le compte qu'il désigne, son rattachement chez le prestataire.
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

  /** La RUM — frappée par nous, ou rendue par le prestataire. Ne bouge jamais. */
  get reference(): string {
    return this.identity.reference;
  }

  /** La date de signature, ou `null` pour un brouillon. */
  get acceptedAt(): Date | null {
    return this.acceptedAtValue;
  }

  /** L'entité émettrice, ou `null` pour un mandat de l'ère Stripe. */
  get creditorId(): string | null {
    return this.identity.creditorId;
  }

  /**
   * L'identifiant du moyen de paiement chez le prestataire, **s'il y en a un**.
   *
   * 🔴 Nullable, et les appelants doivent le tester. `RevokeMandateHandler`
   * l'appelait sans condition jusqu'au 2026-09-12 : un mandat maison n'a pas de
   * moyen de paiement chez un tiers, et le révoquer déclenchait un `detach()`
   * sur du vide — un aller-retour réseau pour rien, dans le meilleur des cas.
   */
  get paymentMethodId(): string | null {
    return this.identity.paymentMethodId;
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
   * jours. L'invariant de {@link draftMandate} vaut ici aussi : jamais à venir.
   *
   * 🔴 **Ne révoque pas l'ancien mandat, et c'est délibéré.** L'unicité de
   * l'actif est tenue par un index partiel ; passer un second mandat en `active`
   * sans avoir révoqué le premier lève une violation de contrainte, pas une
   * erreur métier. L'appelant doit charger les deux et les écrire dans la MÊME
   * transaction — un agrégat ne connaît pas ses voisins, et c'est ce qui
   * l'empêche de faire semblant de les gérer.
   */
  sign(at: Date, now: Date): void {
    if (this.statusValue !== "draft") {
      throw new MandateNotSignableError(this.statusValue);
    }
    // 🔴 Depuis le 2026-09-14 : l'activation autorise un débit, et le scan est
    // la seule pièce qui répond en contestation. On prouve AVANT d'activer —
    // c'est ce qui permet de refuser le dépôt sur un mandat actif.
    if (this.proofValue === null) {
      throw new MandateUnprovenError();
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
   * Ce que le back-office montre. Ni l'identifiant du moyen de paiement ni celui
   * du client Stripe n'en font partie : ils servent à débiter, pas à afficher, et
   * ce qui ne sort pas ne fuit pas.
   */
  toView(): PaymentMandateView {
    return {
      id: this.id,
      reference: this.identity.reference,
      status: this.statusValue,
      last4: this.identity.last4,
      bankCode: this.identity.bankCode,
      country: this.identity.country,
      acceptedAt: this.acceptedAtValue?.toISOString() ?? null,
      revokedAt: this.revokedAtValue?.toISOString() ?? null,
      hasProof: this.proven(),
      proofFileName: this.proofValue?.fileName ?? "",
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
      hasProof: this.proven(),
      proofFileName: this.proofValue?.fileName ?? "",
      acceptedAt: this.acceptedAtValue?.toISOString() ?? null,
    };
  }
}
