/**
 * La **référence lisible** d'un objet — `P-K7M3QT`, `C-9P2X4B`, `R-7WT4NA`.
 *
 * Ce que l'humain lit, dicte au téléphone et relit sur une feuille de
 * production : jamais la clé technique. L'alphabet est **sans caractères
 * ambigus** — ni `I`, ni `O`, ni `0`, ni `1` : c'est ce qui la rend dictable, et
 * c'est le seul argument qui compte pour une valeur qu'on épelle.
 *
 * Ce module est la **seule** déclaration de cet alphabet. Il l'a été après coup :
 * les produits et les sociétés le redéclaraient chacun de leur côté, avec deux
 * dérivations différentes, et la troisième famille (les révisions) allait en
 * ajouter une quatrième. Deux déclarations indépendantes du même ensemble
 * divergent toujours — c'est exactement ce qui était en train d'arriver.
 */

/** 32 symboles, donc 5 bits par caractère. */
const READABLE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * Alphabet Crockford base32 des ULID (il exclut `I`, `L`, `O`, `U`).
 *
 * Même cardinal que celui du dessus : le remappage est une **bijection
 * index-à-index**, donc il ne perd rien de l'entropie de l'identifiant. C'est
 * la raison de le préférer à une lecture hexadécimale de l'identifiant, qui
 * jetterait silencieusement les symboles hors de `[0-9a-f]` — soit la moitié de
 * l'alphabet d'un ULID.
 */
const ULID_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** 6 symboles = 30 bits ≈ 33 millions de combinaisons. */
const CODE_LENGTH = 6;

/**
 * Une référence dérivée d'un identifiant opaque.
 *
 * On lit la **queue** de l'identifiant : celle d'un ULID est sa composante
 * aléatoire, là où sa tête est l'horodatage — la lire produirait des références
 * voisines pour deux objets créés la même milliseconde.
 *
 * **Dérivée et non tirée au sort** : deux appels sur le même identifiant rendent
 * la même référence, donc un rejeu n'invente pas une seconde identité pour le
 * même objet. L'unicité vient de celle de l'identifiant, pas d'un compteur — et
 * c'est ce qui la met à l'abri de la course qu'un « numéro suivant » impose
 * (lire le dernier, ajouter un, écrire : deux écritures simultanées calculent le
 * même). L'index `@unique` de la colonne reste la garantie finale.
 *
 * Un symbole hors alphabet ULID est projeté sur le premier symbole lisible
 * plutôt que de faire échouer la dérivation : un identifiant est une chaîne
 * opaque, pas une structure que ce module aurait le droit d'exiger — le
 * générateur déterministe des tests, lui, ne rend pas des ULID.
 */
export function referenceFrom(prefix: string, id: string): string {
  const tail = id.toUpperCase().slice(-CODE_LENGTH).padStart(CODE_LENGTH, ULID_ALPHABET[0]);
  let code = "";
  for (const symbol of tail) {
    const index = ULID_ALPHABET.indexOf(symbol);
    code += index >= 0 ? READABLE_ALPHABET[index] : READABLE_ALPHABET[0];
  }
  return `${prefix}-${code}`;
}
