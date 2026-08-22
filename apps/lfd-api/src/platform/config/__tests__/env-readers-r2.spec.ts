import { optionalR2Storage } from "../env-readers.js";

/**
 * Ce test écrit `process.env` — il est dans l'allowlist ESLint, comme
 * `app-config.spec.ts`, parce qu'il vérifie précisément le lecteur qui en a le
 * monopole. Les clés touchées sont restaurées après chaque cas : l'env est
 * partagé entre les suites (`--runInBand`).
 */
const TOUCHED = [
  "R2_MEDIA_BUCKET",
  "R2_MEDIA_ACCESS_KEY_ID",
  "R2_MEDIA_SECRET_ACCESS_KEY",
  "R2_MEDIA_ENDPOINT",
  "R2_ENDPOINT",
] as const;

function set(values: Partial<Record<(typeof TOUCHED)[number], string>>): void {
  for (const name of TOUCHED) {
    const value = values[name];
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
}

describe("optionalR2Storage — les trois états d'un stockage", () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = {};
    for (const key of TOUCHED) {
      saved[key] = process.env[key];
    }
    set({});
  });

  afterEach(() => {
    for (const key of TOUCHED) {
      const value = saved[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it("rien de posé ⇒ absent, et RIEN à signaler", () => {
    // Le cas du poste de dev et de la CI : c'est un choix, pas un accident.
    expect(optionalR2Storage("media")).toEqual({ config: null, missing: [] });
  });

  it("tout posé ⇒ utilisable", () => {
    set({
      R2_MEDIA_BUCKET: "lfc-media",
      R2_MEDIA_ACCESS_KEY_ID: "id",
      R2_MEDIA_SECRET_ACCESS_KEY: "secret",
    });

    const state = optionalR2Storage("media");

    expect(state.missing).toEqual([]);
    expect(state.config).toMatchObject({ bucket: "lfc-media", accessKeyId: "id" });
  });

  it("À MOITIÉ posé ⇒ l'usage s'éteint, mais le DÉMARRAGE survit", () => {
    // Le cœur du correctif. Ceci LEVAIT, et faisait donc échouer le boot de
    // toute l'API — pour une séquence de déploiement parfaitement ordinaire :
    // poser les variables, puis le secret.
    set({ R2_MEDIA_BUCKET: "lfc-media" });

    expect(() => optionalR2Storage("media")).not.toThrow();
    expect(optionalR2Storage("media").config).toBeNull();
  });

  it("nomme les variables manquantes — sinon c'est la panne silencieuse", () => {
    set({ R2_MEDIA_BUCKET: "lfc-media", R2_MEDIA_ACCESS_KEY_ID: "id" });

    expect(optionalR2Storage("media").missing).toEqual(["R2_MEDIA_SECRET_ACCESS_KEY"]);
  });

  it("ne divulgue jamais une VALEUR, seulement des noms", () => {
    set({ R2_MEDIA_BUCKET: "lfc-media", R2_MEDIA_ACCESS_KEY_ID: "un-secret-qui-fuite" });

    const { missing } = optionalR2Storage("media");

    expect(missing.join(" ")).not.toContain("un-secret-qui-fuite");
  });

  it("prend l'endpoint de l'usage, qui l'emporte sur le repli commun", () => {
    // Les deux buckets sont de juridictions différentes : une seule adresse ne
    // peut pas les servir tous les deux.
    set({
      R2_ENDPOINT: "https://compte.eu.r2.cloudflarestorage.com",
      R2_MEDIA_ENDPOINT: "https://compte.r2.cloudflarestorage.com",
      R2_MEDIA_BUCKET: "lfc-media",
      R2_MEDIA_ACCESS_KEY_ID: "id",
      R2_MEDIA_SECRET_ACCESS_KEY: "secret",
    });

    expect(optionalR2Storage("media").config?.endpoint).toBe(
      "https://compte.r2.cloudflarestorage.com",
    );
  });
});
