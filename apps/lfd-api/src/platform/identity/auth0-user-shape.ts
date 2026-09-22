/**
 * La **forme réseau** des utilisateurs Auth0, lue défensivement.
 *
 * Séparée de la passerelle parce que ce sont deux raisons de changer : ici on
 * ne sait rien des gestes (ouvrir un accès, rattacher, détacher), seulement
 * qu'une réponse JSON peut avoir n'importe quelle tête. Chaque lecteur exclut
 * plutôt que de retenir à tort — une réponse qui surprend fait disparaître une
 * entrée de la liste, elle n'en invente jamais une.
 *
 * Aucun de ces lecteurs ne lève : c'est l'appelant qui décide si le vide est
 * une panne.
 */

/**
 * Une **méthode de connexion** rattachée à un compte, telle qu'Auth0 la décrit.
 *
 * `provider` et `userId` forment ensemble l'adresse d'une identité chez le
 * fournisseur : ce sont les deux segments que le détachement exige. Ils ne
 * valent rien seuls, et ne sortent pas d'ici sans raison.
 */
export interface LinkedIdentity {
  /** La stratégie — `auth0`, `google-oauth2`, `facebook`. */
  readonly provider: string;
  /** L'identifiant **chez le fournisseur**, sans le préfixe de stratégie. */
  readonly userId: string;
  /** La base d'utilisateurs visée ; absente sur certaines connexions sociales. */
  readonly connection: string | null;
  /** Vrai pour l'identité qui porte le compte — elle ne se détache jamais. */
  readonly isPrimary: boolean;
}

/**
 * Le tableau `identities` d'un utilisateur Auth0, lu défensivement.
 *
 * Une forme qui surprend rend une liste vide plutôt qu'une entrée bancale :
 * l'écran affichera « rien à montrer », jamais une méthode de connexion qui
 * n'existe pas.
 */
export function linkedIdentitiesOf(raw: unknown): readonly LinkedIdentity[] {
  const identities: unknown = readProperty(raw, "identities");
  return identitiesFromArray(identities, readUserId(raw));
}

/**
 * Les mêmes identités, quand le fournisseur rend **directement** le tableau —
 * c'est ce que répondent le rattachement et le détachement.
 *
 * `primarySubject` sert à désigner la principale : le sujet d'un compte vaut
 * toujours `<provider>|<userId>` de son identité porteuse, ce qui se vérifie
 * sur la même charge plutôt que de se déduire d'un ordre de tableau.
 */
export function identitiesFromArray(
  raw: unknown,
  primarySubject: string | null,
): readonly LinkedIdentity[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const identities: LinkedIdentity[] = [];
  for (const entry of raw) {
    const provider = readString(entry, "provider");
    const userId = readIdentifier(entry, "user_id");
    if (provider === null || userId === null) {
      continue;
    }
    identities.push({
      provider,
      userId,
      connection: readString(entry, "connection"),
      isPrimary: primarySubject !== null && `${provider}|${userId}` === primarySubject,
    });
  }
  return identities;
}

/**
 * Un identifiant venu du réseau, chaîne **ou** nombre.
 *
 * Certaines connexions sociales rendent le `user_id` en JSON numérique ; le
 * refuser ferait disparaître l'identité de la liste, donc la rendrait
 * impossible à détacher.
 */
function readIdentifier(raw: unknown, key: string): string | null {
  const value = readProperty(raw, key);
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return typeof value === "string" && value !== "" ? value : null;
}

/** Les connexions d'une identité, telles qu'Auth0 les nomme. */
export function connectionsOf(raw: unknown): readonly string[] {
  const identities: unknown = readProperty(raw, "identities");
  if (!Array.isArray(identities)) {
    return [];
  }
  return identities
    .map((identity) => readString(identity, "connection"))
    .filter((name): name is string => name !== null);
}

/**
 * Cet utilisateur Auth0 a-t-il une identité sur **cette** connexion ?
 *
 * Forme lue de façon défensive : elle vient du réseau, et une réponse qui
 * surprend doit exclure l'utilisateur plutôt que de le retenir à tort.
 */
export function usesConnection(raw: unknown, connection: string): boolean {
  const identities: unknown = readProperty(raw, "identities");
  if (!Array.isArray(identities)) {
    return false;
  }
  return identities.some((identity) => readString(identity, "connection") === connection);
}

/** `user_id` d'un objet utilisateur Auth0, ou `null` si la forme surprend. */
export function readUserId(raw: unknown): string | null {
  return readString(raw, "user_id");
}

/** Une propriété chaîne non vide d'un objet venu du réseau. */
export function readString(raw: unknown, key: string): string | null {
  const value = readProperty(raw, key);
  return typeof value === "string" && value !== "" ? value : null;
}

/** Une propriété quelconque d'un objet venu du réseau — `undefined` sinon. */
function readProperty(raw: unknown, key: string): unknown {
  if (typeof raw !== "object" || raw === null) {
    return undefined;
  }
  const record: Record<string, unknown> = { ...raw };
  return record[key];
}
