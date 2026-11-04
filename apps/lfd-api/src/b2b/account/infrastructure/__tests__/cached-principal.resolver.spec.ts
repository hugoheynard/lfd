import { UnauthorizedException } from "@nestjs/common";

import type { Principal, VerifiedToken } from "../../../../platform/auth/principal.js";
import { FixedWallClock } from "../../../../platform/time/fixed-wall-clock.js";
import { PrincipalStampReader } from "../../domain/ports/principal-stamp.reader.js";
import {
  CachedPrincipalResolver,
  PRINCIPAL_MEMORY_LIFETIME_MS,
} from "../cached-principal.resolver.js";
import {
  TrackedPrincipalResolver,
  type PrincipalResolution,
} from "../tracked-principal.resolver.js";

const token: VerifiedToken = { subject: "auth0|jean", scopes: ["read:orders"] };

function principalOf(userId: string, emailProven = true): Principal {
  return {
    subject: "auth0|jean",
    userId,
    email: "jean@client.fr",
    emailProven,
    memberships: [{ companyId: "company_1", role: "orders" }],
    reachableCompanyIds: ["site_1"],
    scopes: ["read:orders"],
  };
}

/** L'estampille, qu'on fait monter à la main et qui retient l'ordre des appels. */
class ManualStamp extends PrincipalStampReader {
  value: bigint | null = 1n;

  constructor(private readonly journal: string[]) {
    super();
  }

  read(): Promise<bigint | null> {
    this.journal.push("stamp");
    return Promise.resolve(this.value);
  }
}

/** Le résolveur de la base, doublé : compte ses lectures, rend ce qu'on lui dit. */
class ScriptedSource extends TrackedPrincipalResolver {
  reads = 0;
  storable = true;
  principal = principalOf("user_1");
  failure: Error | null = null;
  /** Retenue à la main pour éprouver les lectures simultanées. */
  gate: Promise<void> | null = null;
  /** Ce qu'on fait pendant la lecture, avant qu'elle rende (une écriture concurrente). */
  during: (() => void) | null = null;

  constructor(private readonly journal: string[]) {
    super();
  }

  async resolve(tokenToResolve: VerifiedToken): Promise<Principal> {
    return (await this.resolveTracked(tokenToResolve)).principal;
  }

  async resolveTracked(tokenToResolve: VerifiedToken): Promise<PrincipalResolution> {
    this.reads += 1;
    this.journal.push("principal");
    const principal = { ...this.principal, scopes: tokenToResolve.scopes };
    this.during?.();
    if (this.gate !== null) {
      await this.gate;
    }
    if (this.failure !== null) {
      throw this.failure;
    }
    return { principal, storable: this.storable };
  }
}

function setup(): {
  journal: string[];
  stamp: ManualStamp;
  source: ScriptedSource;
  clock: FixedWallClock;
  cached: CachedPrincipalResolver;
} {
  const journal: string[] = [];
  const stamp = new ManualStamp(journal);
  const source = new ScriptedSource(journal);
  const clock = new FixedWallClock(new Date(0));
  return {
    journal,
    stamp,
    source,
    clock,
    cached: new CachedPrincipalResolver(source, stamp, clock),
  };
}

