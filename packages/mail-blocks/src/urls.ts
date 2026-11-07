const HTTPS_PROTOCOL = "https:";

/** Une adresse absolue en `https://` ? Une adresse illisible ne l'est pas. */
export function isHttpsUrl(candidate: string): boolean {
  try {
    return new URL(candidate).protocol === HTTPS_PROTOCOL;
  } catch {
    return false;
  }
}

/**
 * Les hôtes de la boucle locale : en développement, la médiathèque sert ses
 * images en `http://localhost` (la règle de l'adresse publique des buckets,
 * `env-readers.ts` côté API — recopiée ici parce que le paquet est une feuille).
 */
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Une adresse d'image admise : `https://`, ou `http://` sur la boucle locale. */
export function isImageSourceUrl(candidate: string): boolean {
  if (isHttpsUrl(candidate)) {
    return true;
  }
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "http:" && LOOPBACK_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}
