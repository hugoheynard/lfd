/**
 * La **référence lisible** d'un objet — `P-K7M3QT`, `C-9P2X4B`, `R-7WT4NA`.
 *
 * Ce que l'humain lit, dicte au téléphone et relit sur une feuille : jamais la
 * clé technique. Le charset est l'intersection sûre de tout ce qu'une référence
 * traverse, et il est **sans caractères ambigus** — ni `I`, ni `O`, ni `0`, ni
 * `1` : c'est ce qui la rend dictable, et c'est le seul argument qui compte pour
 * une valeur qu'on épelle.
 *
 * ⚠️ **Deux générateurs la précèdent** et redéclarent le même alphabet : celui
 * des produits (`sku-generator.ts`) et celui des sociétés (dépôt Prisma du B2B).
 * Ce module est le troisième, et il existe pour que le quatrième n'ait pas lieu.
 * Les deux premiers devraient converger ici ; ils n'ont pas été touchés parce
 * que les migrer demande de rejouer leur unicité, ce qui n'est pas le sujet du
 * jour. C'est une dette, elle est nommée.
 */

/** 32 symboles, donc 5 bits par caractère. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** 6 symboles = 30 bits ≈ 33 millions de combinaisons. */
const CODE_LENGTH = 6;

/**
 * Nombre de chiffres hexadécimaux lus en QUEUE de l'identifiant.
 *
 * La queue d'un UUID v7 est sa composante aléatoire ; son préfixe est
 * l'horodatage, et le lire produirait des références voisines pour deux objets
 * créés la même milliseconde. 12 chiffres = 48 bits, dont on consomme 30 : 2⁴⁸
 * étant un multiple de 2³⁰, la troncature reste **uniforme**, sans biais de
 * modulo.
 */
const TAIL_HEX_LENGTH = 12;

/**
 * Une référence dérivée d'un identifiant opaque.
 *
 * **Dérivée et non tirée au sort** : deux appels sur le même identifiant rendent
 * la même référence, donc un rejeu n'invente pas une seconde identité pour le
 * même objet. L'unicité vient de celle de l'identifiant, pas d'un compteur — et
 * c'est ce qui la met à l'abri de la course qu'un « numéro suivant » impose
 * (lire le dernier, ajouter un, écrire : deux écritures simultanées calculent le
 * même).
 */
export function referenceFrom(prefix: string, id: string): string {
  const hex = id.replace(/[^0-9a-f]/giu, "");
  const tail = hex.slice(-TAIL_HEX_LENGTH);
  let value = BigInt(`0x${tail === "" ? "0" : tail}`);
  let code = "";
  for (let index = 0; index < CODE_LENGTH; index += 1) {
    code = ALPHABET[Number(value % 32n)] + code;
    value /= 32n;
  }
  return `${prefix}-${code}`;
}
