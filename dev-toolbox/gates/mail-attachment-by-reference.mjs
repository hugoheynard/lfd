#!/usr/bin/env node
/**
 * Gate : **hors du bloc `mail`, une pièce jointe d'e-mail ne voyage plus en
 * octets** (plan `documentation/editeur-de-contenu/plan-service-e-mails.md`,
 * revue avec Hugo, cas 7 ; décidé le 2026-11-06 : « tout document envoyé est
 * l'exemplaire gardé »).
 *
 * Un PDF fabriqué en mémoire au moment de l'envoi part sans laisser de trace :
 * on ne peut plus relire ce qu'on a envoyé. L'appelant range d'abord la pièce
 * au stockage (`CustomerDocumentStore`, le seul que le bloc ouvre), puis la
 * demande ne porte que sa place, `pdfStored: { store, key }` ; le bloc la
 * relit à l'envoi.
 *
 * ## Ce que la porte refuse
 *
 * Le mot `pdfBase64` dans le code (commentaires blanchis) d'un fichier de
 * `apps/lfd-api/src/**.ts` HORS de `apps/lfd-api/src/mail/**` — où le
 * gabarit lit encore `pdfBase64`, après relecture de la pièce —, hors
 * `__tests__/` et `*.spec.ts`. Au 2026-11-06, ce mot n'a pas d'autre usage
 * que les données d'un modèle d'e-mail.
 *
 * ## La dette, datée
 *
 * {@link ADMITTED} : les envoyeurs qui joignent encore des octets, chacun avec
 * sa raison. Une entrée qui ne les joint plus fait échouer la porte : la
 * liste ne peut que décroître.
 *
 * Usage : `pnpm gate mail-attachment-by-reference`. Tests :
 * `node --test dev-toolbox/__tests__/mail-attachment-by-reference.test.mjs`.
 */
import { fileURLToPath } from "node:url";

import { sources } from "./mail-key-no-pii.mjs";
import { withoutComments } from "./mail-through-block.mjs";

const MAIL_BLOCK = "apps/lfd-api/src/mail/";

const BYTES = /\bpdfBase64\b/g;

/** Les envoyeurs qui joignent encore des octets, et pourquoi (2026-11-06). */
export const ADMITTED = new Map([
  [
    "apps/lfd-api/src/production/application/services/dossier-dispatch.service.ts",
    "le dossier du fournil est rangé au stockage du FOURNIL (`ProductionDocumentStore`), que le " +
      "bloc `mail` n'ouvre pas ; le ranger chez les pièces client contredirait le partage " +
      "« opposable / opérationnel » (`customer-document-store.ts`). En attente d'une décision " +
      "(revue, cas 7, 2026-11-06).",
  ],
]);

const lineOf = (source, index) => source.slice(0, index).split("\n").length;

/** Les lignes d'une source où `pdfBase64` apparaît dans le code. */
export function bytesLines(raw) {
  const source = withoutComments(raw);
  return [...source.matchAll(BYTES)].map((match) => lineOf(source, match.index));
}

/** Le verdict, pur. */
export function verdict(files, admitted = ADMITTED) {
  const failures = [];
  const stale = [];
  const debt = [];
  for (const { path, source } of files) {
    if (path.startsWith(MAIL_BLOCK)) continue;
    const lines = bytesLines(source);
    if (admitted.has(path)) {
      if (lines.length === 0) stale.push(path);
      else debt.push(path);
      continue;
    }
    for (const line of lines) {
      failures.push(
        `${path}:${line}  pièce jointe d'e-mail en octets (\`pdfBase64\`) — ce qui part doit être ` +
          "l'exemplaire gardé : range le PDF au stockage des pièces client " +
          "(`CustomerDocumentStore.save`) sous une clé sans donnée personnelle, puis joins sa place " +
          '(`pdfStored: { store: "customer-documents", key }`)',
      );
    }
  }
  const seen = new Set(files.map((file) => file.path));
  for (const path of admitted.keys()) {
    if (!seen.has(path)) stale.push(path);
  }
  for (const path of stale) {
    failures.push(
      `${path}  inscrit dans la liste admise mais ne joint plus d'octets — retire l'entrée de ` +
        "`ADMITTED` (dev-toolbox/gates/mail-attachment-by-reference.mjs) : la dette ne fait que décroître",
    );
  }
  return { failures, debt };
}

function main() {
  const files = sources(process.cwd());
  const { failures, debt } = verdict(files);
  if (failures.length > 0) {
    console.error("\n✗ mail-attachment-by-reference\n");
    for (const failure of failures) console.error(`  ${failure}`);
    console.error(`\n  ${failures.length} écart(s) (plan-service-e-mails.md, revue, cas 7).\n`);
    process.exit(1);
  }
  console.log(
    `✓ mail-attachment-by-reference : ${files.length} fichier(s) lus ; ` +
      `${debt.length} envoyeur(s) joignent encore des octets (dette datée) :`,
  );
  for (const path of debt) console.log(`    ${path}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
