// node --test dev-toolbox/__tests__/mail-subject-declared.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import { callsOf, verdict } from "../gates/mail-subject-declared.mjs";

const PATH = "apps/lfd-api/src/b2b/orders/application/services/x.ts";
const NONE = new Map();
const NO_DEBT = new Set();

/** Un envoyeur qui injecte la porte et passe `argument` à `mail.<gesture>`. */
const sender = (argument, gesture = "send") =>
  [
    "export class X {",
    "  constructor(private readonly mail: Mail) {}",
    "  async go(orderId: string) {",
    `    await this.mail.${gesture}(${argument});`,
    "  }",
    "}",
  ].join("\n");

const WITH_SUBJECTS = `{
      to: "a",
      template: "customer.order-ready",
      data: { sheet, ...(reminder ? { reminder: true } : {}) },
      idempotencyKey: \`order.ready:\${orderId}\`,
      subjects: [{ type: "order", id: orderId }],
    }`;
const WITHOUT_SUBJECTS = `{ to: "a", template: "t", data: { subjects: 1 }, idempotencyKey: "k" }`;

test("admet : un littéral qui porte `subjects` à son premier niveau, même avec un étalement imbriqué", () => {
  assert.deepEqual(
    verdict([{ path: PATH, source: sender(WITH_SUBJECTS) }], NONE, NO_DEBT).failures,
    [],
  );
});

test("admet : `subjects: []` dit qu'une demande n'a pas d'objet", () => {
  const source = sender(`{ to: "a", subjects: [] }`, "sendAndAwaitReceipt");
  assert.deepEqual(verdict([{ path: PATH, source }], NONE, NO_DEBT).failures, []);
});

test("refuse : une demande sans `subjects` — une clé imbriquée dans `data` ne compte pas", () => {
  const { failures } = verdict([{ path: PATH, source: sender(WITHOUT_SUBJECTS) }], NONE, NO_DEBT);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /x\.ts:4 {2}mail\.send : demande sans `subjects`/);
});

test("refuse : un objet étalé, même s'il porte `subjects` à côté", () => {
  const source = sender(`{ ...demand, subjects: [] }`);
  const { failures } = verdict([{ path: PATH, source }], NONE, NO_DEBT);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /objet étalé/);
});

test("refuse : une demande passée par variable, aux deux gestes", () => {
  const source = sender("demand", "sendAndAwaitReceipt");
  const { failures } = verdict([{ path: PATH, source }], NONE, NO_DEBT);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /mail\.sendAndAwaitReceipt : argument passé par variable/);
});

test("repère par l'injection : une enveloppe positionnelle d'un service métier n'est pas lue, la porte l'est", () => {
  const envelope = [
    "export class Handler {",
    "  constructor(private readonly mail: OrderReadyMail) {}",
    "  async handle(fact: Fact) { await this.mail.send(fact.orderId); }",
    "}",
  ].join("\n");
  const service = sender(WITHOUT_SUBJECTS);
  const files = [
    { path: "apps/lfd-api/src/b2b/orders/application/handlers/h.ts", source: envelope },
    { path: PATH, source: service },
  ];
  const { failures } = verdict(files, NONE, NO_DEBT);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /^apps\/lfd-api\/src\/b2b\/orders\/application\/services\/x\.ts:4/);
});

test("repère un nom d'injection autre que `mail`, et un appel générique", () => {
  const source = [
    "class Y {",
    "  constructor(private readonly courier: Mail) {}",
    '  go() { return this.courier.send<"t">(demand); }',
    "}",
  ].join("\n");
  assert.equal(callsOf(source)[0].defect !== null, true);
});

test("ignore : le bloc `mail`, et les commentaires qui citent le geste", () => {
  const files = [
    { path: "apps/lfd-api/src/mail/sends/z.ts", source: sender("demand") },
    { path: PATH, source: `${sender(WITH_SUBJECTS)}\n// this.mail.send(demand)` },
  ];
  assert.deepEqual(verdict(files, NONE, NO_DEBT).failures, []);
});

test("dette : un inscrit en écart est compté, pas refusé", () => {
  const { failures, debt } = verdict(
    [{ path: PATH, source: sender(WITHOUT_SUBJECTS) }],
    NONE,
    new Set([PATH]),
  );
  assert.deepEqual(failures, []);
  assert.deepEqual(debt, [PATH]);
});

test("dette : un inscrit nettoyé échoue, un inscrit disparu aussi", () => {
  const gone = "apps/lfd-api/src/b2b/gone.ts";
  const { failures } = verdict(
    [{ path: PATH, source: sender(WITH_SUBJECTS) }],
    NONE,
    new Set([PATH, gone]),
  );
  assert.equal(failures.length, 2);
  assert.match(failures[0], /retire-le de DEBT/);
  assert.match(failures[1], /gone\.ts {2}inscrit en dette mais n'injecte plus/);
});

test("admis : sans sujet avec sa raison ; une entrée qui n'injecte plus la porte échoue", () => {
  const admitted = new Map([[PATH, "raison"]]);
  assert.deepEqual(
    verdict([{ path: PATH, source: sender("demand") }], admitted, NO_DEBT).failures,
    [],
  );
  const { failures } = verdict([{ path: PATH, source: "export const x = 1;" }], admitted, NO_DEBT);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /retire-le d'ADMITTED/);
});
