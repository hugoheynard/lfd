import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTAINER = join(HERE, "..");
const CONFIG = join(HERE, "../../src/infra/config");

/**
 * Les réglages qui **ne doivent pas** franchir le Worker, avec la raison. Une
 * liste nommée plutôt qu'un silence : les retirer est une décision qu'on relit.
 */
const NOT_FORWARDED: Readonly<Record<string, string>> = {
  // Posés par l'image (Dockerfile), pas par le Worker.
  PORT: "fixé par le Dockerfile",
  NODE_ENV: "fixé par le Dockerfile",
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
 * **Trois listes doivent s'accorder** : ce que le workflow pose sur le Worker,
 * ce que le Worker transmet au container, et ce que la configuration lit. La
 * deuxième avait dérivé de la troisième, sans que rien ne le dise : le container
 * démarrait sans stockage ni mailer, et le premier symptôme visible était un 500
 * au dépôt d'un KBIS — trois semaines après la dérive.
 *
 * Ce test ferme le maillon vérifiable en local. Le premier (GitHub) ne l'est
 * pas d'ici ; le workflow porte sa propre note.
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

  it("ne laisse aucun réglage de développement franchir le Worker", () => {
    const forwarded = new Set(forwardedKeys());
    const leaked = Object.keys(NOT_FORWARDED).filter((name) => forwarded.has(name));

    expect(leaked).toEqual([]);
  });
});
