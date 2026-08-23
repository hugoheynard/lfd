import { optionalMediaPublicBaseUrl } from "../env-readers.js";

/**
 * Ce test écrit `process.env` — il est dans l'allowlist ESLint, comme ses
 * voisins, parce qu'il vérifie le lecteur qui en a le monopole. La clé est
 * restaurée après chaque cas : l'env est partagé entre les suites
 * (`--runInBand`).
 */
const NAME = "R2_MEDIA_PUBLIC_BASE_URL";

describe("optionalMediaPublicBaseUrl", () => {
  let saved: string | undefined;

  beforeEach(() => {
    saved = process.env[NAME];
  });

  afterEach(() => {
    if (saved === undefined) {
      delete process.env[NAME];
    } else {
      process.env[NAME] = saved;
    }
  });

  function read(value: string | undefined): string | null {
    if (value === undefined) {
      delete process.env[NAME];
    } else {
      process.env[NAME] = value;
    }
    return optionalMediaPublicBaseUrl();
  }

  it("accepte une adresse https et retire la barre finale", () => {
    expect(read("https://media.lafoliecoffee.info/")).toBe("https://media.lafoliecoffee.info");
  });

  /**
   * Sans ces deux cas, le MinIO de `docker-compose.dev.yml` est inerte : il sert
   * en clair sur la boucle locale, l'URL est rejetée, et le dépôt d'image refuse
   * en annonçant un stockage « à moitié configuré ».
   */
  it.each([
    "http://localhost:9100/lfc-media-dev",
    "http://127.0.0.1:9100/lfc-media-dev",
    "http://localhost/media",
  ])("accepte %s — en boucle locale, il n’y a pas de TLS à avoir", (url) => {
    expect(read(url)).toBe(url);
  });

  // L'exception est réservée au bouclage : une adresse publique en clair
  // resterait servie à des navigateurs, et ça ne se rattrape pas.
  it("refuse une adresse publique en clair", () => {
    expect(read("http://media.lafoliecoffee.info")).toBeNull();
  });

  // L'hôte est lu, pas préfixé : `localhost.exemple.fr` commence par
  // « localhost » et n'est la machine de personne.
  it("refuse un hôte qui imite la boucle locale", () => {
    expect(read("http://localhost.exemple.fr/media")).toBeNull();
  });

  it("refuse ce qui n’est pas une adresse", () => {
    expect(read("media.lafoliecoffee.info")).toBeNull();
  });

  it("rend null quand la variable est absente", () => {
    expect(read(undefined)).toBeNull();
  });
});
