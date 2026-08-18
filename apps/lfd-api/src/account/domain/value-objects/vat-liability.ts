import { legalFormRequiresVat, toLegalForm } from "@lfd/contracts";

/**
 * Règle **domaine** : une forme juridique impose-t-elle un numéro de TVA
 * intracommunautaire ?
 *
 * La table forme → assujettissement vit dans `@lfd/contracts`
 * (`legalFormRequiresVat`) : c'est un fait partagé, que les deux frontends
 * doivent connaître pour proposer la bonne liste et réclamer le bon champ. Ce
 * module n'en est que le point d'entrée côté serveur, et il ajoute la seule
 * chose qui appartient au serveur : quoi faire d'une saisie **hors catalogue**.
 *
 * Avant, la règle était une comparaison de chaînes contre une liste de
 * marqueurs (`"micro"`, `"auto entrepreneur"`…). Elle ratait tout ce qui n'était
 * pas écrit exactement ainsi : « auto entreprise » tombait du côté assujetti,
 * et l'écran réclamait une TVA à quelqu'un qui n'en a pas.
 */

/**
 * `true` si la forme juridique impose un numéro de TVA intracommunautaire.
 *
 * Hors catalogue ⇒ `true` : mieux vaut **inviter** à renseigner la TVA (l'écran
 * le signalera) que la laisser manquer en silence pour une société assujettie.
 * C'est le défaut prudent, et il ne concerne plus que le stock ancien — une
 * saisie neuve passe par la liste fermée.
 */
export function requiresVatNumber(formeJuridique: string): boolean {
  const form = toLegalForm(formeJuridique);
  return form === null ? true : legalFormRequiresVat(form);
}
