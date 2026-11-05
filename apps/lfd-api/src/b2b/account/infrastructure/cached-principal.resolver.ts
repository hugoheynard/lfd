import { Injectable } from "@nestjs/common";

import { PrincipalResolver } from "../../../platform/auth/principal.resolver.js";
import type { Principal, VerifiedToken } from "../../../platform/auth/principal.js";
import { noteServerTiming, timeServerTiming } from "../../../platform/metrics/server-timing.js";
import { WallClock } from "../../../platform/time/wall-clock.js";
import { PrincipalStampReader } from "../domain/ports/principal-stamp.reader.js";
import { PrincipalMemory, storedPart, type StoredPrincipal } from "./principal-memory.js";
import { tokenProvesAddress } from "./token-address-proof.js";
import {
  TrackedPrincipalResolver,
  type PrincipalResolution,
} from "./tracked-principal.resolver.js";

/** Au plus mille personnes en mémoire (§3 bis). */
export const PRINCIPAL_MEMORY_CAPACITY = 1_000;

/** Le filet : dix minutes. Il ne sert pas à la justesse, l'estampille si (§3 bis). */
export const PRINCIPAL_MEMORY_LIFETIME_MS = 10 * 60 * 1000;

/** Une lecture en vol, et l'estampille lue avant elle. */
interface InFlightRead {
  readonly stamp: bigint;
  readonly done: Promise<PrincipalResolution>;
}

/**
 * **Le principal gardé en mémoire de l'API**
 * (`documentation/caching-usage/plan-principal-en-memoire.md`, lot L4).
 *
 * Chaque requête lit l'estampille — une ligne que trois déclencheurs font
 * monter à toute écriture sur `users`, `memberships`, `companies` — et ne
 * relit le principal que si elle a bougé. Un compte désactivé reste donc
 * coupé à la requête suivante : l'estampille n'est jamais gardée.
 *
 * 🔴 **L'ordre est la justesse** (§3 bis) : l'estampille D'ABORD, le principal
 * ensuite, rangé sous l'estampille lue avant. Lu dans l'autre ordre, un
 * principal d'avant une désactivation pourrait se ranger sous le numéro
 * d'après, et le compte garderait son accès.
 *
 * Ne se garde que le chemin qui n'écrit rien ({@link TrackedPrincipalResolver}) ;
 * premier passage, invitations et recopie de preuve passent par le résolveur
 * de la base à chaque fois, exactement comme avant. Une requête dont le jeton
 * prouve une adresse que la base ne tient pas encore pour prouvée y passe aussi :
 * la recopie dépend du JETON, pas seulement de la base.
 */
@Injectable()
export class CachedPrincipalResolver extends PrincipalResolver {
  private readonly memory = new PrincipalMemory(
    PRINCIPAL_MEMORY_CAPACITY,
    PRINCIPAL_MEMORY_LIFETIME_MS,
  );
  private readonly inFlight = new Map<string, InFlightRead>();

  constructor(
    private readonly source: TrackedPrincipalResolver,
    private readonly stamps: PrincipalStampReader,
    private readonly wallClock: WallClock,
  ) {
    super();
  }

  async resolve(token: VerifiedToken): Promise<Principal> {
    // Deux marques de `Server-Timing` (2026-11-05) : le coût de l'estampille,
    // et d'où vient le principal — c'est ce qui distingue une connexion froide
    // d'une mémoire perdue.
    const stamp = await timeServerTiming("stamp", () => this.stamps.read());
    if (stamp === null) {
      noteServerTiming("principal-source", "no-stamp");
      return this.source.resolve(token);
    }
    const miss = this.memory.missReason(token.subject, stamp, this.nowMs());
    const kept = this.memory.take(token.subject, stamp, this.nowMs());
    if (kept !== null && !wouldRecord(kept, token)) {
      noteServerTiming("principal-source", "memory");
      return withToken(kept, token);
    }
    const shared = this.inFlight.get(token.subject);
    if (shared !== undefined && shared.stamp === stamp) {
      noteServerTiming("principal-source", "joined");
      return this.join(shared, token);
    }
    noteServerTiming(
      "principal-source",
      kept === null ? `resolved-${miss ?? "absent"}` : "recorded",
    );
    return this.lead(token, stamp);
  }

  /** Vide la mémoire — le harnais e2e, après un `TRUNCATE` qui ramène l'estampille. */
  forget(): void {
    this.memory.forget();
  }

  /** La lecture partagée : la mienne, rangée sous MON estampille. */
  private async lead(token: VerifiedToken, stamp: bigint): Promise<Principal> {
    const read: InFlightRead = { stamp, done: this.source.resolveTracked(token) };
    this.inFlight.set(token.subject, read);
    try {
      const outcome = await read.done;
      if (!outcome.storable) {
        return outcome.principal;
      }
      const stored = storedPart(outcome.principal);
      this.memory.keep(token.subject, stamp, this.nowMs(), stored);
      return withToken(stored, token);
    } finally {
      if (this.inFlight.get(token.subject) === read) {
        this.inFlight.delete(token.subject);
      }
    }
  }

  /**
   * Attendre la lecture d'une autre requête de la même personne, sous la même
   * estampille. Si elle a écrit, échoué, ou que mon jeton demanderait une
   * recopie, je résous moi-même : le chemin qui écrit reste celui d'avant.
   */
  private async join(shared: InFlightRead, token: VerifiedToken): Promise<Principal> {
    const outcome = await shared.done.catch(() => null);
    if (outcome === null || !outcome.storable) {
      return this.source.resolve(token);
    }
    const stored = storedPart(outcome.principal);
    return wouldRecord(stored, token) ? this.source.resolve(token) : withToken(stored, token);
  }

  private nowMs(): number {
    return this.wallClock.elapsedNow().getTime();
  }
}

/** Le jeton prouve-t-il une adresse que la base ne tient pas encore pour prouvée ? */
function wouldRecord(stored: StoredPrincipal, token: VerifiedToken): boolean {
  return !stored.emailProven && tokenProvesAddress(token, stored.email);
}

/** Le principal rendu : la part gardée, et ce que CE jeton porte. */
function withToken(stored: StoredPrincipal, token: VerifiedToken): Principal {
  return Object.freeze({ ...stored, subject: token.subject, scopes: token.scopes });
}
