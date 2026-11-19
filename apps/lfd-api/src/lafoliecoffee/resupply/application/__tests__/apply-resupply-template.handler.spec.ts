import { randomUUID } from "node:crypto";

import type { ResupplyTemplateApplyMode } from "@lfd/contracts";

import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { inMemoryIntents } from "../../../../platform/intent/__tests__/in-memory-gesture-intent.ledger.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { ResupplyTemplate } from "../../domain/resupply-template.js";
import {
  ResupplyTemplateArchivedError,
  ResupplyTemplateNotFoundError,
} from "../../domain/resupply-template-errors.js";
import { AddSiteResupplyLineCommand } from "../add-site-resupply-line.command.js";
import { ApplyResupplyTemplateCommand } from "../apply-resupply-template.command.js";
import { ApplyResupplyTemplateHandler } from "../apply-resupply-template.handler.js";
import { NameSiteResupplyCommand } from "../name-site-resupply.command.js";
import { NameSiteResupplyHandler } from "../name-site-resupply.handler.js";
import { SendSiteResupplyCommand } from "../send-site-resupply.command.js";
import { Catalogue, Sites } from "./resupply-doubles.js";
import { CROISSANT, PAIN_AU_CHOCOLAT, SALMON } from "./resupply-articles.js";
import { InMemoryResupplyTemplates } from "./resupply-template-doubles.js";
import { LABO, NOW, setup, versionOf, VILLAGE } from "./site-resupply-draft-bench.js";

const AUTHOR = { staffUserId: "staff_1", name: "Lou Martin", role: "counter" };
const TRACE = { at: NOW, author: AUTHOR };
const TEMPLATE_ID = "tpl_base";

function world() {
  const bench = setup();
  const templates = new InMemoryResupplyTemplates();
  const catalogue = new Catalogue([CROISSANT, PAIN_AU_CHOCOLAT, SALMON]);
  const clock = new FixedClock(NOW);
  const ids = new FixedIdGenerator("applied");
  const apply = new ApplyResupplyTemplateHandler(
    bench.store,
    templates,
    catalogue,
    new Sites([VILLAGE, LABO]),
    clock,
    ids,
    new DirectUnitOfWork(),
    inMemoryIntents(),
  );
  const name = new NameSiteResupplyHandler(bench.store, new Sites([VILLAGE]), clock, ids);
  return { ...bench, templates, catalogue, apply, name };
}

async function seedTemplate(
  templates: InMemoryResupplyTemplates,
  lines: readonly { readonly sku: string; readonly quantity: number }[],
  input: { readonly siteId?: string; readonly archived?: boolean } = {},
): Promise<void> {
  const template = ResupplyTemplate.create({
    id: TEMPLATE_ID,
    siteId: input.siteId ?? VILLAGE,
    content: {
      name: "Base matin",
      target: "tomorrow",
      lines: lines.map((line) => ({ ...line, saleUnit: "piece" as const })),
    },
    trace: TRACE,
  });
  await templates.save(template);
  if (input.archived === true) {
    const saved = await templates.load(TEMPLATE_ID);
    saved?.archive(TRACE);
    if (saved !== null) {
      await templates.save(saved);
    }
  }
}

const applyCommand = (mode: ResupplyTemplateApplyMode, key = randomUUID()) =>
  new ApplyResupplyTemplateCommand(VILLAGE, "tomorrow", TEMPLATE_ID, mode, "staff_1", key);

const addCommand = (sku: string, quantity: number) =>
  new AddSiteResupplyLineCommand(VILLAGE, "tomorrow", sku, quantity, "staff_1", randomUUID());

function linesOf(w: ReturnType<typeof world>, id: string): readonly (string | number)[][] {
  const row = w.store.all().find((candidate) => candidate.id === id);
  return (row?.lines ?? []).map((line) => [line.sku, line.quantity]);
}

