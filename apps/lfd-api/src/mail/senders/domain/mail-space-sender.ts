import {
  hasSenderNature,
  senderDomainOf,
  validateMailSenderIdentity,
  validateStoredMailSenderIdentity,
  type MailNature,
  type MailSenderIdentity,
  type MailSpace,
} from "@lfd/mail-blocks";

import {
  MailSenderChangedError,
  MailSenderNatureNotOfferedError,
  MailSenderRefusedError,
  SenderDomainNotVerifiedError,
  StoredMailSenderUnreadableError,
} from "./mail-sender-errors.js";

/** Un geste daté et signé — l'identifiant INTERNE de la fiche staff. */
export interface MailSenderStamp {
  readonly at: Date;
  readonly staffId: string;
}

/** L'état complet, tel que l'adaptateur le range et le relit. */
export interface MailSpaceSenderState {
  readonly space: MailSpace;
  /** La nature des e-mails que l'identité signe (U5). */
  readonly nature: MailNature;
  /** 0 = jamais réglée (aucune ligne) : l'identité par défaut. */
  readonly revision: number;
  readonly identity: MailSenderIdentity | null;
  readonly changed: MailSenderStamp | null;
}

/**
 * Refuse une identité qui ne peut pas partir sous ce compte Resend : une
 * forme fausse, ou une adresse d'envoi dont le domaine n'est pas vérifié.
 * Partagée par la vérification d'avant l'essai et par le changement.
 *
 * @throws {MailSenderRefusedError} une règle de forme est enfreinte.
 * @throws {SenderDomainNotVerifiedError} le domaine n'est pas vérifié.
 */
export function assertSendable(
  space: MailSpace,
  identity: MailSenderIdentity,
  verifiedDomains: readonly string[],
): void {
  const violations = validateMailSenderIdentity(identity);
  if (violations.length > 0) {
    throw new MailSenderRefusedError(space, violations);
  }
  const domain = senderDomainOf(identity.fromAddress);
  if (!verifiedDomains.some((verified) => verified.toLowerCase() === domain)) {
    throw new SenderDomainNotVerifiedError(space, domain, verifiedDomains);
  }
}

/** @throws {MailSenderNatureNotOfferedError} l'espace ne règle pas cette nature. */
function assertNatureOffered(space: MailSpace, nature: MailNature): void {
  if (!hasSenderNature(space, nature)) {
    throw new MailSenderNatureNotOfferedError(space, nature);
  }
}

/**
 * **L'identité d'envoi d'un espace d'e-mails** — l'agrégat (plan
 * `plan-editeur-par-blocs.md`, § 25, C3) : « une marque = un espace = une
 * charte = une identité d'envoi ».
 *
 * Elle refuse : une identité mal formée, ou sans adresse de réponse que
 * quelqu'un lit (décision du 2026-11-07) ; une adresse d'envoi dont le domaine
 * n'est pas dans la liste des domaines vérifiés que l'appelant a lue chez
 * Resend ; toute écriture faite sur une révision que quelqu'un a dépassée.
 * L'essai d'envoi qui précède le changement est le travail de l'appelant :
 * l'agrégat n'envoie rien.
 *
 * **Une identité par espace et par nature** (plan
 * `la-desinscription-et-l-accord.md`, règle 9, lot U5) : `transactional`
 * signe les e-mails de service, `marketing` les offres — sur un sous-domaine
 * à part, pour qu'une plainte sur une offre ne fasse pas tomber les
 * confirmations de commande en spam. 🔴 **Repli** : tant qu'aucune identité
 * `marketing` n'est réglée pour un espace, ses e-mails marketing partent sous
 * son identité `transactional` (le sous-domaine marketing est un geste DNS
 * de Hugo, pas encore fait) ; c'est l'envoi qui l'applique
 * (`EffectiveCopyMailer`). Un espace qui n'envoie pas de marketing (`lfd`,
 * `MAIL_SENDER_NATURES`) n'a pas d'identité marketing : elle n'existe pas,
 * ni à lire ni à écrire.
 */
export class MailSpaceSender {
  private constructor(
    private state: MailSpaceSenderState,
    private readonly loaded: number,
  ) {}

  /**
   * Une identité jamais réglée : l'espace envoie sous l'identité par défaut
   * (sa transactionnelle, pour une identité marketing).
   *
   * @throws {MailSenderNatureNotOfferedError} l'espace ne règle pas cette nature.
   */
  static unset(space: MailSpace, nature: MailNature): MailSpaceSender {
    assertNatureOffered(space, nature);
    return new MailSpaceSender({ space, nature, revision: 0, identity: null, changed: null }, 0);
  }

  /**
   * Relit une identité rangée : sa forme est revérifiée — une ligne touchée à
   * la main ne passe pas pour une identité valide. La forme seule : une
   * identité rangée avant le 2026-11-07 sans adresse de réponse (ou en
   * `no-reply`) reste lisible ; `change` la refusera au prochain
   * enregistrement.
   *
   * @throws {StoredMailSenderUnreadableError} l'identité rangée ne tient plus.
   * @throws {MailSenderNatureNotOfferedError} l'espace ne règle pas cette nature.
   */
  static reconstitute(state: MailSpaceSenderState): MailSpaceSender {
    assertNatureOffered(state.space, state.nature);
    if (state.identity !== null && validateStoredMailSenderIdentity(state.identity).length > 0) {
      throw new StoredMailSenderUnreadableError(state.space);
    }
    return new MailSpaceSender(state, state.revision);
  }

  get space(): MailSpace {
    return this.state.space;
  }

  get nature(): MailNature {
    return this.state.nature;
  }

  /** La révision chargée : le verrou de l'enregistrement. */
  get loadedRevision(): number {
    return this.loaded;
  }

  snapshot(): MailSpaceSenderState {
    return this.state;
  }

  /** @throws {MailSenderChangedError} la révision lue par l'écran a été dépassée. */
  assertRevision(expectedRevision: number): void {
    if (expectedRevision !== this.state.revision) {
      throw new MailSenderChangedError(this.state.space);
    }
  }

  /**
   * Change l'identité, sur la révision lue par l'écran.
   *
   * @throws {MailSenderChangedError} la révision a été dépassée.
   * @throws {MailSenderRefusedError} une règle de forme est enfreinte.
   * @throws {SenderDomainNotVerifiedError} le domaine n'est pas vérifié.
   */
  change(
    identity: MailSenderIdentity,
    verifiedDomains: readonly string[],
    expectedRevision: number,
    stamp: MailSenderStamp,
  ): void {
    this.assertRevision(expectedRevision);
    assertSendable(this.state.space, identity, verifiedDomains);
    this.state = {
      space: this.state.space,
      nature: this.state.nature,
      revision: this.state.revision + 1,
      identity: {
        senderName: identity.senderName.trim(),
        fromAddress: identity.fromAddress,
        replyToAddress: identity.replyToAddress,
      },
      changed: stamp,
    };
  }
}
