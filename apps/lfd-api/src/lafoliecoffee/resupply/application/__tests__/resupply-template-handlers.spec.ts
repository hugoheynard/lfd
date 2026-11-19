import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import type { ResupplyTemplateContent } from "../../domain/resupply-template.js";
import { ResupplySiteUnknownError } from "../../domain/resupply-site-errors.js";
import {
  ResupplyTemplateArchivedError,
  ResupplyTemplateChangedMeanwhileError,
  ResupplyTemplateKeyTakenError,
  ResupplyTemplateNameTakenError,
  ResupplyTemplateNotFoundError,
} from "../../domain/resupply-template-errors.js";
import { AdjustResupplyTemplateCommand } from "../adjust-resupply-template.command.js";
import { AdjustResupplyTemplateHandler } from "../adjust-resupply-template.handler.js";
import { ArchiveResupplyTemplateCommand } from "../archive-resupply-template.command.js";
import { ArchiveResupplyTemplateHandler } from "../archive-resupply-template.handler.js";
import { CreateResupplyTemplateCommand } from "../create-resupply-template.command.js";
import { CreateResupplyTemplateHandler } from "../create-resupply-template.handler.js";
import { ListResupplyTemplatesHandler } from "../list-resupply-templates.handler.js";
import { ListResupplyTemplatesQuery } from "../list-resupply-templates.query.js";
import { Catalogue, Directory, Sites } from "./resupply-doubles.js";
import { CROISSANT, PAIN_AU_CHOCOLAT } from "./resupply-articles.js";
import {
  InMemoryResupplyTemplateReader,
  InMemoryResupplyTemplates,
} from "./resupply-template-doubles.js";

const SITE = "site_village";
const OTHER_SITE = "site_halles";
/** L'instant du banc, figé : aucune règle des modèles ne le compare au calendrier. */
const NOW = new Date("2026-03-10T09:00:00Z");
const CONTENT = {
  name: "Base matin",
  target: "tomorrow" as const,
  lines: [{ sku: "CRO", quantity: 4, saleUnit: "piece" as const }],
};

function world() {
  const clock = new FixedClock(NOW);
  const templates = new InMemoryResupplyTemplates();
  const staff = new Directory({ name: "Lou Martin", role: "counter" });
  const sites = new Sites([SITE, OTHER_SITE]);
  const catalogue = new Catalogue([CROISSANT, PAIN_AU_CHOCOLAT]);
  return {
    templates,
    catalogue,
    create: new CreateResupplyTemplateHandler(templates, sites, staff, clock),
    adjust: new AdjustResupplyTemplateHandler(templates, staff, clock),
    archive: new ArchiveResupplyTemplateHandler(templates, staff, clock),
    list: new ListResupplyTemplatesHandler(
      new InMemoryResupplyTemplateReader(templates),
      catalogue,
    ),
  };
}

const create = (key: string, site = SITE, content: ResupplyTemplateContent = CONTENT) =>
  new CreateResupplyTemplateCommand(site, content, "staff_1", key);

describe("créer un modèle de réassort", () => {
  it("écrit le modèle sous la clé de l'écran, signé et daté", async () => {
    const w = world();
    await expect(w.create.execute(create("k1"))).resolves.toEqual({ id: "k1", version: 1 });
    const row = w.templates.row("k1");
    expect(row?.siteId).toBe(SITE);
    expect(row?.created).toEqual({
      at: NOW,
      author: { staffUserId: "staff_1", name: "Lou Martin", role: "counter" },
    });
  });

  it("rend le modèle déjà écrit quand la même clé est rejouée, sans réécrire", async () => {
    const w = world();
    await w.create.execute(create("k1"));
    await expect(w.create.execute(create("k1"))).resolves.toEqual({ id: "k1", version: 1 });
    expect(w.templates.saves).toBe(1);
  });

  it("refuse une clé déjà prise par le modèle d'un autre point", async () => {
    const w = world();
    await w.create.execute(create("k1"));
    await expect(w.create.execute(create("k1", OTHER_SITE))).rejects.toThrow(
      ResupplyTemplateKeyTakenError,
    );
  });

  it("refuse un point inconnu", async () => {
    const w = world();
    await expect(w.create.execute(create("k1", "site_absent"))).rejects.toThrow(
      ResupplySiteUnknownError,
    );
    expect(w.templates.saves).toBe(0);
  });

  it("refuse un nom déjà porté par un modèle actif du point, quelle que soit la casse", async () => {
    const w = world();
    await w.create.execute(create("k1"));
    await expect(
      w.create.execute(create("k2", SITE, { ...CONTENT, name: "BASE MATIN" })),
    ).rejects.toThrow(ResupplyTemplateNameTakenError);
    await expect(w.create.execute(create("k3", OTHER_SITE))).resolves.toEqual({
      id: "k3",
      version: 1,
    });
  });
});

