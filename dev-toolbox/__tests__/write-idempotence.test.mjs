// node --test dev-toolbox/__tests__/write-idempotence.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  caseOf,
  commandHandlersIn,
  debtOf,
  handlerFor,
  sealedUnderDirectTransaction,
  unfingerprintedSubjects,
  verdict,
  writeRoutes,
} from "../gates/write-idempotence.mjs";
import { inventoryOf } from "../gates/write-idempotence-inventory.mjs";
import { joinRoutePath } from "../gates/write-idempotence-paths.mjs";

const CONTROLLER_PATH = "apps/lfd-api/src/x/http/things.controller.ts";
const COMMAND_PATH = "apps/lfd-api/src/x/application/commands/send-thing.command.ts";
const HANDLER_PATH = "apps/lfd-api/src/x/application/commands/send-thing.handler.ts";

const controller = (
  decorators,
  params = "@Param('id') id: string, @IntentKey() intentKey: string",
) =>
  [
    'import { SendThingCommand } from "../application/commands/send-thing.command.js";',
    "export class ThingsController {",
    `  ${decorators}`,
    `  async send(${params}) {`,
    "    return this.commands.execute(new SendThingCommand(id, intentKey));",
    "  }",
    "  @Get()",
    "  list() { return []; }",
    "}",
  ].join("\n");

const handler = (injections, body) =>
  [
    'import { SendThingCommand } from "./send-thing.command.js";',
    "@CommandHandler(SendThingCommand)",
    "export class SendThingHandler {",
    `  constructor(${injections}) {}`,
    `  execute(command) { ${body} }`,
    "}",
  ].join("\n");

const SEALED = handler(
  "private readonly uow: UnitOfWork, private readonly intents: OncePerIntent",
  "return this.intents.runSealed(i, c, (seal) => this.uow.run(seal));",
);

const routeOf = (source, handlers) => {
  const [route] = writeRoutes(CONTROLLER_PATH, source);
  return { ...route, case: caseOf(route, handlers) };
};

test("ne lit que les routes d'écriture, avec leur méthode et leur ligne", () => {
  const routes = writeRoutes(CONTROLLER_PATH, controller("@Post(':id')"));
  assert.equal(routes.length, 1);
  assert.equal(routes[0].method, "send");
  assert.equal(routes[0].line, 3);
  assert.deepEqual(routes[0].commands, [{ name: "SendThingCommand", from: COMMAND_PATH }]);
  for (const verb of ["Put", "Patch", "Delete"]) {
    assert.equal(writeRoutes(CONTROLLER_PATH, controller(`@${verb}()`)).length, 1);
  }
});

test("par nature : @Idempotent avec une raison, avant ou après le verbe", () => {
  for (const decorators of [
    '@Put() @Idempotent("pose une valeur, le rejeu laisse le même état")',
    "@Idempotent(`identifiant de l'événement`) @Post()",
  ]) {
    assert.equal(routeOf(controller(decorators, "id: string"), []).case, "nature");
  }
});

test("refuse : @Idempotent sans raison", () => {
  for (const decorators of ['@Post() @Idempotent("  ")', "@Post() @Idempotent()"]) {
    const route = routeOf(controller(decorators), []);
    assert.equal(route.case, "empty-reason");
    assert.match(
      verdict([route], []).failures[0],
      /things\.controller\.ts:3 {2}send — @Idempotent\(\) sans raison/,
    );
  }
});

test("par intention : @IntentKey et un handler en runSealed, résolu par l'import de la commande", () => {
  const handlers = commandHandlersIn(HANDLER_PATH, SEALED);
  assert.equal(handlers[0].from, COMMAND_PATH);
  assert.equal(routeOf(controller("@Post()"), handlers).case, "intent");
});

