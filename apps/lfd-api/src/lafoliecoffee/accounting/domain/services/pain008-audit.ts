import {
  CSV_BOM,
  CSV_SEPARATOR,
  csvEuros as euros,
  csvQuoted as quoted,
} from "../../../../platform/csv/csv-cells.js";
import { InvalidIbanError } from "../errors/accounting-errors.js";
import { Iban } from "../value-objects/iban.js";

/**
 * **Le contrôle du lot** — un CSV lu DEPUIS le fichier XML, jamais à côté.
 *
 * ## Pourquoi il relit le fichier au lieu de recalculer
 *
 * C'est toute sa valeur, et c'est fragile à préserver. Produire ce CSV à partir
 * des mêmes commandes que le XML donnerait **deux calculs parallèles** : ils
 * pourraient être faux tous les deux et s'accorder, et le contrôle attesterait
 * une erreur au lieu de la trouver.
 *
 * En relisant le XML, le CSV atteste ce que le fichier **contient réellement**.
 * Si le rendu se trompe — un montant mal formaté, une ligne oubliée, un
 * `CtrlSum` qui ne somme pas — l'écart apparaît ici.
 *
 * 🔴 Ne jamais « simplifier » ce module en lui passant les lignes de l'assiette.
 * Il deviendrait une seconde vue de la même erreur.
 *
 * ## Ce qu'il contrôle vraiment
 *
 * Deux totaux que le fichier **déclare** — `NbOfTxs` et `CtrlSum` — confrontés à
 * ce qu'on obtient en **comptant et sommant les lignes**. Ce sont les deux
 * champs dont un écart d'un centime fait rejeter le message entier par la
 * banque, et ils sont écrits par le rendu à un endroit différent des lignes :
 * c'est exactement le genre de couple qui dérive.
 *
 * ## Ce qu'il n'est PAS
 *
 * Ni un analyseur XML général, ni un validateur de schéma. Il lit les quelques
 * balises de CE message, par leur nom, en tolérant la mise en forme. Il ne dira
 * pas si le fichier est accepté par la banque — seul le portail le dira.
 */

const SEPARATOR = CSV_SEPARATOR;
const BOM = CSV_BOM;

const HEADERS = [
  "Rang",
  "Référence de bout en bout",
  "Débiteur",
  "Compte du débiteur",
  "Référence du mandat",
  "Montant (€)",
  // En DERNIER : les lignes de contrôle alignent leur valeur sous « Montant »,
  // et une colonne insérée avant les décalerait sans que rien ne le dise.
  "Schéma",
] as const;

interface AuditedLine {
  readonly endToEndId: string;
  readonly debtor: string;
  readonly iban: string;
  readonly mandate: string;
  /** `LclInstrm` du bloc qui porte la ligne — `CORE` ou `B2B`. */
  readonly scheme: string;
  /** En centimes, reconverti depuis le texte du fichier ; `null` s'il est illisible. */
  readonly cents: number | null;
  /** Le texte de `InstdAmt` tel que le fichier l'écrit — cité quand il est illisible. */
  readonly rawAmount: string;
}

/**
 * L'IBAN **masqué** — `••••1234`.
 *
 * 🔴 Le CSV entier sortait l'IBAN en clair jusqu'au 2026-09-12. Il a changé de
 * nature depuis que le RIB du client est scellé en base (`company_bank_accounts`,
 * AES-256-GCM) : un fichier qui recompose en clair ce que la base scelle défait
 * le coffre par la porte de service, et celui-ci s'ouvre dans un tableur, se
 * transfère par courriel et se garde dans un dossier de téléchargements.
 *
 * Ce que l'audit vérifie, c'est qu'un LOT est juste — les montants, les comptes,
 * le total déclaré. Reconnaître un compte suffit à ça ; le recomposer n'y ajoute
 * rien. Qui doit lire l'IBAN entier ouvre la fiche du client, où le mur tenant
 * et les rôles s'appliquent — ce qu'un fichier posé sur un bureau ne fait plus.
 *
 * Le masque est celui du value object (`Iban.masked()`), le même que tout
 * écran : un audit qui recopiait sa propre règle en avait une seconde.
 *
 * ⚠️ Ce qui n'est pas un IBAN valide n'est ni masqué ni recopié : la cellule
 * le dit invalide, et le contrôle nomme la ligne (`invalidAccounts`) — l'audit
 * lit un fichier, il ne refuse pas de le lire.
 * Le lot écrivait `IBAN-INCONNU` pour une société sans mandat ; depuis le
 * 2026-09-15 il ne l'écrit plus, mais la règle tient. Un masque appliqué à
 * tout rendrait `••••ONNU`, c'est-à-dire un compte d'apparence normale là où
 * le fichier hurle qu'il n'en a pas. Masquer une sentinelle la déguise en
 * donnée.
 */