describe("appliquer un modèle à la demande en cours", () => {
  it("ouvre la demande au besoin, y pose les lignes du modèle et lui donne son nom", async () => {
    const w = world();
    await seedTemplate(w.templates, [
      { sku: "CRO", quantity: 12 },
      { sku: "PAC", quantity: 6 },
    ]);

    const result = await w.apply.execute(applyCommand("add"));

    expect(result.skipped).toEqual([]);
    expect(linesOf(w, result.resupplyId)).toEqual([
      ["CRO", 12],
      ["PAC", 6],
    ]);
    expect(w.store.all()[0]).toMatchObject({ name: "Base matin", placed: null });
  });

  it("replace : retire les articles absents du modèle et pose ses quantités sur les autres", async () => {
    const w = world();
    await w.add.execute(addCommand("CRO", 3));
    await w.add.execute(addCommand("SAU", 500));
    await seedTemplate(w.templates, [
      { sku: "CRO", quantity: 12 },
      { sku: "PAC", quantity: 6 },
    ]);

    const result = await w.apply.execute(applyCommand("replace"));

    expect(w.store.all()).toHaveLength(1);
    expect(linesOf(w, result.resupplyId)).toEqual([
      ["CRO", 12],
      ["PAC", 6],
    ]);
  });

  it("add : les quantités du modèle s'additionnent à celles de la demande", async () => {
    const w = world();
    await w.add.execute(addCommand("CRO", 3));
    await seedTemplate(w.templates, [
      { sku: "CRO", quantity: 12 },
      { sku: "PAC", quantity: 6 },
    ]);

    const result = await w.apply.execute(applyCommand("add"));

    expect(linesOf(w, result.resupplyId)).toEqual([
      ["CRO", 15],
      ["PAC", 6],
    ]);
  });

  it("la même clé rejouée en add rend la même réponse sans additionner deux fois", async () => {
    const w = world();
    await seedTemplate(w.templates, [{ sku: "CRO", quantity: 12 }]);
    const key = randomUUID();

    const first = await w.apply.execute(applyCommand("add", key));
    const replay = await w.apply.execute(applyCommand("add", key));

    expect(replay).toEqual(first);
    expect(linesOf(w, first.resupplyId)).toEqual([["CRO", 12]]);
  });

  it("écarte et rend une ligne retirée du catalogue ou dont l'unité a changé", async () => {
    const w = world();
    await seedTemplate(w.templates, [
      { sku: "CRO", quantity: 12 },
      { sku: "PAC", quantity: 6 },
      { sku: "SAU", quantity: 2 },
    ]);
    w.catalogue.withdraw("PAC");
    // SAU est vendu au poids : la ligne du modèle, en pièces, ne s'applique plus.

    const result = await w.apply.execute(applyCommand("add"));

    expect(result.skipped).toEqual([
      { sku: "PAC", reason: "withdrawn" },
      { sku: "SAU", reason: "sale_unit_changed" },
    ]);
    expect(linesOf(w, result.resupplyId)).toEqual([["CRO", 12]]);
  });

  it("un modèle archivé est refusé, et la demande n'est pas ouverte", async () => {
    const w = world();
    await seedTemplate(w.templates, [{ sku: "CRO", quantity: 12 }], { archived: true });

    await expect(w.apply.execute(applyCommand("add"))).rejects.toBeInstanceOf(
      ResupplyTemplateArchivedError,
    );
    expect(w.store.all()).toEqual([]);
  });

  it("un modèle d'un autre point est introuvable", async () => {
    const w = world();
    await seedTemplate(w.templates, [{ sku: "CRO", quantity: 12 }], { siteId: LABO });

    await expect(w.apply.execute(applyCommand("add"))).rejects.toBeInstanceOf(
      ResupplyTemplateNotFoundError,
    );
  });

  it("un modèle inconnu est introuvable", async () => {
    const w = world();

    await expect(w.apply.execute(applyCommand("replace"))).rejects.toBeInstanceOf(
      ResupplyTemplateNotFoundError,
    );
  });

  it("une demande déjà nommée garde son nom", async () => {
    const w = world();
    await w.name.execute(new NameSiteResupplyCommand(VILLAGE, "tomorrow", "Vitrine du soir"));
    await seedTemplate(w.templates, [{ sku: "CRO", quantity: 12 }]);

    await w.apply.execute(applyCommand("add"));

    expect(w.store.all()[0]?.name).toBe("Vitrine du soir");
  });

  it("un réassort envoyé n'est jamais touché : le modèle remplit une nouvelle demande", async () => {
    const w = world();
    const sent = await w.add.execute(addCommand("CRO", 3));
    await w.send.execute(
      new SendSiteResupplyCommand(VILLAGE, sent, versionOf(w.store, sent), "staff_1"),
    );
    await seedTemplate(w.templates, [{ sku: "CRO", quantity: 12 }]);

    const result = await w.apply.execute(applyCommand("replace"));

    expect(result.resupplyId).not.toBe(sent);
    expect(linesOf(w, sent)).toEqual([["CRO", 3]]);
    expect(linesOf(w, result.resupplyId)).toEqual([["CRO", 12]]);
  });
});
