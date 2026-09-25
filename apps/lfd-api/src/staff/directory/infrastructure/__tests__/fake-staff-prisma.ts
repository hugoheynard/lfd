import {
  legacyRoleSeeds,
  type RoleGrant,
  type StaffOverride,
  type StaffRole,
  type StaffStatus,
  type StaffUserPayload,
} from "@lfd/contracts";
import { Test } from "@nestjs/testing";

import { AppConfig } from "../../../../platform/config/app-config.js";
import { DEFAULT_BOOTSTRAP_ADMIN_EMAIL as BOOTSTRAP_ADMIN_EMAIL } from "../../../../platform/config/bootstrap-admin-email.js";
import { PrismaService } from "../../../../platform/database/prisma.service.js";
import { Clock } from "../../../../platform/time/clock.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { StaffUserRepository } from "../../domain/staff-user.repository.js";
import { PrismaStaffUserRepository } from "../prisma-staff-user.repository.js";

/**
 * Le faux client Prisma des suites du dépôt de l'annuaire, et ses fixtures —
 * partagés par les deux specs plutôt que recopiés.
 */

/** La ligne renvoyée par le fake `findUnique` — l'état complet que `loadTarget` lit. */
export interface Row {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly phone: string;
  readonly jobTitle: string;
  readonly role: StaffRole | null;
  readonly roleKey: string | null;
  readonly roleDefinition: {
    readonly label: string;
    readonly grants: readonly RoleGrant[];
    readonly archivedAt: Date | null;
  } | null;
  readonly status: StaffStatus;
  readonly auth0Id: string | null;
  readonly overrides: readonly StaffOverride[];
}

/** La définition semée d'un rôle du contrat — ce que la migration pose en base. */
export function seededDefinition(key: string): {
  readonly key: string;
  readonly label: string;
  readonly grants: readonly RoleGrant[];
} | null {
  return legacyRoleSeeds().find((seed) => seed.key === key) ?? null;
}

/** Les colonnes de rôle d'une fiche qui porte ce rôle du contrat, définition jointe. */
export function holding(role: StaffRole): Pick<Row, "role" | "roleKey" | "roleDefinition"> {
  const seed = seededDefinition(role);
  return {
    role,
    roleKey: role,
    roleDefinition:
      seed === null ? null : { label: seed.label, grants: seed.grants, archivedAt: null },
  };
}

export interface CreateArgs {
  readonly data: { readonly email: string };
}
export interface DeleteArgs {
  readonly where: { readonly id: string };
}
export interface UpdateArgs {
  readonly where: { readonly id: string };
  readonly data: Record<string, unknown>;
}

/** Une personne ordinaire de l'annuaire, paramétrable au cas par cas. */
export function row(overrides: Partial<Row> = {}): Row {
  return {
    id: "u1",
    firstName: "Camille",
    lastName: "Durand",
    email: "commercial@lafoliedouce.com",
    phone: "",
    jobTitle: "",
    ...holding("commercial"),
    status: "active",
    auth0Id: null,
    overrides: [],
    ...overrides,
  };
}

/** Ce que le fake a vu écrire sur les dérogations, dans l'ordre. */
export interface OverrideWrite {
  readonly op: "create" | "update" | "delete";
  readonly args: Record<string, unknown>;
}

export interface FakePrisma {
  readonly prisma: object;
  readonly deleted: string[];
  readonly created: string[];
  readonly updated: UpdateArgs[];
  readonly overrideWrites: OverrideWrite[];
  /** Les lignes inscrites dans la table des `sub`. */
  readonly aliases: AliasRow[];
}

export interface AliasRow {
  readonly sub: string;
  readonly staffUserId: string;
  readonly source: string;
}

/**
 * Fake Prisma à closures (le backend évite `jest.fn`) : capture les appels.
 * `otherAdmins` simule les AUTRES personnes qui tiennent l'annuaire par leur
 * rôle (`findMany` de `directoryKeepers`). `$queryRaw` rend la définition semée
 * de la clé demandée — la lecture `FOR SHARE` de l'attribution.
 */
