// node --test dev-toolbox/__tests__/pim-subcontexts.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ROOT_CONTEXT,
  analyse,
  contextCycles,
  contextOf,
  importsOf,
  verdict,
} from "../gates/pim-subcontexts.mjs";

const imp = (path) => `import { X } from "${path}";\n`;
const run = (files) => analyse(Object.entries(files).map(([path, source]) => ({ path, source })));

test("carte : l'emplacement actuel et celui de L1 bis donnent le même sous-contexte", () => {
  assert.equal(contextOf("vat-rates/domain/a.ts"), "reference/vat-rates");
  assert.equal(contextOf("reference/vat-rates/domain/a.ts"), "reference/vat-rates");
  assert.equal(contextOf("ingredients/a.ts"), "reference/ingredients");
  assert.equal(contextOf("catalogue/product/lifecycle/a.ts"), "catalogue");
  assert.equal(contextOf("shared/a.ts"), "shared");
  assert.equal(contextOf("pim.module.ts"), ROOT_CONTEXT);
  assert.equal(contextOf("reference/unknown/a.ts"), null);
  assert.equal(contextOf("elsewhere/a.ts"), null);
});

test("carte : un dossier inconnu échoue", () => {
  const found = run({ "elsewhere/a.ts": "" });
  assert.match(verdict(found, {}).join("\n"), /dossier inconnu/u);
});

test("imports : relatifs, résolus en .ts, commentaires ignorés, hors pim écartés", () => {
  const source = `${imp("../../catalogue/a.js")}// ${imp("../x.js")}${imp("@nestjs/common")}${imp("../../../platform/p.js")}`;
  assert.deepEqual(importsOf("vat-rates/domain/b.ts", source), ["catalogue/a.ts"]);
});

test("arêtes admises : le noyau pour tous, le catalogue lit les référentiels, le canal lit le catalogue", () => {
  const found = run({
    "catalogue/a.ts":
      imp("../vat-rates/v.js") + imp("../order-time-limitation/o.js") + imp("../shared/s.js"),
    "channels/c.ts": imp("../catalogue/a.js") + imp("../reference/allergens/x.js"),
    "reference/ingredients/i.ts": imp("../allergens/x.js") + imp("../../journal/j.js"),
    "pim.module.ts": imp("./channels/c.js"),
  });
  assert.equal(found.violations.size, 0);
  assert.deepEqual(verdict(found, {}), []);
});

test("arêtes interdites : référentiel → catalogue, catalogue → canal, limite → canal, noyau → catalogue", () => {
  const found = run({
    "allergens/a.ts": imp("../catalogue/x.js") + imp("../catalogue/y.js"),
    "catalogue/b.ts": imp("../channels/c.js"),
    "order-time-limitation/o.ts": imp("../channels/c.js"),
    "shared/s.ts": imp("../catalogue/x.js"),
    "reference/vat-rates/v.ts": imp("../../channels/c.js"),
  });
  assert.deepEqual(Object.fromEntries(found.violations), {
    "allergens/a.ts → catalogue": 2,
    "catalogue/b.ts → channels": 1,
    "order-time-limitation/o.ts → channels": 1,
    "shared/s.ts → catalogue": 1,
    "reference/vat-rates/v.ts → channels": 1,
  });
});

test("dette : une paire neuve et un compte qui monte échouent ; la dette exacte passe", () => {
  const found = run({ "allergens/a.ts": imp("../catalogue/x.js") + imp("../catalogue/y.js") });
  assert.deepEqual(verdict(found, { imports: { "allergens/a.ts → catalogue": 2 } }), []);
  assert.match(
    verdict(found, { imports: { "allergens/a.ts → catalogue": 1 } }).join(),
    /en admet 1/u,
  );
  assert.match(verdict(found, {}).join(), /en admet 0/u);
});

test("dette : une paire résolue encore inscrite et un compte trop haut échouent", () => {
  const found = run({ "allergens/a.ts": imp("../catalogue/x.js") });
  const failures = verdict(found, {
    imports: { "allergens/a.ts → catalogue": 2, "vat-rates/v.ts → catalogue": 1 },
  });
  assert.equal(failures.length, 2);
  assert.match(failures.join("\n"), /baisse le compte/u);
});

test("cycles : détectés sur les arêtes admises, une fois chacun", () => {
  assert.deepEqual(
    contextCycles([
      ["reference/allergens", "reference/ingredients"],
      ["reference/ingredients", "reference/allergens"],
      ["catalogue", "reference/allergens"],
    ]),
    ["reference/allergens → reference/ingredients → reference/allergens"],
  );
  const found = run({
    "allergens/a.ts": imp("../ingredients/i.js"),
    "ingredients/i.ts": imp("../allergens/a.js"),
  });
  assert.match(verdict(found, {}).join(), /cycle entre sous-contextes/u);
});
