import type { CompanyWarning, CompanyWarningKind } from "@lfd/contracts";

/**
 * Ce que le calcul a besoin de savoir d'une société. **Pas** la fiche complète :
 * la galerie se calcule sur les 250 lignes de la liste, et charger le carnet de
 * contacts et les adresses de chacune pour afficher un bandeau serait payer très
 * cher un signal.
 */
export interface WarningInput {
  readonly status: string;
  readonly createdAt: Date;
  /** Raison sociale + forme + SIRET : de quoi facturer. */
  readonly hasLegalIdentity: boolean;
  /** Un détenteur est rattaché (son adresse suffit à le dire). */
  readonly hasHolder: boolean;
  readonly hasBillingAddress: boolean;
  /** Un règlement différé a été accordé — donc on prélèvera. */
  readonly hasGrantedTerms: boolean;
  readonly hasActiveMandate: boolean;
  /** Déposé le… `null` si aucun extrait. */
  readonly kbisUploadedAt: Date | null;
  readonly kbisCertifiedAt: Date | null;
}

/**
 * Au-delà de ce délai, un compte en attente n'attend plus : il traîne.
 *
 * Deux semaines, parce que c'est le temps qu'il faut à un client pour retrouver
 * son KBIS entre deux fournées — en dessous, on transformerait le rythme normal
 * d'un commerçant en alerte.
 */
const ATTENTE_JOURS = 14;

const JOUR_MS = 24 * 60 * 60 * 1000;

/**
 * L'ordre dans lequel ils se présentent, du plus coûteux au moins pressant.
 *
 * C'est une **décision serveur** et non un tri d'écran : la galerie se parcourt
 * au défilement, sans en-tête de colonne pour rattraper un mauvais classement.
 * Ce qui sort en premier est ce qu'on verra, point.
 */
const URGENCE: readonly CompanyWarningKind[] = [
  "mandat_absent",
  "activation_bloquee",
  "attente_prolongee",
  "kbis_a_verifier",
];

/**
 * Les avertissements d'un dossier — purs, ordonnés, sans effet de bord.
 *
 * ⚠️ **`activation_bloquee` sous-déclare, volontairement.** Il ne lit pas la
 * joignabilité téléphonique : un numéro peut vivre sur n'importe quel
 * interlocuteur, et charger le carnet de 250 sociétés pour un bandeau ne se
 * justifie pas. Conséquence assumée : un dossier dont il ne manque QUE le
 * téléphone n'apparaît pas ici — il apparaît sur sa fiche, où le verdict
 * complet est calculé. On préfère taire un cas que d'en inventer un.
 */
export function companyWarnings(company: WarningInput, now: Date): readonly CompanyWarning[] {
  const found: CompanyWarning[] = [];

  // Un crédit accordé sans moyen de l'encaisser. Pas de date propre : un mandat
  // qui n'existe pas n'a pas d'âge, et dater ça de l'ouverture du compte ferait
  // vieillir un fait qui n'a pas commencé ce jour-là.
  if (company.hasGrantedTerms && !company.hasActiveMandate) {
    found.push({ kind: "mandat_absent", since: null });
  }

  if (company.status === "pending") {
    const incomplet = !company.hasLegalIdentity || !company.hasHolder || !company.hasBillingAddress;
    if (incomplet) {
      found.push({ kind: "activation_bloquee", since: iso(company.createdAt) });
    }
    if (daysBetween(company.createdAt, now) >= ATTENTE_JOURS) {
      found.push({ kind: "attente_prolongee", since: iso(company.createdAt) });
    }
  }

  // Déposé mais jamais ouvert. Ne bloque rien — c'est bien pour ça qu'il a
  // besoin d'être vu ailleurs que dans une porte.
  if (company.kbisUploadedAt !== null && company.kbisCertifiedAt === null) {
    found.push({ kind: "kbis_a_verifier", since: iso(company.kbisUploadedAt) });
  }

  return found.sort(byUrgency);
}

/** Le plus grave d'abord ; à gravité égale, le plus vieux. */
function byUrgency(a: CompanyWarning, b: CompanyWarning): number {
  const rank = URGENCE.indexOf(a.kind) - URGENCE.indexOf(b.kind);
  if (rank !== 0) {
    return rank;
  }
  return (a.since ?? "").localeCompare(b.since ?? "");
}

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / JOUR_MS);
}

function iso(date: Date): string {
  return date.toISOString();
}
