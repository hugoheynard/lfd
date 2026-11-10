/**
 * **Le texte libre d'un fichier bancaire SEPA** : translittéré au jeu restreint,
 * puis coupé à la borne du champ. UNE règle, que le `pain.008` et les exports
 * bancaires lisent ; une borne recopiée en dur dans chaque rendu finit par
 * diverger de celle du voisin.
 *
 * ## Les bornes
 *
 * | Constante            | Valeur | D'où elle vient                                            |
 * | -------------------- | ------ | ---------------------------------------------------------- |
 * | `SEPA_MAX35_TEXT`    | 35     | XSD `pain.008.001.02` — `Max35Text` (`MsgId`, `MndtId`…)   |
 * | `SEPA_NAME_MAX`      | 70     | guides EPC (AT-03, AT-14) — le nom d'une partie            |
 * | `SEPA_MAX140_TEXT`   | 140    | XSD `pain.008.001.02` — `Max140Text` (`Ustrd`)             |
 *
 * ⚠️ Le XSD ISO du dépôt (`test/fixtures/pain008/pain.008.001.02.xsd`) type
 * `PartyIdentification32/Nm` en **`Max140Text`**, pas en `Max70Text` (vérifié
 * le 2026-10-23, ligne 573) : la borne de 70 est celle des guides de mise en
 * œuvre SEPA, que les banques appliquent par-dessus l'ISO. Un nom de 120
 * caractères passe donc le XSD — c'est la banque qui le refuse, et la remise
 * entière avec lui. Décision de Hugo (2026-10-23) : couper à 70.
 */

/** `Max35Text` : identifiants (`MsgId`, `PmtInfId`, `EndToEndId`, `MndtId`). */
export const SEPA_MAX35_TEXT = 35;

/** Le nom d'une partie (`Nm` du créancier, du débiteur) — borne EPC, cf. module. */
export const SEPA_NAME_MAX = 70;

/** `Max140Text` : le libellé non structuré (`Ustrd`). */
export const SEPA_MAX140_TEXT = 140;

/** Ce que la norme accepte dans un texte SEPA : ni accent, ni symbole exotique. */
const SEPA_ALLOWED = /[^A-Za-z0-9/\-?:().,'+ ]/gu;

/**
 * Le jeu restreint SEPA — et l'échappement XML par la même occasion : `&`, `<`,
 * `>` et `"` sont hors du jeu et deviennent une espace, la sortie n'a donc
 * jamais rien à échapper. Les accents sont décomposés puis retirés (« Isère » →
 * « Isere »), le reste hors du jeu devient une espace, jamais rien.
 */
export function sepa(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/gu, "")
    .replace(SEPA_ALLOWED, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

/**
 * Un texte libre borné : `sepa()` PUIS la coupe à `limit`, sans espace final.
 *
 * La coupe se fait après la translittération (un « é » compte pour un « e ») et
 * ne peut pas tomber au milieu d'une entité XML : `sepa()` n'en laisse aucune.
 * Réservée aux TEXTES — un identifiant ne se coupe jamais, il se refuse.
 */
export function sepaText(raw: string, limit: number): string {
  return sepa(raw).slice(0, limit).trimEnd();
}