export function fakePrisma(found: Row | null, otherAdmins = 1): FakePrisma {
  const deleted: string[] = [];
  const created: string[] = [];
  const updated: UpdateArgs[] = [];
  const overrideWrites: OverrideWrite[] = [];
  const aliases: AliasRow[] = [];
  const record = (op: OverrideWrite["op"]) => (args: Record<string, unknown>) => {
    overrideWrites.push({ op, args });
    return Promise.resolve({});
  };
  const prisma = {
    // La forme TABLEAU : les opérations sont déjà lancées, il suffit de les attendre.
    $transaction: (operations: readonly Promise<unknown>[]): Promise<unknown[]> =>
      Promise.all(operations),
    $queryRaw: (_sql: TemplateStringsArray, key: string): Promise<unknown[]> => {
      const seed = seededDefinition(key);
      return Promise.resolve(seed === null ? [] : [{ ...seed, archived_at: null }]);
    },
    staffUser: {
      findUnique: (): Promise<Row | null> => Promise.resolve(found),
      findMany: (): Promise<Row[]> =>
        Promise.resolve(
          Array.from({ length: otherAdmins }, (_, index) =>
            row({ id: `keeper_${String(index)}`, ...holding("admin") }),
          ),
        ),
      update: (args: UpdateArgs): Promise<Row> => {
        updated.push(args);
        return Promise.resolve(found ?? row());
      },
      delete: (args: DeleteArgs): Promise<Row> => {
        deleted.push(args.where.id);
        return Promise.resolve(found ?? row({ id: args.where.id, email: "" }));
      },
      create: (args: CreateArgs): Promise<{ id: string }> => {
        created.push(args.data.email);
        return Promise.resolve({ id: "created" });
      },
    },
    staffSubjectAlias: {
      createMany: (args: { data: AliasRow }): Promise<{ count: number }> => {
        aliases.push(args.data);
        return Promise.resolve({ count: 1 });
      },
    },
    staffPermissionOverride: {
      create: record("create"),
      update: record("update"),
      delete: record("delete"),
    },
  };
  return { prisma, deleted, created, updated, overrideWrites, aliases };
}

/** L'instant « du jour » que les écritures d'écart doivent porter. */
export const TODAY = new Date("2026-08-12T12:00:00.000Z");

export async function buildRepo(prisma: object): Promise<StaffUserRepository> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      { provide: PrismaService, useValue: prisma },
      {
        provide: AppConfig,
        useValue: { bootstrapAdminEmail: (): string => BOOTSTRAP_ADMIN_EMAIL },
      },
      // Horloge figée : la vue calcule la péremption d'invitation, et un test
      // qui lit l'heure du système finit par échouer un jour précis.
      { provide: Clock, useValue: new FixedClock(TODAY) },
      { provide: StaffUserRepository, useClass: PrismaStaffUserRepository },
    ],
  }).compile();
  return moduleRef.get(StaffUserRepository);
}

/** L'auteur : l'id de SA FICHE d'annuaire, plus son `sub` (plan lot 2). */
export const ACTOR = "staff_moi";

/** La charge d'une édition, sur la base de la fiche `row()`. */
export function payload(over: Partial<StaffUserPayload> = {}): StaffUserPayload {
  return {
    firstName: "Camille",
    lastName: "Durand",
    email: "commercial@lafoliedouce.com",
    phone: "",
    jobTitle: "",
    role: "commercial",
    overrides: [],
    ...over,
  };
}

export const PRICING_WRITE: StaffOverride = {
  resource: "b2b_pricing",
  action: "write",
  effect: "allow",
};
export const GROWTH_READ: StaffOverride = {
  resource: "b2b_growth",
  action: "read",
  effect: "deny",
};
export const ORDERS_READ: StaffOverride = {
  resource: "b2b_orders",
  action: "read",
  effect: "allow",
};