test("par intention : une route qui délègue à sa voisine par this.x( est suivie", () => {
  const source = [
    'import { SendThingCommand } from "../application/commands/send-thing.command.js";',
    "export class ThingsController {",
    "  @Post() go(@IntentKey() k: string) { return this.inner(k); }",
    "  @Put() inner(@IntentKey() k: string) { return this.commands.execute(new SendThingCommand(k)); }",
    "}",
  ].join("\n");
  const handlers = commandHandlersIn(HANDLER_PATH, SEALED);
  const routes = writeRoutes(CONTROLLER_PATH, source).map((r) => caseOf(r, handlers));
  assert.deepEqual(routes, ["intent", "intent"]);
});

test("par intention : run admis seulement si le handler n'écrit pas en base", () => {
  const harmless = handler(
    "private readonly mail: Mail, private readonly intents: OncePerIntent",
    "return this.intents.run(i, c, () => this.mail.send(x));",
  );
  assert.equal(
    routeOf(controller("@Post()"), commandHandlersIn(HANDLER_PATH, harmless)).case,
    "intent",
  );
  for (const [injections, body] of [
    [
      "private readonly uow: UnitOfWork, private readonly intents: OncePerIntent",
      "return this.intents.run(i, c, g);",
    ],
    [
      "private readonly prisma: PrismaService, private readonly intents: OncePerIntent",
      "return this.intents.run(i, c, g);",
    ],
    [
      "private readonly things: ThingRepository, private readonly intents: OncePerIntent",
      "return this.intents.run(i, c, g);",
    ],
    [
      "private readonly intents: OncePerIntent",
      "return this.intents.run(i, c, () => this.x.save(t));",
    ],
    // Régression : le fait tracé écrit le journal hors transaction, et `run` passait.
    [
      "private readonly events: TracedEventPublisher, private readonly intents: OncePerIntent",
      "return this.intents.run(i, c, () => this.events.publishTraced(f, t));",
    ],
  ]) {
    const writing = commandHandlersIn(HANDLER_PATH, handler(injections, body));
    assert.equal(routeOf(controller("@Post()"), writing).case, null, injections);
  }
});

test("non rangée : sans @IntentKey, sans handler, ou un handler sans OncePerIntent", () => {
  const handlers = commandHandlersIn(HANDLER_PATH, SEALED);
  assert.equal(routeOf(controller("@Post()", "id: string"), handlers).case, null);
  assert.equal(routeOf(controller("@Post()"), []).case, null);
  const plain = commandHandlersIn(HANDLER_PATH, handler("private readonly x: X", "return 1;"));
  assert.equal(routeOf(controller("@Post()"), plain).case, null);
});

test("le handler se retrouve par son nom quand l'import passe ailleurs, s'il est seul", () => {
  const elsewhere = commandHandlersIn(
    "apps/lfd-api/src/y/handler.ts",
    SEALED.replace("./send-thing.command.js", "./index.js"),
  );
  assert.equal(routeOf(controller("@Post()"), elsewhere).case, "intent");
  assert.equal(routeOf(controller("@Post()"), [...elsewhere, ...elsewhere]).case, null);
});

