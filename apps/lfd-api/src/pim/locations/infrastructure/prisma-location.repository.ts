import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../infra/database/pim-prisma.service.js";
import { Location } from "../domain/entities/location.js";
import { LocationNameTakenError } from "../domain/errors/locations-errors.js";
import { LocationRepository } from "../domain/ports/location.repository.js";
import { violatedConstraint } from "../../catalogue/shared/infrastructure/json-readers.js";
import type { TableState } from "../domain/value-objects/table.js";

interface TableRow {
  number: number;
  qrCreated: boolean;
  token: string | null;
}

interface LocationRow {
  id: string;
  name: string;
  clickCollect: boolean;
  surPlace: boolean;
  baseUrl: string;
  tables: TableRow[];
}

function toLocation(row: LocationRow): Location {
  return Location.reconstitute({
    id: row.id,
    name: row.name,
    clickCollect: row.clickCollect,
    surPlace: row.surPlace,
    baseUrl: row.baseUrl,
    tables: row.tables.map((table) => ({
      number: table.number,
      qrCreated: table.qrCreated,
      token: table.token,
    })),
  });
}

function tableRows(id: string, tables: readonly TableState[]) {
  return tables.map((table) => ({
    locationId: id,
    number: table.number,
    qrCreated: table.qrCreated,
    token: table.token,
  }));
}

const WITH_TABLES = { tables: { orderBy: { number: "asc" } } } as const;

@Injectable()
export class PrismaLocationRepository extends LocationRepository {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async listAll(): Promise<Location[]> {
    const rows = await this.prisma.location.findMany({
      orderBy: [{ name: "asc" }],
      include: WITH_TABLES,
    });
    return rows.map(toLocation);
  }

  async findById(id: string): Promise<Location | null> {
    const row = await this.prisma.location.findUnique({
      where: { id },
      include: WITH_TABLES,
    });
    return row === null ? null : toLocation(row);
  }

  async add(location: Location): Promise<void> {
    const snapshot = location.snapshot();
    await guardName(snapshot.name, () =>
      this.prisma.location.create({
        data: {
          id: snapshot.id,
          name: snapshot.name,
          clickCollect: snapshot.clickCollect,
          surPlace: snapshot.surPlace,
          baseUrl: snapshot.baseUrl,
          tables: {
            create: snapshot.tables.map((table) => ({
              number: table.number,
              qrCreated: table.qrCreated,
              token: table.token,
            })),
          },
        },
      }),
    );
  }

  /**
   * L'état entier, **en une transaction** : les champs et la grille de tables.
   *
   * C'était deux écritures indépendantes, et c'est ce qui rendait l'invariant
   * cassable — entre les deux, un emplacement fermé en salle gardait ses
   * tables, donc des QR imprimés qui menaient quelque part. Ici, ou tout passe
   * ou rien ne passe.
   *
   * La grille est remplacée plutôt que rapprochée ligne à ligne : elle tient en
   * quelques centaines de lignes au plus (`MAX_TABLES`), et un diff coûterait
   * plus en complexité qu'il ne gagne en écritures.
   */
  async save(location: Location): Promise<void> {
    const snapshot = location.snapshot();
    await guardName(snapshot.name, () =>
      this.prisma.$transaction([
        this.prisma.location.update({
          where: { id: snapshot.id },
          data: {
            name: snapshot.name,
            clickCollect: snapshot.clickCollect,
            surPlace: snapshot.surPlace,
            baseUrl: snapshot.baseUrl,
          },
        }),
        this.prisma.locationTable.deleteMany({ where: { locationId: snapshot.id } }),
        this.prisma.locationTable.createMany({
          data: tableRows(snapshot.id, snapshot.tables),
        }),
      ]),
    );
  }

  async remove(id: string): Promise<void> {
    await this.prisma.location.delete({ where: { id } });
  }
}

/**
 * Traduit la violation de `emplacement_name_unique` en refus métier.
 *
 * L'index porte sur `lower(name)` — la même comparaison que la lecture du
 * dépôt. Sans ça, « Village » et « village » seraient deux emplacements pour la
 * base et un seul pour qui lit l'écran.
 */
async function guardName<T>(name: string, write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (violatedConstraint(error) === "emplacement_name_unique") {
      throw new LocationNameTakenError(name);
    }
    throw error;
  }
}
