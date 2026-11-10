import { Injectable } from "@nestjs/common";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { Clock } from "../../../../platform/time/clock.js";
import { WelcomeBonusAlreadyCreditedError } from "../../domain/errors/welcome-bonus-errors.js";
import { LoyaltyWelcomeBonusCreditedEvent } from "../../domain/events/loyalty.events.js";
import { LoyaltyAccountRepository } from "../../domain/ports/loyalty-account.repository.js";
import { LoyaltyHolderDirectory } from "../../domain/ports/loyalty-holder.directory.js";
import { LoyaltyWelcomedReader } from "../../domain/ports/loyalty-welcomed.reader.js";
import { WelcomeCandidateReader } from "../../domain/ports/welcome-candidate.reader.js";
import { welcomeBonusFor } from "../../domain/services/welcome-bonus.js";
import type { LoyaltySettings } from "../../domain/value-objects/loyalty-settings.js";
import { LoyaltyHolder } from "../../domain/value-objects/loyalty-holder.js";

/**
 * **Écrire le bonus de bienvenue d'une personne**, une fois — partagé par les
 * deux abonnés (création, rattachement) et la passe de nuit (plan
 * `documentation/comptabilite/fidelite/plan-bienvenue-et-invite-rattache.md`, lot C).
 *
 * Même idempotence à deux étages que le gain d'une commande : la règle
 * ({@link welcomeBonusFor}) est jugée SOUS le verrou du titulaire, après
 * relecture de sa ligne `welcome` — deux passages concurrents s'attendent, le
 * second ne trouve plus rien à faire ; et l'index unique `(user_id) WHERE
 * kind = 'welcome'` refuse en base ce que ce garde laisserait passer. Ce refus
 * se lit « déjà fait », pas comme une panne.
 */
@Injectable()
export class WelcomeBonusCrediting {
  constructor(
    private readonly candidates: WelcomeCandidateReader,
    private readonly welcomed: LoyaltyWelcomedReader,
    private readonly accounts: LoyaltyAccountRepository,
    private readonly holders: LoyaltyHolderDirectory,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  /** Vrai si ce passage a écrit le bonus ; faux si rien n'est dû, ou déjà écrit. */
  async creditWelcomeBonus(userId: string, settings: LoyaltySettings | null): Promise<boolean> {
    const facts = await this.candidates.candidate(userId);
    // Jugé une première fois hors verrou, sans relire la ligne : rien n'est
    // verrouillé pour une personne à qui rien n'est dû.
    if (
      facts === null ||
      welcomeBonusFor({ ...facts, alreadyWelcomed: false }, settings).kind === "skip"
    ) {
      return false;
    }
    const holder = LoyaltyHolder.of("user", userId);
    const label = (await this.holders.describe(holder))?.label ?? null;
    try {
      return await this.uow.run(async () => {
        const account = await this.accounts.loadLocked(holder);
        const alreadyWelcomed = await this.welcomed.isWelcomed(userId);
        const bonus = welcomeBonusFor({ ...facts, alreadyWelcomed }, settings);
        if (bonus.kind === "skip") {
          return false;
        }
        account.welcome({ entryId: this.ids.next(), points: bonus.points, at: this.clock.now() });
        await this.accounts.save(account);
        await this.events.publishTraced(
          new LoyaltyWelcomeBonusCreditedEvent({ holder, label }, bonus.points),
        );
        return true;
      });
    } catch (error) {
      if (error instanceof WelcomeBonusAlreadyCreditedError) {
        return false;
      }
      throw error;
    }
  }
}
