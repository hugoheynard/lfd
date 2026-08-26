import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../infra/database/pim-prisma.service.js";
import { Location, type LocationSnapshot } from "../domain/entities/location.js";
import { LocationInUseError, LocationNameTakenError } from "../domain/errors/locations-errors.js";
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
  eatIn: boolean;
  baseUrl: string;
  tables: TableRow[];
}

function toLocation(row: LocationRow): Location {
  return Location.reconstitute({
    id: row.id,
    name: row.name,
    clickCollect: row.clickCollect,
    eatIn: row.eatIn,
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
          eatIn: snapshot.eatIn,
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
   *
   * Mais elle n'est réécrite QUE si l'agrégat l'a touchée. Elle l'était à
   * chaque enregistrement : renommer un emplacement effaçait puis recréait ses
   * lignes — **jetons de QR compris**. La survie d'un secret déjà imprimé
   * reposait donc sur une recopie en mémoire, refaite pour rien. Un renommage
   * ne touche plus au papier collé sur les tables.
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
            eatIn: snapshot.eatIn,
            baseUrl: snapshot.baseUrl,
          },
        }),
        ...(location.tablesChanged ? this.tableOperations(snapshot) : []),
      ]),
    );
  }

  /** Efface puis réécrit la grille — appelé seulement quand elle a bougé. */
  private tableOperations(snapshot: LocationSnapshot) {
    return [
      this.prisma.locationTable.deleteMany({ where: { locationId: snapshot.id } }),
      this.prisma.locationTable.createMany({ data: tableRows(snapshot.id, snapshot.tables) }),
    ];
  }

  /**
   * Le **dernier mot** sur « un emplacement cité ne disparaît pas ».
   *
   * Le mur est la clé étrangère `Restrict` de `category_location_ref` — pas
   * une lecture préalable. Une lecture ne tient rien : entre le compte et la
   * suppression, une grille peut se mettre à citer l'emplacement, et la
   * famille se retrouve à pointer un point de vente disparu.
   *
   * **Sans recompter.** La suppression part dans la transaction du handler ;
   * une fois l'ordre en échec, Postgres a avorté la transaction et toute
   * requête suivante échoue à son tour. Compter ici pour enrichir le message
   * transformait donc le refus métier en 500. L'écran affiche déjà le compte
   * à côté de chaque ligne.
   */
  async remove(id: string): Promise<void> {
    try {
      await this.prisma.location.delete({ where: { id } });
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new LocationInUseError(id);
      }
      throw error;
    }
  }
}

/** Violation de clé étrangère Prisma — le `23503` de Postgres, vu depuis l'ORM. */
function isForeignKeyViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2003";
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
