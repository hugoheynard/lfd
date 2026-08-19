import { PimIdGenerator } from "../../../infra/id/pim-id-generator.js";
import {
  EmplacementNameRequiredError,
  EmplacementTableNotFoundError,
} from "../../domain/errors/locations-errors.js";
import {
  EmplacementRepository,
  type EmplacementFields,
  type EmplacementRecord,
  type NewEmplacement,
} from "../../domain/ports/emplacement.repository.js";
import { TableTokenGenerator } from "../../domain/ports/table-token-generator.js";
import type { TableState } from "../../domain/value-objects/table.js";
import { CreateEmplacementCommand, CreateEmplacementHandler } from "../create-emplacement.js";
import { DeleteEmplacementCommand, DeleteEmplacementHandler } from "../delete-emplacement.js";
import { GenerateTableQrCommand, GenerateTableQrHandler } from "../generate-table-qr.js";
import { UpdateEmplacementCommand, UpdateEmplacementHandler } from "../update-emplacement.js";

class InMemoryEmplacements extends EmplacementRepository {
  readonly rows: EmplacementRecord[] = [];

  listAll(): Promise<EmplacementRecord[]> {
    return Promise.resolve([...this.rows]);
  }
  findById(id: string): Promise<EmplacementRecord | null> {
    return Promise.resolve(this.rows.find((r) => r.id === id) ?? null);
  }
  insert(emplacement: NewEmplacement): Promise<void> {
    this.rows.push({ ...emplacement, tables: [...emplacement.tables] });
    return Promise.resolve();
  }
  updateFields(id: string, fields: EmplacementFields): Promise<void> {
    this.mutate(id, (row) => ({ ...row, ...fields }));
    return Promise.resolve();
  }
  replaceTables(id: string, tables: readonly TableState[]): Promise<void> {
    this.mutate(id, (row) => ({ ...row, tables: [...tables] }));
    return Promise.resolve();
  }
  setTableQr(
    id: string,
    tableNumber: number,
    qrCreated: boolean,
    token: string | null,
  ): Promise<void> {
    this.mutate(id, (row) => ({
      ...row,
      tables: row.tables.map((t) => (t.number === tableNumber ? { ...t, qrCreated, token } : t)),
    }));
    return Promise.resolve();
  }
  remove(id: string): Promise<void> {
    const index = this.rows.findIndex((r) => r.id === id);
    if (index >= 0) {
      this.rows.splice(index, 1);
    }
    return Promise.resolve();
  }

  private mutate(id: string, map: (row: EmplacementRecord) => EmplacementRecord): void {
    const index = this.rows.findIndex((r) => r.id === id);
    if (index >= 0) {
      this.rows[index] = map(this.rows[index]!);
    }
  }
}

class StubIds extends PimIdGenerator {
  next(): string {
    return "emp_fixed";
  }
}

class StubTokens extends TableTokenGenerator {
  next(): string {
    return "tok_fixed";
  }
}

function createSurPlace(repo: InMemoryEmplacements, tableCount: number) {
  return new CreateEmplacementHandler(repo, new StubIds()).execute(
    new CreateEmplacementCommand({
      name: "Boutique",
      clickCollect: true,
      surPlace: true,
      baseUrl: "https://order.example",
      tableCount,
    }),
  );
}

describe("CreateEmplacementHandler", () => {
  it("ouvre une grille de tables quand il fait sur place", async () => {
    const repo = new InMemoryEmplacements();
    const id = await createSurPlace(repo, 3);

    expect(id).toBe("emp_fixed");
    expect(repo.rows[0]?.tables.map((t) => t.number)).toEqual([1, 2, 3]);
  });

  it("ne crée aucune table quand il ne fait pas sur place", async () => {
    const repo = new InMemoryEmplacements();
    await new CreateEmplacementHandler(repo, new StubIds()).execute(
      new CreateEmplacementCommand({
        name: "En ligne",
        clickCollect: true,
        surPlace: false,
        baseUrl: "",
        tableCount: 5,
      }),
    );

    expect(repo.rows[0]?.tables).toEqual([]);
  });

  it("refuse un nom vide", async () => {
    const repo = new InMemoryEmplacements();
    await expect(
      new CreateEmplacementHandler(repo, new StubIds()).execute(
        new CreateEmplacementCommand({
          name: "   ",
          clickCollect: true,
          surPlace: false,
          baseUrl: "",
          tableCount: 0,
        }),
      ),
    ).rejects.toBeInstanceOf(EmplacementNameRequiredError);
  });
});

describe("UpdateEmplacementHandler", () => {
  it("re-synchronise les tables en gardant l’état QR existant", async () => {
    const repo = new InMemoryEmplacements();
    await createSurPlace(repo, 3);
    await new GenerateTableQrHandler(repo, new StubTokens()).execute(
      new GenerateTableQrCommand("emp_fixed", 2),
    );

    await new UpdateEmplacementHandler(repo).execute(
      new UpdateEmplacementCommand("emp_fixed", { tableCount: 4 }),
    );

    const tables = repo.rows[0]?.tables ?? [];
    expect(tables.map((t) => t.number)).toEqual([1, 2, 3, 4]);
    expect(tables.find((t) => t.number === 2)?.token).toBe("tok_fixed");
    expect(tables.find((t) => t.number === 4)?.qrCreated).toBe(false);
  });

  it("vide les tables quand on coupe le sur place", async () => {
    const repo = new InMemoryEmplacements();
    await createSurPlace(repo, 2);

    await new UpdateEmplacementHandler(repo).execute(
      new UpdateEmplacementCommand("emp_fixed", { surPlace: false }),
    );

    expect(repo.rows[0]?.tables).toEqual([]);
  });
});

describe("GenerateTableQrHandler", () => {
  it("pose un token neuf sur la table", async () => {
    const repo = new InMemoryEmplacements();
    await createSurPlace(repo, 2);

    const token = await new GenerateTableQrHandler(repo, new StubTokens()).execute(
      new GenerateTableQrCommand("emp_fixed", 1),
    );

    expect(token).toBe("tok_fixed");
    expect(repo.rows[0]?.tables[0]?.qrCreated).toBe(true);
  });

  it("refuse une table inexistante", async () => {
    const repo = new InMemoryEmplacements();
    await createSurPlace(repo, 1);

    await expect(
      new GenerateTableQrHandler(repo, new StubTokens()).execute(
        new GenerateTableQrCommand("emp_fixed", 9),
      ),
    ).rejects.toBeInstanceOf(EmplacementTableNotFoundError);
  });
});

describe("DeleteEmplacementHandler", () => {
  it("supprime l’emplacement", async () => {
    const repo = new InMemoryEmplacements();
    await createSurPlace(repo, 1);

    await new DeleteEmplacementHandler(repo).execute(new DeleteEmplacementCommand("emp_fixed"));

    expect(repo.rows).toEqual([]);
  });
});
