// node --test dev-toolbox/__tests__/mail-through-block.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import { DEBT, injectionsIn, verdict } from "../gates/mail-through-block.mjs";

const SENDER = [
  'import { MAILER, type B2bMailer } from "../platform/mailer/mailer.tokens.js";',
  "export class X {",
  "  constructor(@Inject(MAILER) private readonly mailer: B2bMailer) {}",
  "}",
].join("\n");

test("refuse : @Inject(MAILER), espaces compris", () => {
  assert.deepEqual(injectionsIn(SENDER), [[3, "MAILER"]]);
  assert.equal(injectionsIn("constructor(@Inject( MAILER ) m: M) {}").length, 1);
});

test("refuse : le transport injecté en contournement", () => {
  assert.deepEqual(injectionsIn("constructor(@Inject(MAIL_TRANSPORT) t: T) {}"), [
    [1, "MAIL_TRANSPORT"],
  ]);
});

test("refuse : MAILER dans la liste inject d'une fabrique", () => {
  const source = "{ provide: X, inject: [Clock, MAILER], useFactory: f }";
  assert.deepEqual(injectionsIn(source), [[1, "MAILER"]]);
});

test("admet : un import seul, un commentaire, une variable d'environnement", () => {
  const source = [
    'import { MAILER } from "./mailer.tokens.js";',
    "// on injectait @Inject(MAILER) ici",
    "/* inject: [MAILER] */",
    'const key = optionalString("RESEND_MAILER_B2B_API_KEY");',
    "const providers = [{ provide: MAILER, inject: [MAIL_TRANSPORT_X] }];",
  ].join("\n");
  assert.deepEqual(injectionsIn(source), []);
});

test("dette : un fichier inscrit passe et se compte", () => {
  const { failures, remaining } = verdict([{ path: "a.ts", source: SENDER }], ["a.ts"]);
  assert.deepEqual(failures, []);
  assert.deepEqual(remaining, ["a.ts"]);
});

test("dette : un fichier neuf qui injecte le mailer échoue", () => {
  const { failures } = verdict([{ path: "b.ts", source: SENDER }], []);
  assert.match(failures[0] ?? "", /MailRequests/u);
});

test("dette : un fichier inscrit devenu propre échoue, pour qu'on le raye", () => {
  const { failures } = verdict([{ path: "a.ts", source: "const x = 1;\n" }], ["a.ts"]);
  assert.match(failures[0] ?? "", /propre/u);
});

test("admis : le bloc mail et le module du mailer ne comptent pas", () => {
  const files = [
    { path: "src/mail/x.ts", source: SENDER },
    { path: "src/platform/mailer/mailer.module.ts", source: SENDER },
  ];
  const admitted = { "src/mail/": "r", "src/platform/mailer/mailer.module.ts": "r" };
  assert.deepEqual(verdict(files, [], admitted), { failures: [], remaining: [] });
});

test("la dette compte 8 envoyeurs après S2f (31 relevés le 2026-11-06, moins les 11 de b2b/orders, les 5 de b2b/account, les 3 de b2b/contact, les 2 de b2b/accounting le mandat de b2b/payments et le dossier de production), sans doublon", () => {
  assert.equal(DEBT.length, 8);
  assert.equal(new Set(DEBT).size, 8);
});
