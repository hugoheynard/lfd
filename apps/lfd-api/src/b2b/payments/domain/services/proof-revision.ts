import { createHash } from "node:crypto";

/** Assez pour distinguer deux dépôts d'un même mandat ; trop court pour rien d'autre. */
const REVISION_LENGTH = 16;

/**
 * La **révision** d'une pièce de mandat : une empreinte opaque de sa clé de
 * stockage, vide quand aucune pièce n'est déposée.
 *
 * Elle existe pour que la signature dise **quelle pièce a été relue** (plan
 * `documentation/comptabilite/plan-restes-du-mandat.md` §7 #9) : un scan remplacé
 * entre l'ouverture de la fiche et la déclaration de signature activerait sinon
 * un mandat sur un papier que personne n'a regardé.
 *
 * 🔴 **Jamais la clé elle-même.** La clé nomme un objet du bucket ; la faire
 * voyager jusqu'à l'écran ferait d'une donnée d'infrastructure un paramètre que
 * le client renvoie. Une empreinte se compare, elle ne désigne rien.
 */
export function proofRevisionOf(storageKey: string | null): string {
  if (storageKey === null) {
    return "";
  }
  return createHash("sha256").update(storageKey).digest("hex").slice(0, REVISION_LENGTH);
}
