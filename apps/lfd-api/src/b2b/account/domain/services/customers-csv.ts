import type { AdminCompanyView } from "@lfd/contracts";

/**
 * Le portefeuille client, **en CSV** — le fichier qu'on donne au comptable.
 *
 * Mêmes trois décisions de format que l'export du catalogue, et pour les mêmes
 * raisons : point-virgule (Excel FR lit une virgule comme un séparateur
 * décimal), BOM UTF-8 (sans lui « Boulangerie Crémière » devient illisible), et
 * CRLF. Le BOM est écrit `\uFEFF` : un caractère invisible dans un fichier
 * source se déplace et se perd sans qu'on le voie.
 *
 * ## Ce qu'il ne porte PAS, et c'est délibéré
 *
 * Ni téléphone, ni adresse de livraison, ni membres de l'espace client. Ce
 * fichier part par courriel, se copie sur des clés, se retrouve dans des
 * dossiers partagés — chaque colonne qu'on y met est une donnée personnelle
 * qu'on répand. Les colonnes retenues sont celles sans lesquelles une écriture
 * comptable ne se passe pas : qui est la personne morale, sous quel SIRET, avec
 * quelle TVA, à quel régime de règlement, et un interlocuteur pour appeler
 * quand une facture coince.
 *
 * Un export « au cas où » est la façon habituelle dont une base client sort
 * d'une entreprise.
 */
const SEPARATOR = ";";
const BOM = "\uFEFF";

const HEADERS = [
  "Référence",
  "Raison sociale",
  "Enseigne",
  "Forme juridique",
  "SIRET",
  "TVA intracom.",
  "Statut",
  "Délais accordés",
  "Contact",
  "E-mail",
  "Créé le",
  "Activé le",
] as const;

/** Les statuts, dits en français — le fichier est lu par un humain. */
const STATUS: Readonly<Record<string, string>> = {
  pending: "En attente",
  active: "Actif",
  suspended: "Suspendu",
  terminated: "Résilié",
};

/** Les délais de règlement, dits en français. */
const TERMS: Readonly<Record<string, string>> = {
  monthly: "Mensuel",
};

export function customersCsv(companies: readonly AdminCompanyView[]): string {
  const lines = [HEADERS.join(SEPARATOR), ...companies.map(row)];
  return BOM + lines.join("\r\n") + "\r\n";
}

function row(company: AdminCompanyView): string {
  return [
    field(company.reference),
    field(company.raisonSociale),
    field(company.enseigne),
    field(company.formeJuridique),
    // Le SIRET est un IDENTIFIANT, pas un nombre : sans guillemets, un tableur
    // le lit en notation scientifique et « 81245678900021 » devient
    // « 8,12457E+13 ». Le zéro de tête d'un code postal disparaît de la même
    // façon. C'est la panne la plus courante d'un CSV, et la plus silencieuse.
    quoted(company.siret),
    field(company.vatNumber),
    field(STATUS[company.status] ?? company.status),
    // Vide plutôt que « aucun » : la colonne dit ce qui a été ACCORDÉ, et un
    // mot dans une case vide se filtre mal dans un tableur.
    field(company.grantedTerms.map((term) => TERMS[term] ?? term).join(" + ")),
    field(`${company.primaryContact.firstName} ${company.primaryContact.lastName}`.trim()),
    field(company.primaryContact.email),
    day(company.createdAt),
    // Vide, et non la date de création : un compte jamais activé n'a pas de date
    // d'activation, et y recopier autre chose ferait compter des clients qui
    // n'en sont pas.
    company.activatedAt === null ? "" : day(company.activatedAt),
  ].join(SEPARATOR);
}

/**
 * Un instant ISO → un jour, `AAAA-MM-JJ`.
 *
 * La partie date de l'ISO est prise TELLE QUELLE, sans conversion de fuseau :
 * ce fichier sert à retrouver un dossier, pas à dater une écriture à l'heure
 * près. Convertir vers Paris ferait basculer d'un jour les comptes ouverts après
 * 22 h — et personne ne verrait pourquoi.
 */
function day(iso: string): string {
  return iso.slice(0, 10);
}

/** Toujours entre guillemets : un identifiant numérique ne doit jamais devenir un nombre. */
function quoted(raw: string): string {
  return `"${raw.replaceAll('"', '""')}"`;
}

function field(raw: string): string {
  const needsQuotes = /[";\r\n]/u.test(raw);
  return needsQuotes ? `"${raw.replaceAll('"', '""')}"` : raw;
}
