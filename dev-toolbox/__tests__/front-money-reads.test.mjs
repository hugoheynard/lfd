// node --test dev-toolbox/__tests__/front-money-reads.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import { centsSumsIn, refusedIn, verdict } from "../gates/front-money-reads.mjs";

/** Un fichier fautif par motif refusé (plan L6, § 5). */
const REFUSED = {
  "import de la règle": "import { orderPretaxCents } from '@lfd/money';\n",
  "import du net": "import {\n  lineTotalCents,\n  netArticlesCents,\n} from '@lfd/money';\n",
  "total moins": "const ht = order.totalCents - order.vatCents;\n",
  "moins la TVA": "const ht = sum - totals.vatCents;\n",
  "TVA par taux sommée": "const vat = totals.vat.reduce((s, x) => s + x.amountCents, 0);\n",
};

for (const [name, source] of Object.entries(REFUSED)) {
  test(`refuse : ${name}`, () => {
    assert.ok(refusedIn(source).length > 0);
  });
}

test("admet la lecture d'un champ servi, et l'import d'une autre règle", () => {
  const source = [
    "import { lineTotalCents } from '@lfd/money';",
    "const ht = order.settlement === 'account' ? order.pretaxCents : order.totalCents;",
    "const best = [...rows].sort((a, b) => b.totalCents - a.totalCents)[0];",
    "// order.totalCents - order.vatCents : l'ancienne formule, citée en commentaire",
  ].join("\n");

  assert.deepEqual(refusedIn(source), []);
  assert.deepEqual(centsSumsIn(source), []);
});

test("compte une somme de centimes, pas une autre somme", () => {
  const source = [
    "const pieces = lines.reduce((sum, line) => sum + line.quantity, 0);",
    "const total = invoices.reduce((sum, invoice) => sum + invoice.totalCents, 0);",
  ].join("\n");

  assert.deepEqual(centsSumsIn(source), [2]);
});

const SUM = "const t = xs.reduce((s, x) => s + x.amountCents, 0);\n";

test("dette : un fichier inscrit passe et se compte", () => {
  const { failures, remaining } = verdict([{ path: "a.ts", source: SUM }], ["a.ts"]);
  assert.deepEqual(failures, []);
  assert.deepEqual(remaining, [["a.ts", 1]]);
});

test("dette : un fichier hors liste qui en gagne une échoue", () => {
  assert.equal(verdict([{ path: "b.ts", source: SUM }], []).failures.length, 1);
});

test("dette : un fichier inscrit devenu propre échoue", () => {
  const { failures } = verdict([{ path: "a.ts", source: "const x = 1;\n" }], ["a.ts"]);
  assert.match(failures[0] ?? "", /propre/u);
});
