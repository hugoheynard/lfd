// Génère `src/app/auth/auth.env.generated.ts` (git-ignored) depuis l'environnement,
// AVANT `ng serve` / `ng build`. Source : `.env` en dev local, variables CI/Cloudflare
// en déployé (`process.env` gagne). Valeurs PUBLIQUES (domaine, clientId SPA de la
// Suite, audiences par backend) — jamais un secret.
//
// La Suite est un SPA staff à session unique : un `domain`/`clientId`, mais **plusieurs
// audiences** (une par backend adressé). Cf. `src/app/auth/auth.config.ts`.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '..');
const envPath = resolve(appRoot, '.env');
const outPath = resolve(appRoot, 'src/app/auth/auth.env.generated.ts');

function parseDotenv(text) {
  const out = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) {
      continue;
    }
    const eq = trimmed.indexOf('=');
    if (eq === -1) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    const quoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"));
    if (quoted) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const fileVars = existsSync(envPath)
  ? parseDotenv(readFileSync(envPath, 'utf8'))
  : {};

const read = (key) => (process.env[key] ?? fileVars[key] ?? '').trim();

const KEYS = [
  'SUITE_AUTH0_DOMAIN',
  'SUITE_AUTH0_CLIENT_ID',
  'SUITE_AUTH0_AUDIENCE_SELF',
  'SUITE_AUTH0_AUDIENCE_B2B',
  'SUITE_AUTH0_AUDIENCE_B2B_ADMIN',
];
// Réglage FACULTATIF : son absence éteint une fonction, elle ne casse rien —
// il ne figure donc pas dans l'avertissement des variables manquantes.
const OPTIONAL_KEYS = ['SENTRY_DSN'];

const values = Object.fromEntries([...KEYS, ...OPTIONAL_KEYS].map((key) => [key, read(key)]));

const missing = KEYS.filter((key) => values[key] === '');
if (missing.length > 0) {
  console.warn(
    `[auth-config] variables manquantes : ${missing.join(', ')} — valeurs vides écrites ` +
      `(OK en dev bypass ; À RENSEIGNER pour un vrai build Auth0).`,
  );
}

const banner =
  '// ⚠️ GÉNÉRÉ — ne pas éditer, ne pas committer (git-ignored).\n' +
  '// Produit par scripts/generate-auth-config.mjs depuis l’environnement\n' +
  '// (.env en dev local, variables CI/Cloudflare en déployé).\n\n';

const body =
  'export const AUTH_ENV = {\n' +
  `  domain: ${JSON.stringify(values.SUITE_AUTH0_DOMAIN)},\n` +
  `  clientId: ${JSON.stringify(values.SUITE_AUTH0_CLIENT_ID)},\n` +
  '  audiences: {\n' +
  `    self: ${JSON.stringify(values.SUITE_AUTH0_AUDIENCE_SELF)},\n` +
  `    b2b: ${JSON.stringify(values.SUITE_AUTH0_AUDIENCE_B2B)},\n` +
  `    b2bAdmin: ${JSON.stringify(values.SUITE_AUTH0_AUDIENCE_B2B_ADMIN)},\n` +
  '  },\n' +
  // Vide = Sentry n'est pas branché et l'app démarre sans lui. Publique par
  // nature (elle voyage dans le bundle) : ce n'est pas un secret.
  `  sentryDsn: ${JSON.stringify(values.SENTRY_DSN)},\n` +
  '} as const;\n';

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, banner + body);
console.log(`[auth-config] écrit ${outPath}`);