describe("CachedPrincipalResolver", () => {
  it("garde le principal tant que l'estampille ne bouge pas", async () => {
    const { source, cached } = setup();
    await cached.resolve(token);
    await cached.resolve(token);
    expect(source.reads).toBe(1);
  });

  it("relit dès que l'estampille bouge", async () => {
    const { source, stamp, cached } = setup();
    await cached.resolve(token);
    stamp.value = 2n;
    source.principal = principalOf("user_2");
    expect((await cached.resolve(token)).userId).toBe("user_2");
    expect(source.reads).toBe(2);
  });

  it("ne garde jamais un chemin qui a écrit", async () => {
    const { source, cached } = setup();
    source.storable = false;
    await cached.resolve(token);
    await cached.resolve(token);
    expect(source.reads).toBe(2);
  });

  it("ne garde rien quand l'estampille manque", async () => {
    const { source, stamp, cached } = setup();
    stamp.value = null;
    await cached.resolve(token);
    await cached.resolve(token);
    expect(source.reads).toBe(2);
  });

  it("relit après le filet de durée, même sans mouvement", async () => {
    const { source, clock, cached } = setup();
    await cached.resolve(token);
    clock.advanceMs(PRINCIPAL_MEMORY_LIFETIME_MS);
    await cached.resolve(token);
    expect(source.reads).toBe(2);
  });

  it("lit l'estampille AVANT le principal, et range sous celle lue avant", async () => {
    const { journal, source, stamp, cached } = setup();
    // Une écriture validée PENDANT la lecture du principal : le principal lu
    // peut dater d'avant elle, il ne doit pas se ranger sous le numéro d'après.
    source.during = () => {
      stamp.value = 2n;
    };
    await cached.resolve(token);
    source.during = null;
    await cached.resolve(token);
    expect(journal).toEqual(["stamp", "principal", "stamp", "principal"]);
  });

  it("reprend `subject` et `scopes` du jeton, jamais de la mémoire", async () => {
    const { cached } = setup();
    await cached.resolve(token);
    const second = await cached.resolve({ subject: "auth0|jean", scopes: ["write:orders"] });
    expect(second.scopes).toEqual(["write:orders"]);
  });

  it("rend un principal figé, tableaux compris", async () => {
    const { cached } = setup();
    await cached.resolve(token);
    const kept = await cached.resolve(token);
    expect(Object.isFrozen(kept)).toBe(true);
    expect(Object.isFrozen(kept.memberships)).toBe(true);
    expect(Object.isFrozen(kept.memberships[0])).toBe(true);
    expect(Object.isFrozen(kept.reachableCompanyIds)).toBe(true);
  });

  it("repasse par la base quand le jeton prouve une adresse encore non prouvée", async () => {
    const { source, cached } = setup();
    source.principal = principalOf("user_1", false);
    await cached.resolve(token);
    await cached.resolve({ ...token, email: "jean@client.fr", emailVerified: true });
    expect(source.reads).toBe(2);
  });

  it("une seule lecture pour les requêtes simultanées d'une personne", async () => {
    const { source, cached } = setup();
    let open: () => void = () => undefined;
    source.gate = new Promise((resolve) => {
      open = resolve;
    });
    const all = Promise.all(Array.from({ length: 11 }, () => cached.resolve(token)));
    open();
    const principals = await all;
    expect(source.reads).toBe(1);
    expect(new Set(principals.map((principal) => principal.userId))).toEqual(new Set(["user_1"]));
  });

  it("la lecture partagée garde l'estampille de celle qui lit", async () => {
    const { source, stamp, cached } = setup();
    let open: () => void = () => undefined;
    source.gate = new Promise((resolve) => {
      open = resolve;
    });
    const first = cached.resolve(token);
    await Promise.resolve();
    // Une écriture validée entre les deux : la seconde requête ne rejoint pas
    // une lecture partie sous l'ancien numéro, elle lit elle-même.
    stamp.value = 2n;
    const second = cached.resolve(token);
    open();
    await Promise.all([first, second]);
    expect(source.reads).toBe(2);
    source.gate = null;
    await cached.resolve(token);
    expect(source.reads).toBe(2);
  });

  it("celles qui attendent une lecture qui a écrit résolvent elles-mêmes", async () => {
    const { source, cached } = setup();
    source.storable = false;
    await Promise.all([cached.resolve(token), cached.resolve(token)]);
    expect(source.reads).toBe(2);
  });

  it("un refus n'est jamais gardé", async () => {
    const { source, cached } = setup();
    source.failure = new UnauthorizedException("Compte non actif.");
    await expect(cached.resolve(token)).rejects.toThrow("Compte non actif.");
    source.failure = null;
    await cached.resolve(token);
    expect(source.reads).toBe(2);
  });

  it("`forget()` vide la mémoire", async () => {
    const { source, cached } = setup();
    await cached.resolve(token);
    cached.forget();
    await cached.resolve(token);
    expect(source.reads).toBe(2);
  });
});
