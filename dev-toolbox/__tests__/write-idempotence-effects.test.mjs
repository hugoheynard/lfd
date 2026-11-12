// node --test dev-toolbox/__tests__/write-idempotence-effects.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import { caseOf, commandHandlersIn, handlerFor, writeRoutes } from "../gates/write-idempotence.mjs";
import { effectsOf, natureFailures, networkTypes } from "../gates/write-idempotence-effects.mjs";

const CONTROLLER = "apps/lfd-api/src/x/http/things.controller.ts";
const HANDLER = "apps/lfd-api/src/x/application/commands/send-thing.handler.ts";
const ROUTE = `${CONTROLLER}#send`;

const controller = (verb) =>
  [
    'import { SendThingCommand } from "../application/commands/send-thing.command.js";',
    "export class ThingsController {",
    `  @${verb}() @Idempotent("rejouée, refus 409")`,
    "  async send(id: string) {",
    "    return this.commands.execute(new SendThingCommand(id));",
    "  }",
    "}",
  ].join("\n");

const handler = (injections, body, network = new Set()) =>
  commandHandlersIn(
    HANDLER,
    [
      'import { SendThingCommand } from "./send-thing.command.js";',
      "@CommandHandler(SendThingCommand)",
      "export class SendThingHandler {",
      `  constructor(${injections}) {}`,
      `  async execute(command) { ${body} }`,
      "}",
    ].join("\n"),
    network,
  );

const failuresOf = (verb, handlers, exceptions = []) => {
  const routes = writeRoutes(CONTROLLER, controller(verb)).map((route) => ({
    ...route,
    case: caseOf(route, handlers),
  }));
  return natureFailures(routes, (command) => handlerFor(command, handlers), exceptions);
};

test("effets : ids.next(), mail.send / sendAndAwaitReceipt, un type réseau injecté", () => {
  const injected = [
    { field: "ids", type: "IdGenerator" },
    { field: "mail", type: "Mail" },
    { field: "store", type: "MediaStore" },
  ];
  assert.deepEqual(effectsOf(injected, "this.ids.next(); this.mail.send({})", new Set()), [
    "creates",
    "mail",
  ]);
  assert.deepEqual(effectsOf(injected, "this.mail.sendAndAwaitReceipt({})", new Set()), ["mail"]);
  assert.deepEqual(effectsOf(injected, "", new Set(["MediaStore"])), ["network:MediaStore"]);
  // Injecté sans être appelé : ni création ni envoi.
  assert.deepEqual(effectsOf(injected, "return 1;", new Set()), []);
});

test("types réseau : la classe qui appelle la garde, et ce qu'elle implémente ou étend", () => {
  const types = networkTypes([
    {
      path: "apps/lfd-api/src/x/infrastructure/r2-store.ts",
      source:
        "export class R2Store extends MediaStore implements Purger { put() { assertOutsideTransaction(this.tx); } }",
    },
    {
      path: "apps/lfd-api/src/platform/database/outside-transaction.ts",
      source: "export class Guard { a() { assertOutsideTransaction(x); } }",
    },
    { path: "apps/lfd-api/src/x/y.ts", source: "export class Quiet extends MediaStore {}" },
  ]);
  assert.deepEqual([...types].sort(), ["MediaStore", "Purger", "R2Store"]);
});

test("refuse : POST @Idempotent dont le handler crée, envoie ou appelle le réseau", () => {
  const cases = [
    handler("private readonly ids: IdGenerator", "this.ids.next();"),
    handler("private readonly mail: Mail", "await this.mail.send({});"),
    handler("private readonly store: MediaStore", "", new Set(["MediaStore"])),
  ];
  for (const handlers of cases) {
    const failures = failuresOf("Post", handlers);
    assert.equal(failures.length, 1);
    assert.match(failures[0], /POST @Idempotent dont le handler SendThingHandler/);
  }
});

test("PUT, PATCH, DELETE gardent la raison déclarative", () => {
  const handlers = handler("private readonly ids: IdGenerator", "this.ids.next();");
  for (const verb of ["Put", "Patch", "Delete"]) {
    assert.deepEqual(failuresOf(verb, handlers), []);
  }
});

test("admet un POST @Idempotent sans effet", () => {
  assert.deepEqual(failuresOf("Post", handler("private readonly repo: ThingRepository", "")), []);
});

test("une exception datée et justifiée admet la route", () => {
  const handlers = handler("private readonly ids: IdGenerator", "this.ids.next();");
  const exception = { route: ROUTE, reason: "index unique sur le nom", verified: "2026-11-12" };
  assert.deepEqual(failuresOf("Post", handlers, [exception]), []);
});

test("refuse : exception sans raison ou sans date, ou qui ne désigne plus une route à effet", () => {
  const handlers = handler("private readonly ids: IdGenerator", "this.ids.next();");
  for (const bad of [
    { route: ROUTE, reason: " ", verified: "2026-11-12" },
    { route: ROUTE, reason: "index unique", verified: "hier" },
  ]) {
    assert.match(failuresOf("Post", handlers, [bad]).join("\n"), /sans raison ou sans date/);
  }
  const stale = { route: ROUTE, reason: "index unique", verified: "2026-11-12" };
  const quiet = handler("private readonly repo: ThingRepository", "");
  assert.match(failuresOf("Post", quiet, [stale]).join("\n"), /ne désigne plus/);
});
