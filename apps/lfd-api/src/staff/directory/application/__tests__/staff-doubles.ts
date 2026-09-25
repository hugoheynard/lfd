import type {
  StaffMeView,
  StaffStatusChange,
  StaffUserPayload,
  StaffUserView,
} from "@lfd/contracts";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { StaffAccessCache } from "../../../permissions/staff-access-cache.port.js";
import type { OverrideDiff } from "../../domain/override-diff.js";
import type {
  StaffUserCreated,
  StaffUserEdit,
  StaffUserSnapshot,
} from "../../domain/staff-user-state.js";
import {
  StaffUserRepository,
  type StaffIdentityFacts,
} from "../../domain/staff-user.repository.js";

/**
 * Les doubles partagés des handlers de l'équipe.
 *
 * Aucun ne feint une transaction : le rollback ne se prouve que contre un vrai
 * Postgres (`test/staff-journal.e2e-spec.ts`). Ce qu'ils éprouvent est
 * l'ORCHESTRATION — l'écriture et sa trace dans la même unité de travail, le
 * cache oublié après, l'e-mail jamais derrière un échec.
 */

/** Une unité de travail qui exécute, et sait dire si l'on est dedans. */
export class TrackingUnitOfWork extends UnitOfWork {
  private depth = 0;

  get inside(): boolean {
    return this.depth > 0;
  }

  async run<T>(work: () => Promise<T>): Promise<T> {
    this.depth += 1;
    try {
      return await work();
    } finally {
      this.depth -= 1;
    }
  }
}

/** Le cache d'accès : on note chaque oubli, et s'il a eu lieu DANS la transaction. */
export class RecordingAccessCache extends StaffAccessCache {
  readonly forgotten: { readonly insideTransaction: boolean }[] = [];

  constructor(private readonly uow: TrackingUnitOfWork) {
    super();
  }

  forgetAll(): void {
    this.forgotten.push({ insideTransaction: this.uow.inside });
  }
}

/** Un appel au dépôt que le test n'attendait pas. */
class UnexpectedCall extends Error {
  constructor(method: string) {
    super(`StaffUserRepository.${method} n'aurait pas dû être appelé`);
  }
}

export const CECILE: StaffUserSnapshot = {
  id: "s1",
  firstName: "Cécile",
  lastName: "Martin",
  email: "cecile@lfc.test",
  phone: "",
  jobTitle: "",
  role: "commercial",
  status: "active",
  auth0Id: "auth0|cecile",
};

const NO_OVERRIDE_CHANGE: OverrideDiff = { added: [], removed: [], changed: [] };

/**
 * Un dépôt scénarisé : il rend l'état qu'on lui donne, et note chaque écriture
 * avec l'état de la transaction au moment de l'appel.
 */
export class ScriptedStaffUsers extends StaffUserRepository {
  readonly writes: { readonly method: string; readonly insideTransaction: boolean }[] = [];
  /** Ce que `update` rend ; par défaut, une édition vide. */
  edit: StaffUserEdit;

  constructor(
    private readonly uow: TrackingUnitOfWork,
    readonly snapshot: StaffUserSnapshot = CECILE,
  ) {
    super();
    const { id: _id, status: _status, auth0Id: _auth0Id, ...identity } = snapshot;
    this.edit = {
      before: snapshot,
      after: identity,
      overrides: NO_OVERRIDE_CHANGE,
      roleLabels: { before: "Commercial", after: "Commercial" },
    };
  }

  private note(method: string): void {
    this.writes.push({ method, insideTransaction: this.uow.inside });
  }

  create(_payload: StaffUserPayload, _actorId: string): Promise<StaffUserCreated> {
    this.note("create");
    return Promise.resolve({ id: this.snapshot.id, roleLabel: "Commercial" });
  }

  update(_id: string, _payload: StaffUserPayload, _actorId: string): Promise<StaffUserEdit> {
    this.note("update");
    return Promise.resolve(this.edit);
  }

  setStatus(_id: string, _change: StaffStatusChange, _actorId: string): Promise<StaffUserSnapshot> {
    this.note("setStatus");
    return Promise.resolve(this.snapshot);
  }

  markInvited(_id: string, _subject: string, _invitedAt: Date): Promise<void> {
    this.note("markInvited");
    return Promise.resolve();
  }

  identityOf(_id: string): Promise<StaffIdentityFacts> {
    return Promise.resolve(this.snapshot);
  }

  list(): Promise<readonly StaffUserView[]> {
    return Promise.reject(new UnexpectedCall("list"));
  }

  me(_id: string): Promise<StaffMeView> {
    return Promise.reject(new UnexpectedCall("me"));
  }

  ensureBootstrapAdmin(): Promise<void> {
    return Promise.reject(new UnexpectedCall("ensureBootstrapAdmin"));
  }
}
