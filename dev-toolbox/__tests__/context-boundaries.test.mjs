// node --test dev-toolbox/__tests__/context-boundaries.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import { judgeImport } from "../gates/context-boundaries.mjs";

test("staff, production et b2b demandent un e-mail par mail/channels/requests/", () => {
  for (const from of [
    "staff/invitations/application/open-staff-access.service.ts",
    "production/application/close-day.ts",
    "b2b/orders/application/commands/place-order.handler.ts",
  ]) {
    const depth = from.split("/").length - 1;
    const specifier = `${"../".repeat(depth)}mail/channels/requests/mail-requests.js`;
    assert.deepEqual(judgeImport(from, specifier), { kind: "ok" }, from);
  }
});

test("un import de mail hors de son canal échoue", () => {
  const verdict = judgeImport("b2b/orders/x.ts", "../../mail/templates/order-placed.js");
  assert.equal(verdict.kind, "off-surface");
  assert.equal(verdict.surface, "mail/channels/");
});

test("ops n'atteint pas mail", () => {
  assert.equal(
    judgeImport("ops/health/x.ts", "../../mail/channels/requests/x.js").kind,
    "forbidden",
  );
});

test("mail n'atteint pas b2b", () => {
  assert.equal(judgeImport("mail/delivery/x.ts", "../../b2b/orders/x.js").kind, "forbidden");
});

test("mail atteint staff pour l'autorisation de l'éditeur, et la plateforme", () => {
  assert.equal(judgeImport("mail/editor/x.ts", "../../staff/permissions/x.js").kind, "ok");
  assert.equal(judgeImport("mail/editor/x.ts", "../../platform/mailer/x.js").kind, "ok");
});

test("platform n'atteint pas mail, la racine si", () => {
  assert.equal(
    judgeImport("platform/x/y.ts", "../../mail/channels/requests/x.js").kind,
    "forbidden",
  );
  assert.equal(judgeImport("appBootstrap/x.ts", "../mail/templates/x.js").kind, "ok");
});

test("les surfaces existantes tiennent toujours", () => {
  assert.equal(judgeImport("b2b/a/x.ts", "../../pim/catalogue/x.js").kind, "off-surface");
  assert.equal(judgeImport("b2b/a/x.ts", "../../pim/channels/b2b-platform/x.js").kind, "ok");
  assert.equal(judgeImport("production/a/x.ts", "../../b2b/orders/x.js").kind, "forbidden");
});
