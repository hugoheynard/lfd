import type { CompanyWarning, CompanyWarningKind } from '@lfd/contracts';

import type { AdminCompany } from '../admin-company';

/** Une carte de la galerie : **un compte, un motif**, et le geste qui va avec. */
export interface WarningCard {
  /** Clé de rendu — la société seule ne suffit pas, elle peut porter 4 cartes. */
  readonly key: string;
  readonly companyId: string;
  /** Le nom sous lequel le commercial reconnaît la société. */
  readonly companyName: string;
  readonly kind: CompanyWarningKind;
  readonly title: string;
  readonly detail: string;
  /** « depuis 12 jours », ou vide quand le fait n'a pas de date propre. */
  readonly age: string;
  /** Le ton de la carte — l'urgence se lit avant le texte. */
  readonly tone: 'alert' | 'warning' | 'info';
}

/** Ce que chaque motif dit, et sur quel ton. Écrit une fois. */
const TEXTS: Readonly<
  Record<CompanyWarningKind, { title: string; detail: string; tone: WarningCard['tone'] }>
> = {
  mandat_absent: {
    title: 'Prélèvement impossible',
    detail: "Un règlement différé est accordé, mais aucun mandat SEPA n'est actif.",
    tone: 'alert',
  },
  activation_bloquee: {
    title: 'Ne peut pas commander',
    detail: "Le compte attend, et il lui manque de quoi l'activer.",
    tone: 'alert',
  },
  attente_prolongee: {
    title: 'Dossier oublié',
    detail: "En attente depuis longtemps — personne ne l'a repris.",
    tone: 'warning',
  },
  kbis_a_verifier: {
    title: 'KBIS à vérifier',
    detail: "L'extrait est déposé, personne ne l'a encore ouvert.",
    tone: 'info',
  },
};

/**
 * Les cartes à afficher, dans l'ordre où elles arrivent.
 *
 * **Aucun tri ici.** Le serveur classe les motifs d'une société par ce qu'ils
 * coûtent, et les sociétés arrivent déjà triées par la liste ; retrier à
 * l'écran ferait exister deux ordres qui finiraient par diverger — la même
 * erreur que la porte d'activation écrite deux fois.
 */
export function warningCards(
  companies: readonly AdminCompany[],
  now: Date,
): readonly WarningCard[] {
  return companies.flatMap((company) =>
    company.warnings.map((warning) => toCard(company, warning, now)),
  );
}

function toCard(company: AdminCompany, warning: CompanyWarning, now: Date): WarningCard {
  const texts = TEXTS[warning.kind];
  return {
    key: `${company.id}:${warning.kind}`,
    companyId: company.id,
    companyName: company.enseigne.trim() === '' ? company.raisonSociale : company.enseigne,
    kind: warning.kind,
    title: texts.title,
    detail: texts.detail,
    age: ageLabel(warning.since, now),
    tone: texts.tone,
  };
}

/**
 * « depuis 12 jours » — l'âge est ce qui fait monter l'urgence, pas le motif.
 *
 * Vide quand le fait n'a pas de date propre : un mandat qui n'existe pas n'a
 * pas d'âge, et afficher « depuis 0 jour » inventerait un compteur.
 */
function ageLabel(since: string | null, now: Date): string {
  if (since === null) {
    return '';
  }
  const days = Math.floor((now.getTime() - new Date(since).getTime()) / 86_400_000);
  if (days <= 0) {
    return "depuis aujourd'hui";
  }
  return days === 1 ? 'depuis hier' : `depuis ${days} jours`;
}