test("refuse : une route non rangée hors de la dette ; l'admet inscrite", () => {
  const route = routeOf(controller("@Post()", "id: string"), []);
  assert.match(verdict([route], []).failures[0], /send — route d'écriture non rangée/);
  const debt = debtOf([route]);
  assert.deepEqual(debt, [{ file: CONTROLLER_PATH, method: "send" }]);
  const result = verdict([route], debt);
  assert.deepEqual(result.failures, []);
  assert.equal(result.debt.length, 1);
});

test("refuse : une route rangée encore inscrite, une entrée qui ne désigne plus rien", () => {
  const route = routeOf(controller('@Post() @Idempotent("raison")'), []);
  const debt = [
    { file: CONTROLLER_PATH, method: "send" },
    { file: CONTROLLER_PATH, method: "gone" },
  ];
  const { failures, ranged } = verdict([route], debt);
  assert.equal(ranged.length, 1);
  assert.equal(failures.length, 2);
  assert.match(failures[0], /rangée \(nature\) mais encore dans/);
  assert.match(failures[1], /gone — inscrite dans .*plus aucune route/);
});

test("refuse : runSealed dans un fichier qui ouvre $transaction( en direct", () => {
  assert.equal(sealedUnderDirectTransaction(SEALED), false);
  const direct = SEALED.replace(
    "this.uow.run(seal)",
    "this.prisma.$transaction(async (tx) => seal())",
  );
  assert.equal(sealedUnderDirectTransaction(direct), true);
  assert.match(
    verdict([], [], ["a.handler.ts"]).failures[0],
    /a\.handler\.ts — runSealed .*\$transaction/,
  );
});

test("repère une route sous RecomputeGuard, au niveau de la classe ou de la méthode", () => {
  const guarded = controller('@Post() @Idempotent("balayage")', "id: string").replace(
    "export class",
    "@UseGuards(RecomputeGuard)\nexport class",
  );
  assert.equal(writeRoutes(CONTROLLER_PATH, guarded)[0].machine, true);
  assert.equal(writeRoutes(CONTROLLER_PATH, controller("@Post()"))[0].machine, false);
});

/**
 * Régression : `me.controller.ts#linkIdentity` relit les méthodes après
 * l'écriture ; la requête de relecture, sans handler de commande, rendait la
 * route « non rangée » alors que sa commande est scellée.
 */
test("par intention : la requête de relecture après la commande ne compte pas", () => {
  const source = [
    'import { SendThingCommand } from "../application/commands/send-thing.command.js";',
    'import { ListThingsQuery } from "../application/queries/list-things.query.js";',
    "export class ThingsController {",
    "  @Post() async go(@IntentKey() k: string) {",
    "    await this.commands.execute(new SendThingCommand(k));",
    "    return this.queries.execute(new ListThingsQuery());",
    "  }",
    "  @Post() read(@IntentKey() k: string) { return this.queries.execute(new ListThingsQuery()); }",
    "}",
  ].join("\n");
  const handlers = commandHandlersIn(HANDLER_PATH, SEALED);
  const cases = writeRoutes(CONTROLLER_PATH, source).map((r) => caseOf(r, handlers));
  assert.deepEqual(cases, ["intent", null]);
});

test("risque assumé : @AcceptedReplay avec raison et décision, rangé à part", () => {
  const ok = routeOf(
    controller('@AcceptedReplay("lien de mot de passe", "décidé par Hugo le 2026-11-12") @Post()'),
    [],
  );
  assert.equal(ok.case, "accepted");
  assert.equal(ok.accepted, "lien de mot de passe (décidé par Hugo le 2026-11-12)");
  const result = verdict([ok], []);
  assert.deepEqual(result.failures, []);
  assert.equal(result.ranged.length, 1);
  for (const bad of [
    '@AcceptedReplay("raison")',
    '@AcceptedReplay("", "Hugo")',
    "@AcceptedReplay(x, y)",
  ]) {
    const route = routeOf(controller(`${bad} @Post()`), []);
    assert.equal(route.case, "empty-reason", bad);
    assert.match(verdict([route], []).failures[0], /AcceptedReplay/);
  }
});

test("inventaire : verbe, chemin complet (préfixe, constantes du fichier), case et handler", () => {
  const source = [
    'import { SendThingCommand } from "../application/commands/send-thing.command.js";',
    'const ITEM = ":id/things";',
    "@Controller('admin/x/')",
    "export class ThingsController {",
    "  @Post(`${ITEM}/send`) send(@IntentKey() k: string) { return this.commands.execute(new SendThingCommand(k)); }",
    '  @Put() @Idempotent("pose") put() {}',
    "  @Delete(IMPORTED) drop() {}",
    "}",
  ].join("\n");
  const handlers = commandHandlersIn(HANDLER_PATH, SEALED);
  const routes = writeRoutes(CONTROLLER_PATH, source).map((r) => ({
    ...r,
    case: caseOf(r, handlers),
  }));
  const inventory = inventoryOf(routes, (command) => handlerFor(command, handlers));
  assert.deepEqual(inventory, [
    {
      route: `${CONTROLLER_PATH}#put`,
      httpMethod: "PUT",
      path: "/admin/x",
      case: "nature",
      handlers: [],
    },
    {
      route: `${CONTROLLER_PATH}#send`,
      httpMethod: "POST",
      path: "/admin/x/:id/things/send",
      case: "intent",
      handlers: [`${HANDLER_PATH}#SendThingHandler`],
    },
  ]);
  assert.equal(routes.find((r) => r.method === "drop").path, "/admin/x/{IMPORTED}");
  assert.equal(joinRoutePath("", ""), "/");
  assert.equal(joinRoutePath("/a/", "/b/"), "/a/b");
});

test("refuse : une intention dont le sujet n'est qu'un identifiant (même clé, autre contenu rejoué en silence)", () => {
  const source = [
    "export class RecordThingHandler {",
    "  execute(command) {",
    "    return this.intents.runSealed(",
    "      { actorId: command.staffUserId, key: command.intentKey, gesture: 'thing.record', subject: command.entityId },",
    "      CREATED_ID_REPLAY,",
    "      (seal) => this.record(command, seal),",
    "    );",
    "  }",
    "}",
  ].join("\n");
  const found = unfingerprintedSubjects(HANDLER_PATH, source);
  assert.deepEqual(
    found.map((f) => f.line),
    [4],
  );
  const { failures } = verdict(
    [],
    [],
    [],
    found.map((f) => ({ file: HANDLER_PATH, ...f })),
  );
  assert.equal(failures.length, 1);
  assert.match(failures[0], /intentSubject/);
});

test("admet : un sujet construit par intentSubject, et un littéral qui n'est pas une intention", () => {
  const source = [
    "const intent = { actorId: a, key: k, gesture: 'thing.record', subject: intentSubject(id, command.entry) };",
    "const bin = { subject: { kind: 'transfer' }, declaration };",
    "const shorthand = { key, gesture, subject };",
  ].join("\n");
  const found = unfingerprintedSubjects(HANDLER_PATH, source);
  assert.deepEqual(
    found.map((f) => f.subject),
    ["subject"],
  );
});

test("le registre lui-même n'est pas lu : il manipule le sujet, il ne le construit pas", () => {
  const source =
    "const row = { key: intent.key, gesture: intent.gesture, subject: intent.subject };";
  assert.deepEqual(
    unfingerprintedSubjects(
      "apps/lfd-api/src/platform/intent/prisma-gesture-intent.ledger.ts",
      source,
    ),
    [],
  );
});

test("par intention : run refusé quand un service injecté écrit, même par un autre service", async () => {
  const { injectableClassesIn, writingServices } =
    await import("../gates/write-idempotence-services.mjs");
  const isWriting = (t) => /^(?:UnitOfWork|PrismaService)$|(?:Repository|Store|Writer)$/.test(t);
  const calls = /\.save\s*\(|\$transaction\s*\(|\.publishTraced\s*\(/;
  const services = writingServices([
    ...injectableClassesIn(
      "a.ts",
      "@Injectable() export class OpenAccess { constructor(private readonly uow: UnitOfWork) {} }",
      isWriting,
      calls,
    ),
    ...injectableClassesIn(
      "b.ts",
      "@Injectable() export class Wrapper { constructor(private readonly open: OpenAccess) {} }",
      isWriting,
      calls,
    ),
  ]);
  const viaService = handler(
    "private readonly access: Wrapper, private readonly intents: OncePerIntent",
    "return this.intents.run(i, c, () => this.access.open(x));",
  );
  const handlers = commandHandlersIn(HANDLER_PATH, viaService);
  const [route] = writeRoutes(CONTROLLER_PATH, controller("@Post()"));
  assert.equal(caseOf(route, handlers), "intent");
  assert.equal(caseOf(route, handlers, services), null);
});
