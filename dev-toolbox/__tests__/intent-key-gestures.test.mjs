// node --test dev-toolbox/__tests__/intent-key-gestures.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import { gestureFailures, randomKeys, verdict } from "../gates/intent-key-gestures.mjs";

const GESTURE = {
  command: "apps/lfd-api/src/b2b/x/send-thing.command.ts",
  className: "SendThingCommand",
  controller: "apps/lfd-api/src/b2b/x/http/things.controller.ts",
};
const COMMAND = [
  "export class SendThingCommand {",
  "  constructor(",
  "    readonly thingId: string,",
  "    readonly intentKey: string,",
  "  ) {}",
  "}",
].join("\n");
const CONTROLLER = [
  "export class ThingsController {",
  "  send(@Param('id') id: string, @IntentKey() intentKey: string) {",
  "    return this.commands.execute(new SendThingCommand(id, intentKey));",
  "  }",
  "}",
].join("\n");

test("admet : une commande à clé obligatoire, un contrôleur qui la lit et la passe", () => {
  assert.deepEqual(gestureFailures(GESTURE, COMMAND, CONTROLLER), []);
});

test("refuse : une commande sans clé, ou à clé facultative", () => {
  for (const source of [
    COMMAND.replace("    readonly intentKey: string,\n", ""),
    COMMAND.replace("intentKey: string", "intentKey?: string"),
  ]) {
    const failures = gestureFailures(GESTURE, source, CONTROLLER);
    assert.equal(failures.length, 1);
    assert.match(
      failures[0],
      /send-thing\.command\.ts:1 .*SendThingCommand sans `readonly intentKey: string` obligatoire/,
    );
  }
});

test("refuse : un contrôleur qui ne lit pas la clé de la requête", () => {
  const failures = gestureFailures(
    GESTURE,
    COMMAND,
    CONTROLLER.replace(", @IntentKey() intentKey: string", "").replace("id, intentKey", "id, 'x'"),
  );
  assert.equal(failures.length, 1);
  assert.match(
    failures[0],
    /things\.controller\.ts:3 .*construit sans la clé de la requête.*@IntentKey\(\)/,
  );
});

test("refuse : une commande ou un contrôleur disparus", () => {
  assert.match(gestureFailures(GESTURE, null, CONTROLLER)[0], /introuvable/);
  assert.match(gestureFailures(GESTURE, COMMAND, null)[0], /introuvable/);
});

const SENDER = (key) =>
  [
    "async go() {",
    "  await this.mail.sendAndAwaitReceipt({",
    `    idempotencyKey: ${key},`,
    "  });",
    "}",
  ].join("\n");

test("refuse : une clé d'e-mail tirée de l'IdGenerator ou de l'horloge, avec sa ligne", () => {
  assert.deepEqual(randomKeys(SENDER("`x:${this.ids.next()}`")), [3]);
  assert.deepEqual(randomKeys(SENDER("`x:${this.clock.now().toISOString()}`")), [3]);
  const failures = verdict(
    [],
    () => null,
    [{ path: "a.ts", source: SENDER("`x:${this.ids.next()}`") }],
    {},
  );
  assert.match(failures[0], /^a\.ts:3 .*tirée au hasard ou datée/);
});

test("admet : une clé d'intention ou déterministe, et un fichier sans e-mail", () => {
  assert.deepEqual(randomKeys(SENDER("`x:${command.intentKey}`")), []);
  assert.deepEqual(randomKeys(SENDER("`order.placed:${orderId}`")), []);
  assert.deepEqual(randomKeys("const n = { idempotencyKey: `n:${this.ids.next()}` };"), []);
});

test("refuse : une entrée admise qui ne tire plus au hasard", () => {
  const failures = verdict([], () => null, [{ path: "a.ts", source: SENDER("'fixe'") }], {
    "a.ts": "r",
  });
  assert.match(failures[0], /a\.ts .*retire-le de RANDOM_ADMITTED/);
});
