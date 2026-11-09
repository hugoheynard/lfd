import type { MailNature, MailSenderIdentity, MailSpace } from "@lfd/mail-blocks";

import { MailSenderChangedError } from "../../domain/mail-sender-errors.js";
import { MailSpaceSender, type MailSpaceSenderState } from "../../domain/mail-space-sender.js";
import { MailSenderReader } from "../../domain/ports/mail-sender.reader.js";
import { MailSenderTrial } from "../../domain/ports/mail-sender-trial.js";
import { MailSpaceSenderRepository } from "../../domain/ports/mail-space-sender.repository.js";
import { VerifiedSendingDomains } from "../../domain/ports/verified-sending-domains.js";

/** La clé d'une ligne : l'espace et la nature, comme la clé primaire. */
export function senderKey(space: MailSpace, nature: MailNature): string {
  return `${space}:${nature}`;
}

/** Les identités en mémoire, avec le MÊME verrou que l'adaptateur. */
export class InMemoryMailSenders extends MailSpaceSenderRepository {
  readonly rows = new Map<string, MailSpaceSenderState>();

  /** Un refus de l'agrégat sort en promesse rejetée, comme de l'adaptateur. */
  load(space: MailSpace, nature: MailNature): Promise<MailSpaceSender> {
    return new Promise((resolve) => {
      const state = this.rows.get(senderKey(space, nature));
      resolve(
        state === undefined
          ? MailSpaceSender.unset(space, nature)
          : MailSpaceSender.reconstitute(state),
      );
    });
  }

  save(sender: MailSpaceSender): Promise<void> {
    const key = senderKey(sender.space, sender.nature);
    if ((this.rows.get(key)?.revision ?? 0) !== sender.loadedRevision) {
      return Promise.reject(new MailSenderChangedError(sender.space));
    }
    this.rows.set(key, sender.snapshot());
    return Promise.resolve();
  }
}

/** La lecture, sur le même état. */
export class InMemoryMailSenderReader extends MailSenderReader {
  constructor(private readonly senders: InMemoryMailSenders) {
    super();
  }

  stateOf(space: MailSpace, nature: MailNature): Promise<MailSpaceSenderState | null> {
    return Promise.resolve(this.senders.rows.get(senderKey(space, nature)) ?? null);
  }

  configuredSpaces(): Promise<readonly MailSpace[]> {
    return Promise.resolve(
      [...this.senders.rows.values()]
        .filter((state) => state.nature === "transactional")
        .map((state) => state.space),
    );
  }
}

/** Les domaines de Resend, doublés : une liste, ou la panne demandée. */
export class FixedSendingDomains extends VerifiedSendingDomains {
  reads = 0;
  constructor(private readonly domains: readonly string[] | Error) {
    super();
  }

  verified(): Promise<readonly string[]> {
    this.reads += 1;
    return this.domains instanceof Error
      ? Promise.reject(this.domains)
      : Promise.resolve(this.domains);
  }
}

/** L'essai doublé : il range ce qu'on lui demande, ou lève le refus demandé. */
export class RecordingSenderTrial extends MailSenderTrial {
  readonly sent: {
    space: MailSpace;
    identity: MailSenderIdentity;
    to: string;
    intentKey: string;
  }[] = [];

  constructor(private readonly refusal: Error | null = null) {
    super();
  }

  send(
    space: MailSpace,
    identity: MailSenderIdentity,
    to: string,
    intentKey: string,
  ): Promise<void> {
    if (this.refusal !== null) {
      return Promise.reject(this.refusal);
    }
    this.sent.push({ space, identity, to, intentKey });
    return Promise.resolve();
  }
}
