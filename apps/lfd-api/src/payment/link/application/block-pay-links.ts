import { Injectable, Logger } from "@nestjs/common";

import { IdGenerator } from "../../../platform/id/id-generator.js";
import { Clock } from "../../../platform/time/clock.js";
import {
  type OpenedPayLink,
  type PayLinkRequest,
  PayLinks,
  type SubjectPayLinkUrl,
} from "../../channels/requests/pay-links.js";
import type { CardSubject } from "../../channels/subjects/subject-settlement.js";
import { LinkableSubjects } from "../../channels/subjects/linkable-subjects.js";
import { PayLink } from "../domain/entities/pay-link.js";
import {
  PayLinkOpeningConflictError,
  PayLinkOriginWithoutRootError,
  SubjectNotLinkableError,
  UnknownPayLinkOriginError,
} from "../domain/errors/pay-link-errors.js";
import { PayLinkOrigins } from "../domain/ports/pay-link-origins.js";
import { PayLinkTokenVault } from "../domain/ports/pay-link-token-vault.js";
import { PayLinkRepository } from "../domain/ports/pay-link.repository.js";
import { TokenGenerator } from "../domain/ports/token-generator.js";
import { payLinkUrl } from "../domain/services/pay-link-url.js";

/**
 * **La porte `PayLinks`, implémentée par le bloc** (plan des liens, §2.2).
 *
 * Aucun appel réseau : `open` écrit dans la transaction de l'appelant, et un
 * second lien vivant sur le même sujet est rendu impossible par l'index
 * partiel — l'insertion qui le heurte ne lève pas, elle relit l'existant.
 */
@Injectable()
export class BlockPayLinks extends PayLinks {
  private readonly logger = new Logger(BlockPayLinks.name);

  constructor(
    private readonly links: PayLinkRepository,
    private readonly origins: PayLinkOrigins,
    private readonly linkables: LinkableSubjects,
    private readonly tokens: TokenGenerator,
    private readonly vault: PayLinkTokenVault,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {
    super();
  }

  async open(subject: CardSubject, request: PayLinkRequest): Promise<OpenedPayLink> {
    const root = this.rootOf(request.origin);
    if (this.linkables.forType(subject.type) === null) {
      throw new SubjectNotLinkableError(subject.type);
    }
    const token = this.tokens.next();
    const link = PayLink.open({
      id: this.ids.next(),
      subjectType: subject.type,
      subjectId: subject.id,
      origin: request.origin,
      payerLabel: request.payerLabel,
      tokenHash: this.vault.fingerprint(token),
      tokenSealed: this.vault.seal(token),
      at: this.clock.now(),
      by: request.by,
    });
    if (await this.links.addIfAbsent(link)) {
      return { linkId: link.id, url: payLinkUrl(root, token) };
    }
    const live = await this.links.liveOf(subject.type, subject.id);
    if (live === null) {
      throw new PayLinkOpeningConflictError(subject.type, subject.id);
    }
    return { linkId: live.id, url: this.urlOfLink(live) };
  }

  async revoke(subject: CardSubject, reason: string): Promise<boolean> {
    const live = await this.links.liveOf(subject.type, subject.id);
    if (live === null) {
      return false;
    }
    live.revoke(reason, this.clock.now());
    await this.links.save(live);
    return true;
  }

  async urlOf(subject: CardSubject): Promise<string | null> {
    const live = await this.links.liveOf(subject.type, subject.id);
    return live === null ? null : this.urlOfLink(live);
  }

  async urlsOf(subjects: readonly CardSubject[]): Promise<readonly SubjectPayLinkUrl[]> {
    const live = await this.links.liveOfAll(subjects);
    return live.flatMap((link) => {
      const subject = { type: link.subjectType, id: link.subjectId };
      try {
        return [{ subject, url: this.urlOfLink(link) }];
      } catch (error) {
        this.logger.error(
          `Adresse du lien ${link.id} (${link.subjectType} ${link.subjectId}) non composée : ` +
            "la ligne est servie sans adresse.",
          error,
        );
        return [];
      }
    });
  }

  private urlOfLink(link: PayLink): string {
    return payLinkUrl(this.rootOf(link.origin), this.vault.open(link.tokenSealed));
  }

  private rootOf(originName: string): string {
    const origin = this.origins.find(originName);
    if (origin === null) {
      throw new UnknownPayLinkOriginError(originName);
    }
    if (origin.publicRoot === null) {
      throw new PayLinkOriginWithoutRootError(origin.label);
    }
    return origin.publicRoot;
  }
}