function maskedIban(iban: string): string {
  return validIban(iban)?.masked() ?? INVALID_ACCOUNT;
}

/**
 * Ce que la cellule montre d'un compte qui n'est pas un IBAN valide. Jamais la
 * valeur brute : un IBAN à la clé fausse est presque toujours un vrai compte
 * mal recopié, et l'écrire en clair défait le masque.
 */
const INVALID_ACCOUNT = "🔴 IBAN invalide";

/** L'IBAN s'il en est un — `null` sinon : un constat d'audit, pas une exception. */
function validIban(raw: string): Iban | null {
  try {
    return Iban.create(raw.trim());
  } catch (error) {
    if (error instanceof InvalidIbanError) {
      return null;
    }
    throw error;
  }
}

/** Les lignes dont le compte n'est pas un IBAN valide, nommées par leur référence. */
function invalidAccounts(lines: readonly AuditedLine[]): readonly string[] {
  return lines
    .filter((line) => validIban(line.iban) === null)
    .map((line) => `Compte de la ligne ${line.endToEndId}`);
}

/** Rend le CSV de contrôle d'un `pain.008`. */
export function auditCsv(xml: string): string {
  const lines = readLines(xml);
  const summed = sumOf(lines);
  const declaredSum = declaredCents(xml);
  const declaredCount = declaredNumber(xml);
  const unreadable = unreadableAmounts(xml, lines);

  const rows = [
    HEADERS.join(SEPARATOR),
    ...lines.map((line, rank) =>
      [
        String(rank + 1),
        quoted(line.endToEndId),
        quoted(line.debtor),
        quoted(maskedIban(line.iban)),
        quoted(line.mandate),
        line.cents === null ? quoted(illegible(line.rawAmount)) : euros(line.cents),
        quoted(line.scheme),
      ].join(SEPARATOR),
    ),
    // Une ligne vide sépare les lignes du lot de son contrôle : un tableur
    // cesse alors de les trier ensemble, ce qui mélangerait les deux natures.
    "",
    control("Somme des lignes", euros(summed)),
    control(
      "Total déclaré par le fichier (CtrlSum)",
      declaredSum === null ? illegible(tag(xml, "CtrlSum")) : euros(declaredSum),
    ),
    control("Écart", declaredSum === null ? "—" : euros(declaredSum - summed)),
    control("Lignes comptées", String(lines.length)),
    control("Nombre déclaré par le fichier (NbOfTxs)", String(declaredCount)),
    ...unreadable.map((finding) => control("🔴 Montant illisible", finding)),
    ...invalidAccounts(lines).map((finding) => control(INVALID_ACCOUNT, finding)),
    // Le verdict en toutes lettres : on ne demande pas à un lecteur pressé de
    // comparer deux nombres au milieu d'un tableau.
    control(
      "Verdict",
      unreadable.length === 0 &&
        invalidAccounts(lines).length === 0 &&
        declaredSum === summed &&
        declaredCount === lines.length
        ? "COHÉRENT"
        : "🔴 INCOHÉRENT — ne pas déposer",
    ),
  ];
  return BOM + rows.join("\r\n") + "\r\n";
}

/**
 * Le verdict du contrôle, sans le CSV : le fichier déclare-t-il exactement ce
 * que ses lignes comptent et somment ? Le prélèvement d'essai le vérifie AVANT
 * de garder son fichier (plan `plan-prelevement-d-essai.md`, §1) — la même
 * relecture que le CSV, quelle que soit la séquence des blocs. Un montant
 * illisible ou un IBAN invalide (la banque rejetterait la ligne) rend le
 * fichier incohérent (décidé le 2026-10-24).
 */
export function isAuditCoherent(xml: string): boolean {
  const lines = readLines(xml);
  return (
    lines.length > 0 &&
    unreadableAmounts(xml, lines).length === 0 &&
    invalidAccounts(lines).length === 0 &&
    declaredCents(xml) === sumOf(lines) &&
    declaredNumber(xml) === lines.length
  );
}

