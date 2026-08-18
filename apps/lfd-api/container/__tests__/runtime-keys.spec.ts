import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTAINER = join(HERE, "..");
const CONFIG = join(HERE, "../../src/infra/config");
const WORKFLOW = join(HERE, "../../../../.github/workflows/deploy_b2b_backend.yml");

/**
 * Les réglages que le déploiement **ne pose pas**, avec la raison — même
 * discipline que {@link NOT_FORWARDED} : une liste nommée plutôt qu'un silence.
 */
const NOT_DEPLOYED: Readonly<Record<string, string>> = {
  // Alias de repli historique : la clé réelle est `RESEND_MAILER_B2B_API_KEY`,
  // et le code accepte l'autre nom pour ne pas casser un environnement existant.
  // Poser les deux depuis la CI donnerait deux sources pour une seule valeur.
  RESEND_API_KEY: "alias de repli — la CI ne pose que RESEND_MAILER_B2B_API_KEY",
};

/**
 * Les réglages qui **ne doivent pas** franchir le Worker, avec la raison. Une
 * liste nommée plutôt qu'un silence : les retirer est une décision qu'on relit.
 */
const NOT_FORWARDED: Readonly<Record<string, string>> = {
  // Posés par l'image (Dockerfile), pas par le Worker.
  PORT: "fixé par le Dockerfile",
  NODE_ENV: "fixé par le Dockerfile",
  // GRAVÉE dans l'image au build, et c'est tout l'intérêt : transmise par le
  // Worker, elle pourrait changer sans que l'image change, et l'instance
  // mentirait sur la version qu'elle sert.
  APP_REVISION: "gravée dans l'image — sinon /health pourrait mentir",
  // Le bypass d'authentification staff et l'impersonation n'existent qu'en
  // développement local. Les transmettre serait leur donner un chemin vers la
  // production — que `optionalAdminDevBypass` refuse déjà, mais on ne compte
  // pas sur un seul rempart pour ça.
  AUTH_ADMIN_DEV_BYPASS: "développement local uniquement — jamais en production",
  AUTH_DEV_IMPERSONATE: "développement local uniquement",
  AUTH_DEV_IMPERSONATE_SUBJECT: "développement local uniquement",
};

/** Les noms que le Worker accepte de transmettre au container. */
function forwardedKeys(): string[] {
  const source = readFileSync(join(CONTAINER, "worker.ts"), "utf8");
  const block = /const RUNTIME_KEYS = \[([\s\S]*?)\] as const;/.exec(source);
  if (block === null) {
    throw new Error("RUNTIME_KEYS introuvable dans container/worker.ts");
  }
  return [...block[1].matchAll(/"([A-Z0-9_]+)"/g)].map((match) => match[1]);
}

/**
 * Les noms que la configuration lit réellement.
 *
 * Lus dans la SOURCE et non importés : `env-readers.ts` est le seul endroit du
 * backend autorisé à toucher `process.env` (règle ESLint `no-restricted-properties`),
 * donc ces deux fichiers sont exhaustifs — et une constante ajoutée dans une
 * table (`R2_SETTINGS`) compte autant qu'un appel direct.
 */
function configuredKeys(): string[] {
  const sources = ["env-readers.ts", "app-config.ts"].map((file) =>
    readFileSync(join(CONFIG, file), "utf8"),
  );
  const names = sources.flatMap((source) =>
    [...source.matchAll(/"([A-Z][A-Z0-9_]{2,})"/g)].map((match) => match[1]),
  );
  return [...new Set(names)].sort();
}

/**
 * Les noms que le déploiement pose réellement sur le Worker.
 *
 * La source est la **boucle `for name in …`** du workflow, et non son bloc
 * `env:` : c'est elle qui décide ce qui part chez `wrangler secret put`. Un nom
 * déclaré dans `env:` mais absent de la boucle n'atteint jamais le Worker —
 * exactement le piège qu'on ferme ici.
 */
function deployedKeys(): string[] {
  const source = readFileSync(WORKFLOW, "utf8");
  // Le premier nom ancre la vraie boucle : l'en-tête du workflow cite
  // « `for name in …` » en prose, et sans cette ancre c'est elle qu'on lirait.
  const loop = /for name in ([A-Z][\s\S]*?); do/.exec(source);
  if (loop === null) {
    throw new Error("Boucle `for name in …` introuvable dans le workflow de déploiement");
  }
  return [...loop[1].matchAll(/[A-Z][A-Z0-9_]{2,}/g)].map((match) => match[0]);
}

/**
 * **Trois listes doivent s'accorder** : ce que le workflow pose sur le Worker,
 * ce que le Worker transmet au container, et ce que la configuration lit. La
 * deuxième avait dérivé de la troisième, sans que rien ne le dise : le container
 * démarrait sans stockage ni mailer, et le premier symptôme visible était un 500
 * au dépôt d'un KBIS — trois semaines après la dérive.
 *
 * Les trois maillons sont vérifiables d'ici : les deux fichiers de code, ET le
 * workflow, qui vit dans le dépôt. Ce qui reste hors de portée est seulement la
 * VALEUR posée dans GitHub — pas la liste des noms.
 */
describe("les variables transmises au container", () => {
  it("couvre TOUT ce que la configuration lit", () => {
    const forwarded = new Set(forwardedKeys());
    const missing = configuredKeys().filter(
      (name) => !forwarded.has(name) && !(name in NOT_FORWARDED),
    );

    expect(missing).toEqual([]);
  });

  it("ne transmet rien que la configuration ne lise", () => {
    // L'autre sens compte autant : un nom mort dans la liste donne l'illusion
    // qu'un réglage est branché. C'est exactement ce qu'ont fait les cinq
    // `STORAGE_*` — présents, transmis, et lus par personne.
    const configured = new Set(configuredKeys());
    const dead = forwardedKeys().filter((name) => !configured.has(name));

    expect(dead).toEqual([]);
  });

  it("est posé par le déploiement, sinon le Worker n'a rien à transmettre", () => {
    // Le maillon le plus discret des trois : un nom peut être lu par la config,
    // transmis par le Worker, et n'être jamais POSÉ. Le réglage est alors
    // parfaitement branché — sur du vide. C'était le cas de `MAILER_REPLY_TO`
    // et `AUTH0_CUSTOMER_CONNECTION` la veille de la mise en production.
    const deployed = new Set(deployedKeys());
    const never = forwardedKeys().filter((name) => !deployed.has(name) && !(name in NOT_DEPLOYED));

    expect(never).toEqual([]);
  });

  it("ne pose rien que le Worker ne transmette", () => {
    const forwarded = new Set(forwardedKeys());
    const wasted = deployedKeys().filter((name) => !forwarded.has(name));

    expect(wasted).toEqual([]);
  });

  it("ne laisse aucun réglage de développement franchir le Worker", () => {
    const forwarded = new Set(forwardedKeys());
    const leaked = Object.keys(NOT_FORWARDED).filter((name) => forwarded.has(name));

    expect(leaked).toEqual([]);
  });
});