describe("ajuster et archiver un modèle", () => {
  it("ajuste sous la version lue, puis refuse la version périmée", async () => {
    const w = world();
    await w.create.execute(create("k1"));
    const adjusted = {
      ...CONTENT,
      lines: [{ sku: "PAC", quantity: 2, saleUnit: "piece" as const }],
    };
    await expect(
      w.adjust.execute(new AdjustResupplyTemplateCommand("k1", adjusted, 1, "staff_1")),
    ).resolves.toEqual({ id: "k1", version: 2 });
    expect(w.templates.row("k1")?.content.lines).toEqual(adjusted.lines);
    await expect(
      w.adjust.execute(new AdjustResupplyTemplateCommand("k1", CONTENT, 1, "staff_1")),
    ).rejects.toThrow(ResupplyTemplateChangedMeanwhileError);
  });

  it("refuse d'ajuster un modèle inconnu", async () => {
    const w = world();
    await expect(
      w.adjust.execute(new AdjustResupplyTemplateCommand("absent", CONTENT, 1, "staff_1")),
    ).rejects.toThrow(ResupplyTemplateNotFoundError);
  });

  it("archive une fois, libère le nom, puis refuse d'ajuster ou de réarchiver", async () => {
    const w = world();
    await w.create.execute(create("k1"));
    await w.archive.execute(new ArchiveResupplyTemplateCommand("k1", "staff_1"));
    expect(w.templates.row("k1")?.archived?.at).toEqual(NOW);
    await expect(
      w.archive.execute(new ArchiveResupplyTemplateCommand("k1", "staff_1")),
    ).rejects.toThrow(ResupplyTemplateArchivedError);
    await expect(
      w.adjust.execute(new AdjustResupplyTemplateCommand("k1", CONTENT, 2, "staff_1")),
    ).rejects.toThrow(ResupplyTemplateArchivedError);
    await expect(w.create.execute(create("k2"))).resolves.toEqual({ id: "k2", version: 1 });
  });
});

describe("lire la bibliothèque d'un point", () => {
  it("liste les modèles actifs du point seul, lignes confrontées au catalogue", async () => {
    const w = world();
    const lines = [
      { sku: "CRO", quantity: 4, saleUnit: "piece" as const },
      { sku: "PAC", quantity: 300, saleUnit: "weight" as const },
      { sku: "GONE", quantity: 1, saleUnit: "piece" as const },
    ];
    await w.create.execute(create("k1", SITE, { ...CONTENT, lines }));
    await w.create.execute(create("k2", OTHER_SITE));
    await w.create.execute(create("k3", SITE, { ...CONTENT, name: "Archivé" }));
    await w.archive.execute(new ArchiveResupplyTemplateCommand("k3", "staff_1"));

    const views = await w.list.execute(new ListResupplyTemplatesQuery(SITE));
    expect(views.map((view) => view.id)).toEqual(["k1"]);
    expect(views[0]?.lines).toEqual([
      { sku: "CRO", quantity: 4, saleUnit: "piece", articleName: "Croissant", issue: null },
      {
        sku: "PAC",
        quantity: 300,
        saleUnit: "weight",
        articleName: "Pain au chocolat",
        issue: "sale_unit_changed",
      },
      { sku: "GONE", quantity: 1, saleUnit: "piece", articleName: null, issue: "withdrawn" },
    ]);
    expect(views[0]?.updatedByName).toBe("Lou Martin");
    expect(views[0]?.updatedAt).toBe(NOW.toISOString());
  });

  it("rend une bibliothèque vide pour un point sans modèle", async () => {
    await expect(world().list.execute(new ListResupplyTemplatesQuery(SITE))).resolves.toEqual([]);
  });
});
