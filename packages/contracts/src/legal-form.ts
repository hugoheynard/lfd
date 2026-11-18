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
  "foreign",
  "public_state",
  "public_local_authority",
  "public_establishment",
  "public_health_establishment",
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
  foreign: "Société de droit étranger",
  public_state: "État et services de l'État (armée, préfecture…)",
  public_local_authority: "Collectivité territoriale (commune, département, région)",
  public_establishment: "Établissement public (école, lycée, université…)",
  public_health_establishment: "Établissement public de santé",
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
  // Une société de droit étranger (Hugo, 2026-10-05) : hors de l'Union, elle
  // n'a pas de numéro de TVA intracommunautaire ; dans l'Union, elle en a un,
  // qu'on renseigne quand même — le champ reste ouvert, il n'est pas exigé.
  "foreign",
  // Un organisme public n'a souvent pas de numéro de TVA intracommunautaire :
  // le champ reste ouvert, il n'est pas exigé.
  "public_state",
  "public_local_authority",
  "public_establishment",
  "public_health_establishment",
]);

/** Cette forme impose-t-elle un numéro de TVA intracommunautaire ? */
export function legalFormRequiresVat(form: LegalForm): boolean {
  return !NOT_VAT_LIABLE.has(form);
}

/**
 * Les formes **publiques**, et le délai légal de paiement de chacune, en jours
 * après la réception de la facture : 50 pour un établissement public de santé,
 * 30 pour les autres acheteurs publics. La nature publique d'un compte EST sa
 * forme juridique : aucun autre champ ne la porte, et le délai s'en dérive.
 */
const PUBLIC_PAYMENT_DEADLINE_DAYS: Partial<Readonly<Record<LegalForm, number>>> = {
  public_state: 30,
  public_local_authority: 30,
  public_establishment: 30,
  public_health_establishment: 50,
};

/**
 * Ce qui aide le commercial à choisir la catégorie d'un acheteur public : qui
 * en relève, avec des exemples qu'il a au téléphone. Une école se trompe
 * souvent de case — primaire (la commune) ou collège et lycée (établissement
 * public) —, d'où l'exemple le plus précis à cet endroit.
 */
export const PUBLIC_LEGAL_FORM_HINTS: Partial<Readonly<Record<LegalForm, string>>> = {
  public_state:
    "Un service qui dépend directement d'un ministère. Ex. : une base ou un régiment de l'armée, une préfecture, une gendarmerie, un commissariat, un tribunal.",
  public_local_authority:
    "La commune, le département ou la région eux-mêmes, et leurs services. Ex. : une mairie, une crèche municipale, un conseil départemental. ⚠️ Une école MATERNELLE ou ÉLÉMENTAIRE est ici : elle n'a pas de budget à elle, c'est la mairie qui commande et qui paie.",
  public_establishment:
    "Un organisme public qui a son propre budget et son propre SIRET. Ex. : une université, un CROUS, un CCAS, un office de tourisme public, un musée national. ⚠️ Un COLLÈGE ou un LYCÉE est ici : il commande et paie lui-même, par son gestionnaire.",
  public_health_establishment:
    "Un hôpital public ou un établissement public de soins. Ex. : un centre hospitalier, un CHU, un EHPAD public. Le délai de paiement y est de 50 jours.",
};

/**
 * L'encart affiché AU-DESSUS du choix de catégorie publique : la confusion la
 * plus coûteuse est celle de l'école, parce qu'une mauvaise case adresse la
 * facture à une structure qui ne la paiera pas, et Chorus la rejette.
 */
export const PUBLIC_LEGAL_FORM_GUIDE = {
  title: "Une école ? Demandez d'abord au client de quelle école il s'agit.",
  body: "Maternelle ou élémentaire : c'est la MAIRIE qui commande et paie → Collectivité territoriale, avec le SIRET de la mairie. Collège ou lycée : l'établissement paie lui-même → Établissement public, avec le SIRET du collège ou du lycée. Dans le doute, demandez au client « qui va payer la facture ? » : c'est la structure qu'il vous nomme qu'on enregistre, avec son SIRET.",
} as const;

/** Cette forme est-elle celle d'un acheteur public (facturé par Chorus Pro) ? */
export function isPublicLegalForm(form: LegalForm): boolean {
  return form in PUBLIC_PAYMENT_DEADLINE_DAYS;
}

/** Le délai légal de paiement d'un acheteur public, en jours ; `null` hors public. */
export function publicPaymentDeadlineDays(form: LegalForm): number | null {
  return PUBLIC_PAYMENT_DEADLINE_DAYS[form] ?? null;
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

/**
 * Les civilités d'un titulaire de RIB qui est une **personne** — en tête de la
 * liste du RIB (Hugo, 2026-10-12).
 */
export const HOLDER_CIVILITIES = ["M.", "Mme", "Mlle"] as const;

/**
 * Les formes de l'identité qui n'ont PAS leur ligne dans la liste du RIB (Hugo,
 * 2026-10-12) : micro-entreprise et auto-entrepreneur sont des régimes, pas
 * des formes juridiques. Pour le titulaire d'un compte, la forme est
 * « Entreprise individuelle » — chacune y renvoie. L'écran Identité les garde.
 */
const NOT_A_HOLDER_LEGAL_FORM: Partial<Readonly<Record<LegalForm, LegalForm>>> = {
  micro: "ei",
  auto_entrepreneur: "ei",
};

/**
 * La liste fermée de la case « civilité ou forme juridique » du **titulaire
 * d'un RIB** : les civilités, puis les libellés de {@link LEGAL_FORM_LABELS}
 * dans l'ordre de l'énumération, moins {@link NOT_A_HOLDER_LEGAL_FORM} et
 * moins les formes publiques — un acheteur public paie par virement sur mandat
 * administratif, jamais par prélèvement, et n'a donc pas de mandat à signer. Dérivée, pas recopiée : une forme ajoutée à
 * l'identité apparaît aussi dans le RIB.
 *
 * C'est le LIBELLÉ qui s'enregistre et s'imprime sur le mandat (« SAS »,
 * « Entreprise individuelle »), pas la clé (`sas`). Le plus long, « Société de
 * droit étranger », fait 25 caractères : la case de 40 les tient tous.
 */
export const HOLDER_LEGAL_FORM_LABELS: readonly string[] = [
  ...HOLDER_CIVILITIES,
  ...legalFormSchema.options
    .filter((form) => !(form in NOT_A_HOLDER_LEGAL_FORM) && !isPublicLegalForm(form))
    .map((form) => LEGAL_FORM_LABELS[form]),
];

/**
 * La forme à imprimer pour le titulaire d'un compte d'une société de cette
 * forme : la sienne, sauf les {@link NOT_A_HOLDER_LEGAL_FORM}, ramenées à
 * l'entreprise individuelle.
 */
export function holderLegalFormOf(form: LegalForm): string {
  return LEGAL_FORM_LABELS[NOT_A_HOLDER_LEGAL_FORM[form] ?? form];
}

/**
 * La valeur est-elle une entrée de la liste fermée, à la casse et aux espaces
 * de bord près ? Rend le libellé canonique, ou `null` pour une saisie « Autre ».
 */
export function listedHolderLegalForm(value: string): string | null {
  const key = value.trim().toLowerCase();
  return HOLDER_LEGAL_FORM_LABELS.find((label) => label.toLowerCase() === key) ?? null;
}
