import {
  ChorusServiceCodeOnSolePayerError,
  ChorusServicePayerNotPublicError,
  InvalidChorusServiceError,
} from "../errors/chorus-service-errors.js";
import { isCalendarDay } from "./calendar-day.js";
import type { StaffTrace } from "./staff-trace.js";

/** Le numéro d'engagement : 1 à 50 caractères, la forme de l'engagement d'une commande. */
const COMMITMENT_NUMBER_MAX_LENGTH = 50;
/** Un code service Chorus Pro tient en 100 caractères, comme sur la fiche Chorus et la commande. */
const SERVICE_CODE_MAX_LENGTH = 100;
/** Imprimable : ni caractère de contrôle, ni saut de ligne. */
const CONTROL_CHARACTER = /\p{Cc}/u;

/** Ce que le staff saisit à réception du bon. */
export interface ChorusServiceInput {
  readonly serviceCode: string;
  /** Vide : aucun engagement en cours. */
  readonly commitmentNumber: string;
  /** `AAAA-MM-JJ`, `null` exactement quand le numéro est vide. */
  readonly commitmentEndsOn: string | null;
}

/** Le payeur que la société a au moment du geste. */
export interface ChorusServicePayer {
  readonly companyId: string;
  readonly isPublic: boolean;
}

/** L'engagement en cours : un numéro et son dernier jour de validité. */
export interface CurrentCommitment {
  readonly number: string;
  /** `AAAA-MM-JJ`. */
  readonly endsOn: string;
}

/**
 * **La fiche du service Chorus** d'une société qui commande — le sous-compte
 * d'une unité sous un SIRET de facturation partagé, ou un compte public seul :
 * son code service et l'engagement en cours, qui préremplissent ses commandes
 * sans rien imposer.
 *
 * Elle garde le payeur du moment : une société qui change de principal ne
 * propose pas l'engagement d'un autre SIRET, et c'est la lecture qui l'écarte.
 * Un engagement a toujours une fin.
 */
export class ChorusService {
  private constructor(
    readonly payerCompanyId: string,
    readonly serviceCode: string,
    readonly currentCommitment: CurrentCommitment | null,
    readonly recordedAt: Date,
    readonly recordedBy: StaffTrace,
  ) {}

  /**
   * La fiche que l'agent pose sur la société `companyId`, facturée à `payer`.
   *
   * @throws {ChorusServicePayerNotPublicError} le payeur n'est pas public.
   * @throws {ChorusServiceCodeOnSolePayerError} un code sur une société qui
   *   est son propre payeur : sa fiche Chorus Pro porte déjà le sien.
   * @throws {InvalidChorusServiceError} la fiche est mal formée.
   */
  static record(
    companyId: string,
    payer: ChorusServicePayer,
    input: ChorusServiceInput,
    recordedAt: Date,
    recordedBy: StaffTrace,
  ): ChorusService {
    if (!payer.isPublic) {
      throw new ChorusServicePayerNotPublicError(companyId, payer.companyId);
    }
    const service = ChorusService.reconstitute(payer.companyId, input, recordedAt, recordedBy);
    if (payer.companyId === companyId && service.serviceCode !== "") {
      throw new ChorusServiceCodeOnSolePayerError(companyId);
    }
    return service;
  }

  /** Relit une fiche rangée : mêmes formes qu'à la saisie. */
  static reconstitute(
    payerCompanyId: string,
    input: ChorusServiceInput,
    recordedAt: Date,
    recordedBy: StaffTrace,
  ): ChorusService {
    return new ChorusService(
      payerCompanyId,
      printable(input.serviceCode, "code service", SERVICE_CODE_MAX_LENGTH),
      commitment(input.commitmentNumber, input.commitmentEndsOn),
      recordedAt,
      recordedBy,
    );
  }

  /**
   * Même fiche, à l'auteur et à l'instant près : la reposer n'est pas un
   * geste neuf, et ne réécrit pas qui l'a posée.
   */
  sameAs(other: ChorusService): boolean {
    return (
      this.payerCompanyId === other.payerCompanyId &&
      this.serviceCode === other.serviceCode &&
      this.currentCommitment?.number === other.currentCommitment?.number &&
      this.currentCommitment?.endsOn === other.currentCommitment?.endsOn
    );
  }
}

function commitment(rawNumber: string, rawEndsOn: string | null): CurrentCommitment | null {
  const number = printable(rawNumber, "numéro d'engagement", COMMITMENT_NUMBER_MAX_LENGTH);
  const endsOn = rawEndsOn?.trim() ?? null;
  if (number === "" && endsOn === null) {
    return null;
  }
  if (number === "") {
    throw new InvalidChorusServiceError(
      "date de fin",
      "une date de fin sans numéro d'engagement : saisissez le numéro, ou retirez la date",
    );
  }
  if (endsOn === null) {
    throw new InvalidChorusServiceError(
      "date de fin",
      "un engagement a toujours une fin : saisissez le dernier jour de validité du bon",
    );
  }
  if (!isCalendarDay(endsOn)) {
    throw new InvalidChorusServiceError(
      "date de fin",
      `« ${endsOn} » n'est pas un jour du calendrier (AAAA-MM-JJ)`,
    );
  }
  return { number, endsOn };
}

function printable(raw: string, field: string, maxLength: number): string {
  const value = raw.trim();
  if (value.length > maxLength) {
    throw new InvalidChorusServiceError(field, `au plus ${String(maxLength)} caractères`);
  }
  if (CONTROL_CHARACTER.test(value)) {
    throw new InvalidChorusServiceError(field, "un caractère n'est pas imprimable");
  }
  return value;
}
