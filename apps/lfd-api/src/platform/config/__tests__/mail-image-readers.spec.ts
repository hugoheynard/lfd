import { optionalR2Storage } from "../env-readers.js";
import { optionalMailPublicBaseUrl } from "../mail-image-readers.js";

/**
 * Ce test écrit `process.env` — il est dans l'allowlist ESLint, comme ses
 * voisins, parce qu'il vérifie le lecteur qui en a le monopole. Les clés sont
 * restaurées après chaque cas (`--runInBand`).
 */
const TOUCHED = [
  "R2_MAIL_PUBLIC_BASE_URL",
  "R2_MAIL_BUCKET",
  "R2_MAIL_ACCESS_KEY_ID",
  "R2_MAIL_SECRET_ACCESS_KEY",
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

describe("les réglages des images d'e-mail (plan du service d'e-mails, § 24)", () => {
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

  it("rien de posé ⇒ l'app démarre : ni stockage, ni adresse", () => {
    expect(optionalR2Storage("mail")).toEqual({ config: null, missing: [] });
    expect(optionalMailPublicBaseUrl()).toBeNull();
  });

  it("l'usage `mail` lit SES variables, et nomme celle qui manque", () => {
    set({ R2_MAIL_BUCKET: "lfc-mail", R2_MAIL_ACCESS_KEY_ID: "id" });

    expect(optionalR2Storage("mail").missing).toEqual(["R2_MAIL_SECRET_ACCESS_KEY"]);
  });

  it("l'adresse publique perd sa barre finale ; le clair public est refusé", () => {
    set({ R2_MAIL_PUBLIC_BASE_URL: "https://mail-images.lafoliecoffee.info/" });
    expect(optionalMailPublicBaseUrl()).toBe("https://mail-images.lafoliecoffee.info");

    set({ R2_MAIL_PUBLIC_BASE_URL: "http://mail-images.lafoliecoffee.info" });
    expect(optionalMailPublicBaseUrl()).toBeNull();
  });
});
