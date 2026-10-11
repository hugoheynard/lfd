import type { LoyaltyAccount } from "../../../domain/entities/loyalty-account.js";
import { WelcomeBonusAlreadyCreditedError } from "../../../domain/errors/welcome-bonus-errors.js";
import { LoyaltyWelcomedReader } from "../../../domain/ports/loyalty-welcomed.reader.js";
import {
  WelcomeCandidateReader,
  type WelcomeCandidateFacts,
  type WelcomeCandidatePage,
} from "../../../domain/ports/welcome-candidate.reader.js";
import { InMemoryLedger } from "./loyalty-doubles.js";

/** Doubles du bonus de bienvenue, écrits à la main, héritant des ports — jamais `jest.fn()`. */

/** Les personnes connues ; `listPending` applique le filtre que fait la base. */
export class FixedWelcomeCandidates extends WelcomeCandidateReader {
  readonly pages: (string | null)[] = [];

  constructor(
    private readonly people: readonly WelcomeCandidateFacts[],
    private readonly ledger: InMemoryLedger,
  ) {
    super();
  }

  candidate(userId: string): Promise<WelcomeCandidateFacts | null> {
    return Promise.resolve(this.people.find((person) => person.userId === userId) ?? null);
  }

  listPending(since: Date, after: string | null, limit: number): Promise<WelcomeCandidatePage> {
    this.pages.push(after);
    const welcomed = new Set(
      this.ledger.entries.filter((entry) => entry.kind === "welcome").map((e) => e.holder.id),
    );
    const rest = this.people
      .filter(
        (person) => person.addressProven && !person.accountDisabled && !welcomed.has(person.userId),
      )
      .filter((person) => (person.becameAccountAt?.getTime() ?? -1) >= since.getTime())
      .map((person) => person.userId)
      .sort()
      .filter((id) => after === null || id > after);
    const page = rest.slice(0, limit);
    const last = page.at(-1);
    return Promise.resolve({
      userIds: page,
      nextAfter: rest.length > limit && last !== undefined ? last : null,
    });
  }
}

/** La ligne `welcome`, lue dans le livre en mémoire — et notée dans le journal partagé. */
export class LedgerWelcomed extends LoyaltyWelcomedReader {
  constructor(private readonly ledger: InMemoryLedger) {
    super();
  }

  isWelcomed(userId: string): Promise<boolean> {
    this.ledger.calls.push(`welcomed?:${userId}`);
    return Promise.resolve(
      this.ledger.entries.some((entry) => entry.kind === "welcome" && entry.holder.id === userId),
    );
  }
}

/**
 * Le livre dont l'index unique refuse la ligne : un passage concurrent l'a
 * écrite entre la relecture et l'insertion — ce que le dépôt traduit.
 */
export class RacingWelcomeLedger extends InMemoryLedger {
  override save(account: LoyaltyAccount): Promise<void> {
    const userId = account.holder.userId ?? "";
    return Promise.reject(new WelcomeBonusAlreadyCreditedError(userId));
  }
}
