// node --test dev-toolbox/__tests__/production-subcontexts.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import { analyse, verdict } from "../gates/production-subcontexts.mjs";
import {
  classify,
  indexCycles,
  modelsTouched,
  productionModels,
  testContext,
} from "../gates/lib/production-subcontexts-graph.mjs";
import {
  exportedNames,
  indexSizeFailures,
} from "../gates/lib/production-subcontexts-index-size.mjs";
import { isRootEntry, moduleProvidersOf } from "../gates/lib/production-subcontexts-wiring.mjs";

const SCHEMA = [
  "model ProductionDay {",
  "  id String @id",
  '  @@map("production_day")',
  '  @@schema("production")',
  "}",
  "model ProductionQualityCheck {",
  "  id String @id",
  '  @@map("production_quality_check")',
  '  @@schema("production")',
  "}",
  "model Order {",
  "  id String @id",
  '  @@schema("public")',
  "}",
].join("\n");
const MODELS = productionModels(SCHEMA);
const OWNERS = { ProductionDay: "day", ProductionQualityCheck: "quality" };

/** Une carte et des fichiers ; `files` : `{ chemin: source }`. */
function run(files, flat = {}) {
  const list = Object.entries(files).map(([path, source]) => ({ path, source }));
  return analyse(list, { files: flat, models: OWNERS }, MODELS);
}

const imp = (path) => `import { X } from "${path}";\n`;

test("carte : seuls les modèles du schéma production, avec leur table", () => {
  assert.deepEqual(
    MODELS.map((model) => [model.name, model.table]),
    [
      ["ProductionDay", "production_day"],
      ["ProductionQualityCheck", "production_quality_check"],
    ],
  );
});

test("carte : le dossier fait foi après déménagement, la carte avant", () => {
  const { contexts, problems } = classify(["day/a.ts", "domain/b.ts"], { "domain/b.ts": "plan" });
  assert.deepEqual(problems, []);
  assert.equal(contexts.get("day/a.ts"), "day");
  assert.equal(contexts.get("domain/b.ts"), "plan");
  assert.equal(
    classify(["shared/print/p.ts"], {}).contexts.get("shared/print/p.ts"),
    "shared-print",
  );
});