function sumOf(lines: readonly AuditedLine[]): number {
  return lines.reduce((total, line) => total + (line.cents ?? 0), 0);
}

/**
 * Les montants que le contrôle n'a pas su lire, chacun nommé par son champ et
 * sa valeur. Régression (2026-10-23) : un montant mal formé valait 0 en
 * silence — une ligne illisible disparaissait de la somme, et un `CtrlSum`
 * illisible face à un lot vide passait pour cohérent.
 */
function unreadableAmounts(xml: string, lines: readonly AuditedLine[]): readonly string[] {
  const fromLines = lines
    .filter((line) => line.cents === null)
    .map((line) => `InstdAmt de la ligne ${line.endToEndId} : « ${line.rawAmount} »`);
  return declaredCents(xml) === null
    ? [...fromLines, `CtrlSum : « ${tag(xml, "CtrlSum")} »`]
    : fromLines;
}

function illegible(raw: string): string {
  return `ILLISIBLE « ${raw} »`;
}

function control(label: string, value: string): string {
  return ["", quoted(label), "", "", "", quoted(value)].join(SEPARATOR);
}

/**
 * Les lignes du lot, relues dans le XML, bloc de paiement par bloc.
 *
 * Le découpage se fait sur `PmtInf` puis sur `DrctDbtTxInf` plutôt que sur
 * chaque balise séparément : cherchées globalement, un `IBAN` créancier et un
 * `IBAN` débiteur se retrouveraient dans la même liste, et les colonnes se
 * décaleraient d'un cran sans que rien ne le dise. Le schéma est lu sur le BLOC
 * (`LclInstrm`), parce que c'est là que le fichier le déclare à la banque.
 */
function readLines(xml: string): readonly AuditedLine[] {
  return [...xml.matchAll(/<PmtInf>([\s\S]*?)<\/PmtInf>/gu)].flatMap((payment) => {
    const block = payment[1] ?? "";
    const scheme = tag(tag(block, "LclInstrm", true), "Cd");
    return [...block.matchAll(/<DrctDbtTxInf>([\s\S]*?)<\/DrctDbtTxInf>/gu)].map((match) => {
      const line = match[1] ?? "";
      return {
        endToEndId: tag(line, "EndToEndId"),
        debtor: tag(line, "Nm"),
        iban: tag(line, "IBAN"),
        mandate: tag(line, "MndtId"),
        scheme,
        cents: centsOf(tag(line, "InstdAmt")),
        rawAmount: tag(line, "InstdAmt"),
      };
    });
  });
}

/** `<CtrlSum>` du **groupe**, c'est-à-dire le premier : c'est celui du message. */
function declaredCents(xml: string): number | null {
  return centsOf(tag(xml, "CtrlSum"));
}

function declaredNumber(xml: string): number {
  const raw = Number(tag(xml, "NbOfTxs"));
  return Number.isFinite(raw) ? raw : 0;
}

/**
 * Le contenu de la première balise de ce nom, attributs tolérés. `nested` admet
 * des balises enfants — `<LclInstrm><Cd>B2B</Cd></LclInstrm>`.
 */
function tag(xml: string, name: string, nested = false): string {
  const content = nested ? "([\\s\\S]*?)" : "([^<]*)";
  return new RegExp(`<${name}(?:\\s[^>]*)?>${content}</${name}>`, "u").exec(xml)?.[1]?.trim() ?? "";
}

/**
 * `1516.48` → `151648`. Point décimal, parce que c'est ce que la norme écrit.
 *
 * Passe par les chiffres du texte plutôt que par `Number` × 100 : le flottant
 * transformerait `1516.48` en `151647.99999999999`, et un centime d'écart est
 * exactement ce que ce fichier existe pour détecter.
 *
 * `null` pour un texte qui n'a pas la forme d'un montant : le compter 0
 * effacerait la ligne de la somme sans le dire (cf. `unreadableAmounts`).
 */
function centsOf(amount: string): number | null {
  const matched = /^(-?)(\d+)(?:\.(\d{1,2}))?$/u.exec(amount);
  if (matched === null) {
    return null;
  }
  const sign = matched[1] === "-" ? -1 : 1;
  const units = Number(matched[2]);
  const decimals = Number((matched[3] ?? "").padEnd(2, "0"));
  return sign * (units * 100 + decimals);
}
