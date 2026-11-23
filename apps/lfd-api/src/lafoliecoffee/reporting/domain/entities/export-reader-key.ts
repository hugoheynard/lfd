import {
  ExportReaderKeyAlreadyRevokedError,
  ExportReaderKeyExpiryInPastError,
  ExportReaderKeyLabelInvalidError,
  ExportReaderKeySecretTooWeakError,
  ExportReaderKeyStateInvalidError,
} from "../errors/export-reader-key-errors.js";
import { AdmittedAddresses } from "../value-objects/admitted-addresses.js";
import { hashExportKeySecret } from "../value-objects/export-key-secret.js";

/** Longueur maximale du nom du lecteur. */
export const EXPORT_KEY_LABEL_MAX = 120;

/**
 * Longueur minimale d'un secret : 32 octets en base64url font 43 signes.
 * En dessous, la source d'aléa n'est pas celle qu'on croit.
 */
export const EXPORT_KEY_SECRET_MIN_LENGTH = 43;

/** L'état d'une clé, tel que l'adaptateur le range et le relit. */
export interface ExportReaderKeyState {
  readonly id: string;
  readonly label: string;
  readonly secretHash: string;
  readonly createdAt: Date;
  readonly createdByStaffId: string;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
  readonly revokedByStaffId: string | null;
  readonly allowedIps: readonly string[];
}

/** Ce que la création demande. Le secret arrive en clair et repart haché. */
export interface IssueExportReaderKey {
  readonly id: string;
  readonly label: string;
  readonly secret: string;
  readonly at: Date;
  readonly byStaffId: string;
  readonly expiresAt: Date;
  readonly allowedIps: readonly string[];
}

/** La révocation : qui, et quand. Posés ensemble, jamais l'un sans l'autre. */
interface Revocation {
  readonly at: Date;
  readonly byStaffId: string;
}

const SHA256_HEX = /^[0-9a-f]{64}$/u;

/**
 * **Une clé de lecture de l'export des ventes** (plan
 * `documentation/commandes/export/plan-export-des-ventes.md`, § 6.1, § 6.5).
 *
 * Elle porte trois règles : elle naît vivante (échéance à venir, lecteur
 * nommé, secret assez long), elle ne se révoque qu'une fois, et elle n'admet
 * un appel que vivante — non révoquée, non échue, depuis une adresse admise.
 * Le secret n'y entre que pour être haché : l'agrégat ne le garde pas.
 */
export class ExportReaderKey {
  private revocation: Revocation | null;

  private constructor(
    private readonly state: Omit<ExportReaderKeyState, "revokedAt" | "revokedByStaffId">,
    private readonly addresses: AdmittedAddresses,
    revocation: Revocation | null,
  ) {
    this.revocation = revocation;
  }

  /**
   * Crée une clé pour un lecteur.
   *
   * @throws {ExportReaderKeyLabelInvalidError} lecteur vide ou trop long.
   * @throws {ExportReaderKeyExpiryInPastError} échéance qui n'est pas à venir.
   * @throws {ExportReaderKeyIpInvalidError} une adresse admise illisible.
   * @throws {ExportReaderKeySecretTooWeakError} secret plus court que 32 octets encodés.
   */
  static issue(input: IssueExportReaderKey): ExportReaderKey {
    const label = input.label.trim();
    if (label === "" || label.length > EXPORT_KEY_LABEL_MAX) {
      throw new ExportReaderKeyLabelInvalidError(EXPORT_KEY_LABEL_MAX);
    }
    if (input.expiresAt.getTime() <= input.at.getTime()) {
      throw new ExportReaderKeyExpiryInPastError();
    }
    if (input.secret.length < EXPORT_KEY_SECRET_MIN_LENGTH) {
      throw new ExportReaderKeySecretTooWeakError(EXPORT_KEY_SECRET_MIN_LENGTH);
    }
    const addresses = AdmittedAddresses.of(input.allowedIps);
    return new ExportReaderKey(
      {
        id: input.id,
        label,
        secretHash: hashExportKeySecret(input.secret),
        createdAt: input.at,
        createdByStaffId: input.byStaffId,
        expiresAt: input.expiresAt,
        allowedIps: addresses.values,
      },
      addresses,
      null,
    );
  }

  /**
   * Relit une clé rangée. Une ligne incohérente (haché mal formé, révocation
   * à moitié posée) est une erreur technique : personne ne l'a écrite par le
   * domaine.
   */
  static rehydrate(state: ExportReaderKeyState): ExportReaderKey {
    if (!SHA256_HEX.test(state.secretHash)) {
      throw new ExportReaderKeyStateInvalidError(state.id, "haché illisible");
    }
    if ((state.revokedAt === null) !== (state.revokedByStaffId === null)) {
      throw new ExportReaderKeyStateInvalidError(state.id, "révocation incomplète");
    }
    const revocation =
      state.revokedAt === null || state.revokedByStaffId === null
        ? null
        : { at: state.revokedAt, byStaffId: state.revokedByStaffId };
    const addresses = AdmittedAddresses.of(state.allowedIps);
    return new ExportReaderKey(
      {
        id: state.id,
        label: state.label,
        secretHash: state.secretHash,
        createdAt: state.createdAt,
        createdByStaffId: state.createdByStaffId,
        expiresAt: state.expiresAt,
        allowedIps: addresses.values,
      },
      addresses,
      revocation,
    );
  }

  get id(): string {
    return this.state.id;
  }

  get label(): string {
    return this.state.label;
  }

  get expiresAt(): Date {
    return this.state.expiresAt;
  }

  get allowedIps(): readonly string[] {
    return this.addresses.values;
  }

  get revoked(): boolean {
    return this.revocation !== null;
  }

  /**
   * Révoque la clé : elle n'admet plus aucun appel, dès le suivant.
   *
   * @throws {ExportReaderKeyAlreadyRevokedError} elle l'est déjà.
   */
  revoke(at: Date, byStaffId: string): void {
    if (this.revocation !== null) {
      throw new ExportReaderKeyAlreadyRevokedError(this.state.label);
    }
    this.revocation = { at, byStaffId };
  }

  /**
   * La clé ouvre-t-elle un appel, à cet instant, depuis cette adresse ? Non
   * révoquée, pas encore échue (l'échéance elle-même est refusée), et
   * l'adresse admise si la liste n'est pas vide.
   */
  admits(now: Date, ip: string): boolean {
    return (
      this.revocation === null &&
      now.getTime() < this.state.expiresAt.getTime() &&
      this.addresses.admits(ip)
    );
  }

  toPersistence(): ExportReaderKeyState {
    return {
      ...this.state,
      revokedAt: this.revocation?.at ?? null,
      revokedByStaffId: this.revocation?.byStaffId ?? null,
    };
  }
}