test("carte : un fichier non classé, une entrée périmée, une entrée qui double un dossier échouent", () => {
  const { problems } = classify(["domain/new.ts", "day/a.ts"], {
    "day/a.ts": "day",
    "domain/gone.ts": "day",
  });
  assert.equal(problems.length, 3);
  assert.match(problems.join("\n"), /classe-le/u);
  assert.match(problems.join("\n"), /n'existe plus/u);
  assert.match(problems.join("\n"), /le dossier fait foi/u);
});

test("arêtes : un métier lit le noyau, l'impression et les canaux ; le noyau lit les canaux", () => {
  const { found } = run({
    "plan/a.ts":
      imp("../day/index.js") + imp("../shared/print/index.js") + imp("../channels/commerce/r.js"),
    "day/index.ts": imp("./x.js"),
    "day/x.ts": imp("../channels/commerce/r.js"),
    "channels/commerce/r.ts": imp("../../day/x.js"),
    "shared/print/index.ts": imp("../../day/index.js"),
  });
  assert.deepEqual([...found.edges], []);
  assert.deepEqual([...found.door], []);
});

test("arêtes : le noyau qui importe un métier ou l'impression est refusé, types compris", () => {
  const { found } = run({
    "day/x.ts": 'import type { P } from "../plan/index.js";\n' + imp("../shared/print/index.js"),
    "plan/index.ts": "",
    "shared/print/index.ts": "",
  });
  assert.deepEqual([...found.edges].sort(), [
    "day/x.ts → plan/index.ts",
    "day/x.ts → shared/print/index.ts",
  ]);
});

test("arêtes : l'imprimerie lit le seul port de la couleur d'une commande, aucun autre canal", () => {
  const { found } = run({
    "shared/print/a.ts":
      imp("../../channels/commerce/order-print-colors.reader.js") +
      imp("../../channels/commerce/workshop-shelves.reader.js"),
    "shared/print/b.ts": imp("../../channels/packing/arrested-plan.hold.js"),
    "channels/commerce/order-print-colors.reader.ts": "",
    "channels/commerce/workshop-shelves.reader.ts": "",
    "channels/packing/arrested-plan.hold.ts": "",
  });
  assert.deepEqual([...found.edges].sort(), [
    "shared/print/a.ts → channels/commerce/workshop-shelves.reader.ts",
    "shared/print/b.ts → channels/packing/arrested-plan.hold.ts",
  ]);
});

test("arêtes : seules atelier → quality et plan → resupply relient deux métiers", () => {
  const { found } = run({
    "atelier/a.ts": imp("../quality/index.js"),
    "plan/a.ts": imp("../resupply/index.js"),
    "quality/a.ts": imp("../atelier/index.js"),
    "resupply/a.ts": imp("../plan/index.js"),
    "quality/index.ts": "",
    "resupply/index.ts": "",
    "atelier/index.ts": "",
    "plan/index.ts": "",
  });
  assert.deepEqual([...found.edges].sort(), [
    "quality/a.ts → atelier/index.ts",
    "resupply/a.ts → plan/index.ts",
  ]);
});

test("porte : un import admis qui passe à côté de l'index.ts est compté, même en type", () => {
  const { found } = run({
    "plan/a.ts": 'import type { D } from "../day/domain/d.js";\n',
    "day/domain/d.ts": "",
  });
  assert.deepEqual([...found.door], [["plan → day", 1]]);
});

test("porte : à plat, l'import d'un autre sous-contexte est compté par paire", () => {
  const { found } = run(
    { "domain/a.ts": imp("./b.js") + imp("./c.js"), "domain/b.ts": "", "domain/c.ts": "" },
    { "domain/a.ts": "quality", "domain/b.ts": "day", "domain/c.ts": "day" },
  );
  assert.deepEqual([...found.door], [["quality → day", 2]]);
});

test("tests : libres sur leur intérieur, comptés hors porte ailleurs", () => {
  const { found } = run({
    "quality/__tests__/a.spec.ts":
      imp("../a.js") + imp("../../day/d.js") + imp("../../day/index.js"),
    "quality/a.ts": "",
    "day/d.ts": "",
    "day/index.ts": "",
  });
  assert.deepEqual([...found.testDoor], [["quality → day", 1]]);
});

test("tests : à plat, le test prend le sous-contexte du fichier qu'il éprouve", () => {
  const contexts = new Map([
    ["domain/a.ts", "quality"],
    ["domain/b.ts", "day"],
  ]);
  assert.equal(testContext("domain/__tests__/a.spec.ts", [], contexts), "quality");
  const imports = [{ target: "domain/b.ts" }, { target: "domain/b.ts" }, { target: "domain/a.ts" }];
  assert.equal(testContext("domain/__tests__/doubles.ts", imports, contexts), "day");
});

test("modules : un module de métier entre chez un autre par son module Nest, sur les arêtes admises", () => {
  const { found } = run({
    "plan/production-plan.module.ts": imp("../day/production-day.module.js"),
    "atelier/production-atelier.module.ts":
      imp("../quality/production-quality.module.js") + imp("../plan/production-plan.module.js"),
    "day/production-day.module.ts": "",
    "quality/production-quality.module.ts": "",
  });
  assert.deepEqual([...found.door], []);
  assert.deepEqual(
    [...found.edges],
    ["atelier/production-atelier.module.ts → plan/production-plan.module.ts"],
  );
});

test("modules : un fichier ordinaire n'entre pas par un module Nest, ni un module par l'intérieur", () => {
  const { found } = run({
    "plan/a.ts": imp("../day/production-day.module.js"),
    "quality/production-quality.module.ts": imp("../day/domain/d.js"),
    "resupply/http/x.module.ts": imp("../../day/production-day.module.js"),
    "day/production-day.module.ts": "",
    "day/domain/d.ts": "",
  });
  assert.deepEqual([...found.door].sort(), [
    ["plan → day", 1],
    ["quality → day", 1],
    ["resupply → day", 1],
  ]);
});

test("racine : production.module.ts lit l'intérieur de tout le monde sans dette", () => {
  const { found } = run(
    { "production.module.ts": imp("./domain/a.js"), "domain/a.ts": "" },
    { "production.module.ts": "root", "domain/a.ts": "plan" },
  );
  assert.deepEqual([...found.edges], []);
  assert.deepEqual([...found.door], []);
});

test("modèles : un adaptateur qui lit le modèle d'un autre sous-contexte, en Prisma ou en SQL", () => {
  const prisma = "await tx.productionDay.findMany({});";
  const sql = 'await this.prisma.$queryRaw`SELECT 1 FROM "production"."production_quality_check"`;';
  assert.deepEqual(modelsTouched(prisma, MODELS), ["ProductionDay"]);
  assert.deepEqual(modelsTouched(sql, MODELS), ["ProductionQualityCheck"]);
  assert.deepEqual(modelsTouched('const type = "production.day_closed";', MODELS), []);
  const { found } = run({ "quality/infra/r.ts": prisma, "day/infra/r.ts": prisma });
  assert.deepEqual([...found.models], ["quality/infra/r.ts → ProductionDay (day)"]);
});

test("abonnés : en mémoire sur le fait d'un autre métier refusé, durable admis", () => {
  const { found } = run({
    "atelier/on-x.ts":
      'import { DayClosed } from "../plan/events.js";\n@EventsHandler(DayClosed)\nclass A {}',
    "quality/on-x.ts":
      'import { DayClosed } from "../plan/events.js";\n@DurableHandler({ type: DAY })\nclass B {}',
    "plan/on-x.ts":
      'import { DayClosed } from "./events.js";\n@EventsHandler(DayClosed)\nclass C {}',
    "plan/events.ts": "",
  });
  assert.deepEqual([...found.subscribers], ["atelier/on-x.ts → DayClosed (plan)"]);
});

test("cycles : un cycle d'exécution par un index.ts est relevé, un import de type ne boucle pas", () => {
  assert.deepEqual(
    indexCycles([
      ["day/index.ts", "day/a.ts"],
      ["day/a.ts", "day/index.ts"],
    ]),
    ["day/index.ts"],
  );
  assert.deepEqual(
    indexCycles([
      ["day/a.ts", "day/b.ts"],
      ["day/b.ts", "day/a.ts"],
    ]),
    [],
  );
  const { found } = run({
    "day/index.ts": imp("./a.js"),
    "day/a.ts": 'import type { I } from "./index.js";\n',
  });
  assert.deepEqual(found.indexCycles, []);
});

test("verdict : neuf, périmé, compte trop haut ou trop bas échouent ; la dette exacte passe", () => {
  const found = {
    edges: new Set(["a → b"]),
    models: new Set(),
    subscribers: new Set(),
    indexCycles: [],
    messages: new Set(),
    providers: new Set(),
    door: new Map([["plan → day", 3]]),
    testDoor: new Map(),
    roots: new Map(),
  };
  assert.deepEqual(verdict(found, { edges: ["a → b"], door: { "plan → day": 3 } }), []);
  assert.match(verdict(found, { door: { "plan → day": 3 } })[0], /arête hors du schéma/u);
  assert.match(
    verdict(found, { edges: ["a → b", "c → d"], door: { "plan → day": 3 } })[0],
    /ne viole plus/u,
  );
  assert.match(verdict(found, { edges: ["a → b"], door: { "plan → day": 2 } })[0], /en admet 2/u);
  assert.match(
    verdict(found, { edges: ["a → b"], door: { "plan → day": 4 } })[0],
    /baisse le compte/u,
  );
});

const cmd = (name) => `export class ${name} {}\n`;

test("bus : envoyer la commande d'un métier admis par son index.ts passe", () => {
  const { found } = run({
    "day/index.ts": 'export { CloseCommand } from "./c.js";\n',
    "day/c.ts": cmd("CloseCommand"),
    "plan/a.ts":
      'import { CloseCommand } from "../day/index.js";\nbus.execute(new CloseCommand());\n',
  });
  assert.deepEqual([...found.messages], []);
});

test("bus : une commande relayée par une autre porte est jugée sur son déclarant", () => {
  const { found } = run({
    "plan/index.ts": 'export { CloseCommand } from "./c.js";\n',
    "plan/c.ts": cmd("CloseCommand"),
    "shared/print/index.ts": 'export { CloseCommand } from "../../plan/index.js";\n',
    "atelier/a.ts":
      'import { CloseCommand } from "../shared/print/index.js";\nbus.execute<CloseCommand, void>(x);\n',
  });
  assert.deepEqual([...found.messages], ["atelier/a.ts → CloseCommand (plan, arête refusée)"]);
});

test("bus : la requête d'un métier admis prise à côté de son index.ts est refusée", () => {
  const { found } = run({
    "day/index.ts": "export {};\n",
    "day/q.ts": cmd("ReadQuery"),
    "plan/a.ts": 'import { ReadQuery } from "../day/q.js";\nbus.execute(new ReadQuery());\n',
  });
  assert.deepEqual([...found.messages], ["plan/a.ts → ReadQuery (day, hors de day/index.ts)"]);
});

test("bus : le handler d'une commande d'un autre métier est refusé, même par sa porte", () => {
  const { found } = run({
    "day/index.ts": 'export { CloseCommand } from "./c.js";\n',
    "day/c.ts": cmd("CloseCommand"),
    "plan/h.ts": 'import { CloseCommand } from "../day/index.js";\n@CommandHandler(CloseCommand)\n',
  });
  assert.deepEqual(
    [...found.messages],
    ["plan/h.ts → CloseCommand (day, handler d'un message d'un autre métier)"],
  );
});

test("bus : écouter un fait d'un métier refusé, en mémoire ou durable, est refusé ; un canal passe", () => {
  const { found } = run({
    "plan/index.ts": 'export { PLAN_DONE } from "./e.js";\n',
    "plan/e.ts": 'export const PLAN_DONE = "x";\n',
    "channels/commerce/e.ts": 'export const DAY_CLOSED = "y";\n',
    "atelier/h.ts":
      'import { PLAN_DONE } from "../plan/index.js";\n@DurableHandler({ type: PLAN_DONE, subscriber: S })\n',
    "quality/h.ts":
      'import { DAY_CLOSED } from "../channels/commerce/e.js";\n@DurableHandler({ type: DAY_CLOSED, subscriber: S })\n',
  });
  assert.deepEqual([...found.messages], ["atelier/h.ts → PLAN_DONE (plan, arête refusée)"]);
});

test("modules : un fournisseur dans un seul module passe, dans deux il est refusé", () => {
  const one = run({
    "day/day.module.ts":
      "@Module({ providers: [A, { provide: P, useClass: B }], controllers: [C] })",
    "plan/plan.module.ts": "@Module({ imports: [DayModule], providers: [D] })",
  });
  assert.deepEqual([...one.found.providers], []);
  const two = run({
    "day/day.module.ts": "@Module({ providers: [A, { provide: P, useClass: B }] })",
    "plan/plan.module.ts":
      "@Module({ providers: [{ provide: P, useExisting: X }], controllers: [A] })",
  });
  assert.deepEqual([...two.found.providers].sort(), [
    "A : day/day.module.ts + plan/plan.module.ts",
    "P : day/day.module.ts + plan/plan.module.ts",
  ]);
  assert.deepEqual(
    moduleProvidersOf("@Module({ providers: [A, { provide: P, useFactory: (a) => f(a, [1]) }] })"),
    ["A", "P"],
  );
});

test("racines : entrent par un index.ts, un module de métier, le module du bloc ou un canal", () => {
  for (const ok of [
    "production/day/index.ts",
    "production/plan/production-plan.module.ts",
    "production/shared/print/production-print.module.ts",
    "production/production.module.ts",
    "production/channels/commerce/index.ts",
    "production/channels/packing/x.ts",
    "packing/x.ts",
  ])
    assert.equal(isRootEntry(ok), true, ok);
  for (const ko of ["production/day/domain/x.ts", "production/plan/infrastructure/r.ts"])
    assert.equal(isRootEntry(ko), false, ko);
  const list = [
    {
      path: "appBootstrap/feed.module.ts",
      source: imp("../production/day/index.js") + imp("../production/plan/infrastructure/r.js"),
    },
    { path: "dev/seed.ts", source: imp("../production/atelier/index.js") },
  ];
  const { found } = analyse([], { files: {}, models: OWNERS }, MODELS, list);
  assert.deepEqual([...found.roots], [["appBootstrap/feed.module.ts", 1]]);
});

test("taille d'un index : chaque nom exporté compte une fois, commentaires et alias compris", () => {
  const source = [
    "/** export { Fantome } from './x.js'; */",
    'export { A, type B, C as D } from "./a.js";',
    'export type { E,\n  F } from "./e.js";',
    "export const G = 1;",
    "export class H {}",
    'export { A } from "./again.js";',
  ].join("\n");
  assert.deepEqual([...exportedNames(source)].sort(), ["A", "B", "D", "E", "F", "G", "H"]);
  assert.equal(exportedNames('export * from "./a.js";'), null);
});

test("taille d'un index : mesurée par métier, un export * est un problème", () => {
  const { found, problems } = run({
    "day/index.ts": 'export { A, B } from "./a.js";\n',
    "plan/index.ts": 'export * from "./p.js";\n',
    "quality/index.ts": "export {};\n",
  });
  assert.deepEqual(
    [...found.indexSize],
    [
      ["day", 2],
      ["quality", 0],
    ],
  );
  assert.match(problems.join("\n"), /plan\/index\.ts : un export \*/u);
});

test("taille d'un index : grandir échoue, baisser demande d'abaisser le compte, l'exact passe", () => {
  const sizes = new Map([["day", 3]]);
  assert.deepEqual(indexSizeFailures(sizes, { day: 3 }), []);
  assert.match(indexSizeFailures(sizes, { day: 2 })[0], /3 noms exportés.*en admet 2/u);
  assert.match(indexSizeFailures(sizes, {})[0], /en admet 0/u);
  assert.match(indexSizeFailures(sizes, { day: 4 })[0], /baisse le compte \(indexSize\)/u);
  assert.match(indexSizeFailures(new Map(), { plan: 1 })[0], /plan {2}0 noms/u);
  const found = {
    edges: new Set(),
    models: new Set(),
    subscribers: new Set(),
    indexCycles: [],
    messages: new Set(),
    providers: new Set(),
    door: new Map(),
    testDoor: new Map(),
    roots: new Map(),
    indexSize: sizes,
  };
  assert.match(verdict(found, { indexSize: { day: 1 } })[0], /en admet 1/u);
});
