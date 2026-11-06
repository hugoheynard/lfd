// node --test dev-toolbox/__tests__/rgpd-staff.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import { PERSONS, check, isCandidate } from "../gates/rgpd-staff.mjs";

const SCHEMA = [
  "model MailRequest {",
  "  id        String @id",
  "  recipient String",
  '  @@map("mail_request")',
  '  @@schema("mail")',
  "}",
].join("\n");

const ENTRY = {
  colonne: "mail.mail_request.recipient",
  personne: "client",
  categorie: "identite",
  finalite: "Le destinataire.",
  conservation: { jours: 365 },
  purge: null,
  information: false,
};
const EXCLUDE_ID = { colonne: "mail.mail_request.id", raison: "Identifiant technique." };

test("la catégorie client est admise (Hugo, 2026-11-06)", () => {
  assert.ok(PERSONS.includes("client"));
  assert.deepEqual(check({ entrees: [ENTRY], exclusions: [EXCLUDE_ID] }, SCHEMA), []);
});

test("chaque colonne du suivi des e-mails et de la boîte d'envoi est candidate", () => {
  assert.equal(isCandidate("mail.mail_request.recipient"), true);
  assert.equal(isCandidate("platform.outbox.payload"), true);
  assert.equal(isCandidate("platform.outbox_delivery.subscriber"), false);
  const problems = check({ entrees: [ENTRY], exclusions: [] }, SCHEMA);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /mail\.mail_request\.id : colonne candidate absente/u);
});

test("une personne inconnue reste refusée", () => {
  const problems = check(
    { entrees: [{ ...ENTRY, personne: "visiteur" }], exclusions: [EXCLUDE_ID] },
    SCHEMA,
  );
  assert.equal(problems.length, 1);
  assert.match(problems[0], /`personne` doit valoir/u);
});
