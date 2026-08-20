// Génère `src/app/auth/auth.env.generated.ts` (git-ignored) depuis l'environnement,
// AVANT `ng serve` / `ng build`. Source des valeurs :
//   - **dev local** : le fichier `.env` de cette app (copié de `.env.example`) ;
//   - **déployé** : les variables de build CI / Cloudflare Pages (`process.env`).
// `process.env` a la priorité sur `.env` (le déployé gagne). Ces valeurs sont
// PUBLIQUES (domaine, clientId SPA, audience) — jamais un secret ici.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '..');
const envPath = resolve(appRoot, '.env');
const outPath = resolve(appRoot, 'src/app/auth/auth.env.generated.ts');

/** Parse minimal d'un fichier `.env` (KEY=VALUE, quotes optionnelles, `#` = commentaire). */
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

// process.env (CI/shell) gagne sur le fichier .env.
const read = (key) => (process.env[key] ?? fileVars[key] ?? '').trim();

const KEYS = ['AUTH0_DOMAIN', 'AUTH0_CLIENT_ID', 'AUTH0_AUDIENCE', 'API_BASE_URL', 'ADMIN_BASE_URL'];

// Réglages FACULTATIFS : leur absence éteint une fonction, elle ne casse rien.
// Ils ne figurent donc pas dans l'avertissement — une alerte qui sonne à chaque
// build de dev pour un choix délibéré apprend à ignorer les alertes.
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
  `  domain: ${JSON.stringify(values.AUTH0_DOMAIN)},\n` +
  `  clientId: ${JSON.stringify(values.AUTH0_CLIENT_ID)},\n` +
  `  audience: ${JSON.stringify(values.AUTH0_AUDIENCE)},\n` +
  `  apiBaseUrl: ${JSON.stringify(values.API_BASE_URL)},\n` +
  `  adminBaseUrl: ${JSON.stringify(values.ADMIN_BASE_URL)},\n` +
  // Vide = Sentry n'est pas branché, et l'app démarre sans lui. Une clé
  // publique par nature (elle voyage dans le bundle) : ce n'est pas un secret,
  // c'est une adresse de dépôt.
  `  sentryDsn: ${JSON.stringify(values.SENTRY_DSN)},\n` +
  '} as const;\n';

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, banner + body);
console.log(`[auth-config] écrit ${outPath}`);
