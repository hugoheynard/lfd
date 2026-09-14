import type { LignePlaquette } from "./plaquette-hiver-2026.js";

/** Un article du catalogue, réduit à ce que le rapprochement regarde. */
export interface ArticleCatalogue {
  readonly sku: string;
  readonly nom: string;
  readonly pimPriceMillicents: number;
}

/** Une ligne rapprochée d'un article : ce que l'import écrira. */
export interface Appariement {
  readonly ligne: LignePlaquette;
  readonly article: ArticleCatalogue;
  /** Le prix imprimé est-il DÉJÀ celui du référentiel ? Alors rien à décider. */
  readonly dejaAuPrixPim: boolean;
}

/** Une ligne qu'on ne saurait pas écrire, et pourquoi. */
export interface Refus {
  readonly ligne: LignePlaquette;
  readonly motif: "introuvable" | "ambigu";
  /** Les SKU candidats, quand il y en a plusieurs. */
  readonly candidats: readonly string[];
}

export interface Rapprochement {
  readonly apparies: readonly Appariement[];
  readonly refuses: readonly Refus[];
  /** Les articles du catalogue qu'aucune ligne ne nomme — ils gardent leur prix. */
  readonly nonCites: readonly ArticleCatalogue[];
}

/**
 * **Le libellé, ramené à ce qui l'identifie.**
 *
 * La plaquette est composée en capitales sans accents (« PATTE D'OURS »,
 * « SABLE SUISSE »), le référentiel en casse normale et accentué (« Patte
 * d'ours », « Sablé suisse »). Rapprocher les deux demande donc de retirer tout
 * ce qui relève de la COMPOSITION et rien de ce qui relève du produit.
 *
 * Ce qui tombe : la casse, les accents, les apostrophes (droite et typographique
 * — la plaquette emploie la seconde, le référentiel probablement la première),
 * la ponctuation, et les espaces multiples.
 *
 * Ce qui RESTE, et c'est délibéré : les chiffres et les unités. « Baguette
 * artisane 200 g » et « Baguette artisane 400 g » sont deux articles, à deux
 * prix, et les confondre facturerait l'un au tarif de l'autre.
 */
export function normaliser(libelle: string): string {
  return (
    libelle
      .normalize("NFD")
      // Les diacritiques, catégorie Unicode « Mark, nonspacing ».
      .replace(/\p{Mn}/gu, "")
      .toLowerCase()
      .replace(/['’`]/gu, " ")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
  );
}

/**
 * **Apparie la plaquette au catalogue, sans jamais deviner.**
 *
 * Trois issues par ligne, et la troisième est celle qui compte :
 *
 * - **appariée** — un seul article porte ce libellé. Elle sera écrite ;
 * - **introuvable** — aucun ne le porte. L'article n'est pas au catalogue B2B,
 *   ou il s'appelle autrement ;
 * - **ambiguë** — deux articles ou plus le portent. 🔴 On REFUSE, on ne choisit
 *   pas. Deux articles au même nom ont deux SKU, donc deux prix possibles, et
 *   en prendre un au hasard facturerait un client sur une décision que personne
 *   n'a prise. C'est le seul cas où l'import demande une réponse humaine.
 *
 * `dejaAuPrixPim` n'est pas un refus : c'est une ligne dont le prix imprimé
 * coïncide avec celui que le référentiel calcule déjà. Poser une décision
 * locale identique serait une décision vide — l'agrégat la refuse
 * (`RedundantB2bPriceError`), et à raison.
 */
export function rapprocher(
  lignes: readonly LignePlaquette[],
  articles: readonly ArticleCatalogue[],
): Rapprochement {
  const parNom = new Map<string, ArticleCatalogue[]>();
  for (const article of articles) {
    const cle = normaliser(article.nom);
    parNom.set(cle, [...(parNom.get(cle) ?? []), article]);
  }

  const apparies: Appariement[] = [];
  const refuses: Refus[] = [];
  const cites = new Set<string>();

  for (const ligne of lignes) {
    const candidats = parNom.get(normaliser(ligne.nom)) ?? [];
    if (candidats.length === 0) {
      refuses.push({ ligne, motif: "introuvable", candidats: [] });
      continue;
    }
    if (candidats.length > 1) {
      refuses.push({
        ligne,
        motif: "ambigu",
        candidats: candidats.map((article) => article.sku),
      });
      continue;
    }
    const article = candidats[0] as ArticleCatalogue;
    cites.add(article.sku);
    apparies.push({
      ligne,
      article,
      dejaAuPrixPim: article.pimPriceMillicents === ligne.proHtMillicents,
    });
  }

  return {
    apparies,
    refuses,
    nonCites: articles.filter((article) => !cites.has(article.sku)),
  };
}

/**
 * Les lignes dont le prix professionnel HT dépasse le prix public TTC.
 *
 * 🔴 Elles ne sont PAS écartées de l'import : la plaquette est l'engagement, et
 * la corriger en silence ferait facturer autre chose que ce qui est annoncé.
 * Elles sont nommées pour que personne ne découvre l'anomalie par une
 * réclamation client.
 */
export function lignesInversees(lignes: readonly LignePlaquette[]): readonly LignePlaquette[] {
  // Le HT en millicentimes contre le TTC en centimes : 1 000 millicentimes par
  // centime. Comparer sans convertir rendrait toute ligne « inversée ».
  return lignes.filter((ligne) => ligne.proHtMillicents >= ligne.publicTtcCents * 1_000);
}
