import type { Principal } from "../../../platform/auth/principal.js";

/**
 * Ce qu'on garde d'un principal : tout, sauf ce que le jeton porte. `subject`
 * et `scopes` sont repris du jeton à chaque requête — la mémoire ne remplace
 * jamais le jeton.
 */
export type StoredPrincipal = Omit<Principal, "subject" | "scopes">;

interface KeptPrincipal {
  readonly stamp: bigint;
  readonly storedAtMs: number;
  readonly principal: StoredPrincipal;
}

/**
 * **La mémoire des principaux**, par `sub` : bornée (la moins récemment lue
 * sort la première), et un filet de durée qui ne sert pas à la justesse — la
 * justesse, c'est l'estampille
 * (`documentation/caching-usage/plan-principal-en-memoire.md`, §2, §3 bis).
 *
 * Pure : l'heure lui est donnée, elle ne la lit pas.
 */
export class PrincipalMemory {
  private readonly entries = new Map<string, KeptPrincipal>();

  constructor(
    private readonly capacity: number,
    private readonly lifetimeMs: number,
  ) {}

  /** Le principal gardé sous CETTE estampille et encore dans sa durée, ou `null`. */
  take(subject: string, stamp: bigint, nowMs: number): StoredPrincipal | null {
    const kept = this.entries.get(subject);
    if (kept === undefined) {
      return null;
    }
    this.entries.delete(subject);
    if (kept.stamp !== stamp || nowMs - kept.storedAtMs >= this.lifetimeMs) {
      return null;
    }
    // Remis en queue : la Map garde l'ordre d'insertion, la tête est la plus ancienne.
    this.entries.set(subject, kept);
    return kept.principal;
  }

  /**
   * Range `principal` sous l'estampille lue AVANT de le lire. Une lecture
   * plus ancienne qui finit après une plus récente ne l'écrase pas.
   */
  keep(subject: string, stamp: bigint, nowMs: number, principal: StoredPrincipal): void {
    const current = this.entries.get(subject);
    if (current !== undefined && current.stamp > stamp) {
      return;
    }
    this.entries.delete(subject);
    this.entries.set(subject, { stamp, storedAtMs: nowMs, principal });
    while (this.entries.size > this.capacity) {
      const oldest = this.entries.keys().next();
      if (oldest.done === true) {
        return;
      }
      this.entries.delete(oldest.value);
    }
  }

  forget(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}

/**
 * La part gardée d'un principal, **figée en profondeur** : elle est partagée
 * entre requêtes, et une écriture par l'une se lirait dans toutes.
 */
export function storedPart(principal: Principal): StoredPrincipal {
  return Object.freeze({
    userId: principal.userId,
    email: principal.email,
    emailProven: principal.emailProven,
    memberships: Object.freeze(
      principal.memberships.map(({ companyId, role }) => Object.freeze({ companyId, role })),
    ),
    reachableCompanyIds: Object.freeze([...principal.reachableCompanyIds]),
  });
}
