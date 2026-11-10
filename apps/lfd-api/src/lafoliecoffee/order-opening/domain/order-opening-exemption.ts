import { EmailAddress } from "../../account/domain/value-objects/email-address.js";
import type { CompanyStatus } from "../../account/domain/value-objects/company-status.js";
import type { StaffTrace } from "../../account/domain/value-objects/staff-trace.js";
import {
  AlreadyExemptError,
  ExemptedCompanyNotFoundError,
  ExemptedCompanyTerminatedError,
  OrderOpeningExemptionNotFoundError,
} from "./errors/order-opening-exemption-errors.js";

/** Ce que vise une exemption : une société (nommée au geste), ou une adresse normalisée. */
export type ExemptionTarget =
  | { readonly kind: "company"; readonly companyId: string; readonly companyName: string }
  | { readonly kind: "email"; readonly email: string };

/** Qui commande, tel que la passation le connaît. */
export interface OrderingParty {
  /** La société agissante ; `null` pour l'espace perso ou une commande sans compte. */
  readonly companyId: string | null;
  /** L'adresse de qui commande, telle quelle ; `null` si on ne la connaît pas. */
  readonly email: string | null;
}

/** Le geste, figé : son instant et son auteur. */
export interface ExemptionStamp {
  readonly at: Date;
  readonly author: StaffTrace;
}

/** La société candidate, telle que l'annuaire la connaît ; `null` si elle n'existe pas. */
export interface CompanyCandidate {
  readonly name: string;
  readonly status: CompanyStatus;
}

/**
 * **Une exemption à la fermeture de la boutique** (décision de Hugo du
 * 2026-10-26) : une société ou une adresse qui commande malgré la fermeture
 * de sa clientèle.
 *
 * Un agrégat, parce que deux règles peuvent refuser l'écriture : une cible
 * déjà exemptée ne l'est pas deux fois, et une exemption retirée ne se retire
 * pas de nouveau. Retirer ARCHIVE (`withdrawn`) au lieu d'effacer : « qui a
 * laissé commander ce client pendant la fermeture » doit se relire.
 *
 * L'adresse passe par {@link EmailAddress} — la normalisation d'un compte
 * client : c'est ce qui la fait se comparer à l'identique à celle de qui
 * commande, majuscules et espaces compris.
 */
export class OrderOpeningExemption {
  private constructor(
    readonly id: string,
    readonly target: ExemptionTarget,
    readonly granted: ExemptionStamp,
    private withdrawnStamp: ExemptionStamp | null,
  ) {}

  /**
   * @throws {ExemptedCompanyNotFoundError} la société n'existe pas.
   * @throws {ExemptedCompanyTerminatedError} la société est archivée.
   * @throws {AlreadyExemptError} elle est déjà exemptée.
   */
  static grantToCompany(input: {
    readonly id: string;
    readonly companyId: string;
    readonly company: CompanyCandidate | null;
    readonly active: readonly OrderOpeningExemption[];
    readonly stamp: ExemptionStamp;
  }): OrderOpeningExemption {
    const { company } = input;
    if (company === null) {
      throw new ExemptedCompanyNotFoundError(input.companyId);
    }
    if (company.status === "terminated") {
      throw new ExemptedCompanyTerminatedError(company.name);
    }
    const target: ExemptionTarget = {
      kind: "company",
      companyId: input.companyId,
      companyName: company.name,
    };
    return OrderOpeningExemption.grant(input.id, target, input.active, input.stamp);
  }

  /**
   * @throws {InvalidEmailError} l'adresse n'en est manifestement pas une.
   * @throws {AlreadyExemptError} elle est déjà exemptée.
   */
  static grantToEmail(input: {
    readonly id: string;
    readonly email: string;
    readonly active: readonly OrderOpeningExemption[];
    readonly stamp: ExemptionStamp;
  }): OrderOpeningExemption {
    const target: ExemptionTarget = {
      kind: "email",
      email: EmailAddress.create(input.email).value,
    };
    return OrderOpeningExemption.grant(input.id, target, input.active, input.stamp);
  }

  /** Relit une exemption écrite : la cible a été contrôlée à l'ajout. */
  static rehydrate(input: {
    readonly id: string;
    readonly target: ExemptionTarget;
    readonly granted: ExemptionStamp;
    readonly withdrawn: ExemptionStamp | null;
  }): OrderOpeningExemption {
    return new OrderOpeningExemption(input.id, input.target, input.granted, input.withdrawn);
  }

  private static grant(
    id: string,
    target: ExemptionTarget,
    active: readonly OrderOpeningExemption[],
    stamp: ExemptionStamp,
  ): OrderOpeningExemption {
    const candidate = new OrderOpeningExemption(id, target, stamp, null);
    if (active.some((existing) => existing.isActive() && existing.sameTarget(candidate))) {
      throw new AlreadyExemptError(candidate.label);
    }
    return candidate;
  }

  get withdrawn(): ExemptionStamp | null {
    return this.withdrawnStamp;
  }

  /** Le nom de la société figé à l'ajout, ou l'adresse. */
  get label(): string {
    return this.target.kind === "company" ? this.target.companyName : this.target.email;
  }

  isActive(): boolean {
    return this.withdrawnStamp === null;
  }

  /**
   * Retire l'exemption — archivée, pas effacée.
   *
   * @throws {OrderOpeningExemptionNotFoundError} elle est déjà retirée.
   */
  withdraw(stamp: ExemptionStamp): void {
    if (!this.isActive()) {
      throw new OrderOpeningExemptionNotFoundError(this.id);
    }
    this.withdrawnStamp = stamp;
  }

  /** L'exemption couvre-t-elle qui commande ? Une exemption retirée ne couvre personne. */
  covers(party: OrderingParty): boolean {
    if (!this.isActive()) {
      return false;
    }
    if (this.target.kind === "company") {
      return party.companyId === this.target.companyId;
    }
    return party.email !== null && normalizedEmail(party.email) === this.target.email;
  }

  private sameTarget(other: OrderOpeningExemption): boolean {
    const mine = this.target;
    const theirs = other.target;
    if (mine.kind === "company" && theirs.kind === "company") {
      return mine.companyId === theirs.companyId;
    }
    return mine.kind === "email" && theirs.kind === "email" && mine.email === theirs.email;
  }
}

/**
 * La même normalisation qu'{@link EmailAddress}, sans son refus : l'adresse de
 * qui commande a déjà été contrôlée là où elle est entrée, et une adresse
 * qu'on ne saurait pas relire ne doit pas faire échouer la passation — elle
 * ne correspond simplement à aucune exemption.
 */
function normalizedEmail(raw: string): string {
  return raw.trim().toLowerCase();
}
