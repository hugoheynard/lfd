import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import {
  SitePrincipalLock,
  type LockedPrincipal,
} from "../../../domain/ports/site-principal.lock.js";
import { SiteGesturePublisher } from "../../services/site-gesture.publisher.js";
import { RecordingDurable } from "./durable-doubles.js";

/** Les principaux connus, par site ; un site absent n'a pas de principal. */
export class FixedSitePrincipals extends SitePrincipalLock {
  readonly locked: string[] = [];

  constructor(private readonly principals: ReadonlyMap<string, string> = new Map()) {
    super();
  }

  lockedPrincipalOf(companyId: string): Promise<LockedPrincipal | null> {
    this.locked.push(companyId);
    return Promise.resolve({ principalCompanyId: this.principals.get(companyId) ?? null });
  }
}

/** L'annonce des gestes de site, enregistrée : le verrou lu, les faits écrits. */
export function recordedGestures(principals: ReadonlyMap<string, string> = new Map()): {
  readonly publisher: SiteGesturePublisher;
  readonly durable: RecordingDurable;
  readonly lock: FixedSitePrincipals;
} {
  const durable = new RecordingDurable();
  const lock = new FixedSitePrincipals(principals);
  return {
    publisher: new SiteGesturePublisher(lock, new FixedIdGenerator("g"), durable),
    durable,
    lock,
  };
}

/** Pour les suites qui n'éprouvent pas l'annonce : elle part, personne ne la lit. */
export function silentGestures(): SiteGesturePublisher {
  return recordedGestures().publisher;
}
