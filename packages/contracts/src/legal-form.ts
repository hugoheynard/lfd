import { z } from "zod";

/**
 * Le catalogue **fermé** des formes juridiques, et ce qu'elles impliquent.
 *
 * C'était du texte libre : on tapait « SAS », « S.A.S. », « auto entreprise »,
 * et l'assujettissement à la TVA se devinait par comparaison de chaînes. Une
 * saisie hors liste tombait du mauvais côté sans que personne le voie — un
 * compte réclamait un numéro de TVA à un auto-entrepreneur, ou n'en réclamait
 * pas à une société.
 *
 * La forme juridique n'est pas une opinion : c'est une liste. La poser en
 * énumération **verrouille le comportement** — le lien forme → TVA devient une
 * table qu'on lit, plus une heuristique qu'on espère.
 *
 * Ce module est du contrat pur (aucune dépendance) : le backend l'applique, les
 * deux frontends en dérivent leur liste déroulante, et personne ne recopie la
 * règle.
 */

/** Les formes reconnues. Ordre d'affichage — les plus courantes d'abord. */
export const legalFormSchema = z.enum([
  "sas",
  "sasu",
  "sarl",
  "eurl",
  "sa",
  "snc",
  "sci",
  "scop",
  "association",
  "ei",
  "micro",
  "auto_entrepreneur",
]);
export type LegalForm = z.infer<typeof legalFormSchema>;

/** Le libellé affiché. Les valeurs vivent en clé, le français reste à l'écran. */
export const LEGAL_FORM_LABELS: Readonly<Record<LegalForm, string>> = {
  sas: "SAS",
  sasu: "SASU",
  sarl: "SARL",
  eurl: "EURL",
  sa: "SA",
  snc: "SNC",
  sci: "SCI",
  scop: "SCOP",
  association: "Association",
  ei: "Entreprise individuelle",
  micro: "Micro-entreprise",
  auto_entrepreneur: "Auto-entrepreneur",
};

/**
 * Les formes **non assujetties** par défaut — franchise en base de TVA.
 *
 * Approximation assumée, et c'est le point : elle est désormais écrite noir sur
 * blanc, à un seul endroit. Un cas particulier (un auto-entrepreneur qui a
 * dépassé le seuil, une association assujettie) se traite en renseignant quand
 * même le numéro : le champ reste ouvert, c'est son caractère **obligatoire**
 * qui suit cette table.
 */
const NOT_VAT_LIABLE: ReadonlySet<LegalForm> = new Set<LegalForm>([
  "ei",
  "micro",
  "auto_entrepreneur",
  "association",
]);

/** Cette forme impose-t-elle un numéro de TVA intracommunautaire ? */
export function legalFormRequiresVat(form: LegalForm): boolean {
  return !NOT_VAT_LIABLE.has(form);
}

/** Une entrée de liste déroulante : la valeur stockée, le mot lu. */
export interface LegalFormOption {
  readonly value: LegalForm;
  readonly label: string;
}

/** Le catalogue en options, dans l'ordre de l'énumération. */
export const LEGAL_FORM_OPTIONS: readonly LegalFormOption[] = legalFormSchema.options.map(
  (value) => ({ value, label: LEGAL_FORM_LABELS[value] }),
);

/**
 * Reconnaît une forme dans ce qui a été saisi **avant** la liste fermée.
 *
 * Le stock existant est du texte libre : « SAS », « S.A.S. », « Micro
 * entreprise ». Plutôt que migrer des lignes en aveugle, on rapproche à la
 * lecture — ponctuation et espaces retirés, casse ignorée. Ce qui ne se
 * reconnaît pas rend `null`, et l'appelant décide (l'écran l'affiche tel quel,
 * la règle TVA retombe sur son défaut prudent).
 */
export function toLegalForm(raw: string): LegalForm | null {
  const key = raw
    .trim()
    .toLowerCase()
    .replace(/[.\s_-]/gu, "");
  if (key === "") {
    return null;
  }
  const direct = legalFormSchema.options.find((form) => form.replace(/_/gu, "") === key);
  if (direct !== undefined) {
    return direct;
  }
  return LEGACY_SPELLINGS[key] ?? null;
}

/** Les graphies héritées, ramenées à leur forme. */
const LEGACY_SPELLINGS: Readonly<Record<string, LegalForm>> = {
  entrepriseindividuelle: "ei",
  microentreprise: "micro",
  autoentreprise: "auto_entrepreneur",
  autoentrepreneur: "auto_entrepreneur",
  eirl: "ei",
  assoc: "association",
  association1901: "association",
};
