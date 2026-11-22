import { InvalidPayLinkError, PayLinkAlreadyRevokedError } from "../errors/pay-link-errors.js";

/** `order`, `free_charge`… : un mot en minuscules, des soulignés admis (comme un paiement). */
const SUBJECT_TYPE = /^[a-z][a-z_]*$/u;
/** Borne d'un libellé ou d'un motif : un nom, une phrase — pas un document. */
export const PAY_LINK_TEXT_MAX_LENGTH = 200;

/** La ligne telle que la persistance la lit et l'écrit — primitives seulement. */
export interface PayLinkSnapshot {
  readonly id: string;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly origin: string;
  readonly payerLabel: string;
  readonly tokenHash: string;
  readonly tokenSealed: string;
  readonly createdAt: Date;
  readonly createdBy: string;
  /** Le nom de l'auteur, donné par l'appelant ; `null` : système ou inconnu. */
  readonly createdByLabel: string | null;
  readonly revokedAt: Date | null;
  readonly revokedReason: string | null;
}

/** Ce qu'il faut pour ouvrir un lien : le jeton arrive déjà haché et scellé. */
export interface PayLinkOpening {
  readonly id: string;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly origin: string;
  readonly payerLabel: string;
  readonly tokenHash: string;
  readonly tokenSealed: string;
  readonly at: Date;
  readonly by: string;
  readonly byLabel: string | null;
}

/**
 * **Un lien de paiement vers un sujet** (doc
 * `documentation/payment/les-liens-de-paiement.md`) — l'agrégat qui porte sa vie :
 * ouvert, puis révoqué une fois, jamais ranimé.
 *
 * Tout ce que le déclencheur `pay_link_guard` tient immuable n'a ici aucun
 * mutateur ; seule la révocation bouge, et une seule fois.
 */
export class PayLink {
  private constructor(
    private readonly row: Omit<PayLinkSnapshot, "revokedAt" | "revokedReason">,
    private revokedAtValue: Date | null,
    private revokedReasonValue: string | null,
  ) {}

  /**
   * **Ouvre** un lien vivant.
   * @throws {InvalidPayLinkError} sujet mal formé, libellé ou auteur vide ou trop long.
   */
  static open(input: PayLinkOpening): PayLink {
    return new PayLink(
      {
        id: input.id,
        subjectType: subjectTypeOf(input.subjectType),
        subjectId: present("l'identifiant du sujet", input.subjectId),
        origin: present("l'origine", input.origin),
        payerLabel: bounded("le nom du payeur", input.payerLabel),
        tokenHash: present("l'empreinte du jeton", input.tokenHash),
        tokenSealed: present("le scellé du jeton", input.tokenSealed),
        createdAt: input.at,
        createdBy: bounded("l'auteur", input.by),
        createdByLabel: labelOf(input.byLabel),
      },
      null,
      null,
    );
  }

  /** Relit une ligne. */
  static rehydrate(row: PayLinkSnapshot): PayLink {
    const { revokedAt, revokedReason, ...rest } = row;
    return new PayLink(rest, revokedAt, revokedReason);
  }

  get id(): string {
    return this.row.id;
  }

  get subjectType(): string {
    return this.row.subjectType;
  }

  get subjectId(): string {
    return this.row.subjectId;
  }

  get origin(): string {
    return this.row.origin;
  }

  get payerLabel(): string {
    return this.row.payerLabel;
  }

  get createdAt(): Date {
    return this.row.createdAt;
  }

  /** Une fiche du staff, ou `system` pour une émission automatique. */
  get createdBy(): string {
    return this.row.createdBy;
  }

  /** Le nom de l'auteur ; `null` : le système, ou un nom que l'appelant n'avait pas. */
  get createdByLabel(): string | null {
    return this.row.createdByLabel;
  }

  get tokenSealed(): string {
    return this.row.tokenSealed;
  }

  /** Vivant tant qu'il n'est pas révoqué : pas d'expiration (§2.1). */
  get isLive(): boolean {
    return this.revokedAtValue === null;
  }

  /**
   * **Révoque** le lien : sa page rend le même 404 qu'un jeton inconnu.
   * @throws {PayLinkAlreadyRevokedError} déjà révoqué.
   * @throws {InvalidPayLinkError} motif vide ou trop long.
   */
  revoke(reason: string, at: Date): void {
    if (!this.isLive) {
      throw new PayLinkAlreadyRevokedError(this.row.id);
    }
    this.revokedReasonValue = bounded("le motif de révocation", reason);
    this.revokedAtValue = at;
  }

  toPersistence(): PayLinkSnapshot {
    return { ...this.row, revokedAt: this.revokedAtValue, revokedReason: this.revokedReasonValue };
  }
}

function subjectTypeOf(type: string): string {
  if (!SUBJECT_TYPE.test(type)) {
    throw new InvalidPayLinkError("le type du sujet", "est un mot en minuscules (order, …)");
  }
  return type;
}

/** Un nom vide vaut l'absence : on ne range pas un blanc pour un nom. */
function labelOf(label: string | null): string | null {
  return label === null || label.trim() === "" ? null : bounded("le nom de l'auteur", label);
}

function present(field: string, value: string): string {
  if (value.trim() === "") {
    throw new InvalidPayLinkError(field, "est obligatoire");
  }
  return value;
}

function bounded(field: string, value: string): string {
  const trimmed = present(field, value).trim();
  if (trimmed.length > PAY_LINK_TEXT_MAX_LENGTH) {
    throw new InvalidPayLinkError(
      field,
      `tient en ${String(PAY_LINK_TEXT_MAX_LENGTH)} caractères au plus`,
    );
  }
  return trimmed;
}
