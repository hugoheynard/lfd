import type { TrackingUnitOfWork } from "../../../directory/application/__tests__/staff-doubles.js";
import { StaffRoleDefinition, type DirectoryKeeper } from "../../domain/staff-role-definition.js";
import {
  StaffRoleRepository,
  type StaffRoleLoadOptions,
} from "../../domain/staff-role.repository.js";

/**
 * Les rôles en mémoire ; chaque `save` note s'il a eu lieu dans la transaction,
 * chaque `load` s'il a verrouillé, et `memberCount` s'il a compté DEDANS.
 */
export class InMemoryRoles extends StaffRoleRepository {
  readonly saves: boolean[] = [];
  readonly loads: { readonly forUpdate: boolean; readonly insideTransaction: boolean }[] = [];
  readonly counts: boolean[] = [];
  keepers: readonly DirectoryKeeper[] = [];
  private readonly rows = new Map<string, StaffRoleDefinition>();

  constructor(
    private readonly uow: TrackingUnitOfWork,
    private readonly members = 0,
  ) {
    super();
  }

  seed(role: StaffRoleDefinition): void {
    this.rows.set(role.key, role);
  }

  load(key: string, options?: StaffRoleLoadOptions): Promise<StaffRoleDefinition | null> {
    this.loads.push({
      forUpdate: options?.forUpdate === true,
      insideTransaction: this.uow.inside,
    });
    const found = this.rows.get(key);
    return Promise.resolve(
      found === undefined ? null : StaffRoleDefinition.reconstitute(found.toPersistence()),
    );
  }

  save(role: StaffRoleDefinition): Promise<void> {
    this.saves.push(this.uow.inside);
    this.rows.set(role.key, role);
    return Promise.resolve();
  }

  memberCount(): Promise<number> {
    this.counts.push(this.uow.inside);
    return Promise.resolve(this.members);
  }

  directoryKeepers(): Promise<readonly DirectoryKeeper[]> {
    return Promise.resolve(this.keepers);
  }
}
