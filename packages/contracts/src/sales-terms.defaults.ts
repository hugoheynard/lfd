import type { SalesTerms, SalesTermsParagraphPayload } from "./sales-terms.js";

/**
 * Les **CGV de démonstration** — la forme d'un document réel, avec un contenu
 * qu'on ne peut pas prendre pour le vrai.
 *
 * 🔴 **Ce texte n'a aucune valeur contractuelle, et il le dit lui-même.** Les
 * titres sont ceux qu'on attend d'une vente entre professionnels, parce que
 * c'est la structure qu'un écran et un dialogue doivent être capables de
 * porter ; les corps, eux, annoncent qu'ils sont des corps de démonstration.
 *
 * C'est un choix, pas une paresse. Des CGV plausibles rendues par défaut sur
 * une boutique en service seraient lues comme opposables par un client et par
 * un juge, et rien à l'écran ne les distinguerait d'un document validé. Le
 * risque n'est pas qu'on oublie de les remplacer : c'est que personne ne voie
 * qu'il fallait le faire.
 *
 * ⚠️ Ce module n'importe que des TYPES — jamais zod. C'est la même contrainte
 * que `platform-content.defaults.ts`, et pour la même raison mesurée : les deux
 * fronts lisent ces valeurs, et passer par le baril du paquet embarquait zod
 * dans le bundle de vitrine (+380 ko, budget au rouge).
 */

/** La phrase qui désamorce, répétée dans chaque corps et dans chaque langue. */
const AVIS_FR =
  "Texte de démonstration, sans aucune valeur contractuelle. Il occupe la place " +
  "de l'article réel, qui se saisit depuis le back-office avant toute mise en ligne.";

const AVIS_EN =
  "Placeholder text with no contractual value whatsoever. It stands in for the " +
  "real clause, which is to be written from the back-office before going live.";

const AVIS_IT =
  "Testo dimostrativo, privo di qualsiasi valore contrattuale. Sostituisce " +
  "l'articolo reale, da redigere dal back-office prima della pubblicazione.";

/**
 * Les articles, dans l'ordre où ils se lisent.
 *
 * Exporté parce que le semis de développement les repose **par les commandes**
 * — il ne réécrit pas la ligne en direct. Le corpus de démonstration et le
 * repli du serveur partent donc du même texte : les dupliquer aurait garanti
 * qu'ils divergent au premier article corrigé d'un seul côté.
 */
export const DEMO_SALES_TERMS_PARAGRAPHS: readonly SalesTermsParagraphPayload[] = [
  {
    fr: { title: "Objet", body: AVIS_FR },
    en: { title: "Purpose", body: AVIS_EN },
    it: { title: "Oggetto", body: AVIS_IT },
  },
  {
    fr: { title: "Commandes", body: AVIS_FR },
    en: { title: "Orders", body: AVIS_EN },
    it: { title: "Ordini", body: AVIS_IT },
  },
  {
    fr: { title: "Prix et paiement", body: AVIS_FR },
    en: { title: "Prices and payment", body: AVIS_EN },
    it: { title: "Prezzi e pagamento", body: AVIS_IT },
  },
  {
    fr: { title: "Livraison et retrait", body: AVIS_FR },
    en: { title: "Delivery and pickup", body: AVIS_EN },
    it: { title: "Consegna e ritiro", body: AVIS_IT },
  },
  {
    fr: { title: "Réserve de propriété", body: AVIS_FR },
    en: { title: "Retention of title", body: AVIS_EN },
    it: { title: "Riserva di proprietà", body: AVIS_IT },
  },
  {
    fr: { title: "Réclamations et retours", body: AVIS_FR },
    en: { title: "Claims and returns", body: AVIS_EN },
    it: { title: "Reclami e resi", body: AVIS_IT },
  },
  {
    fr: { title: "Droit applicable et litiges", body: AVIS_FR },
    en: { title: "Governing law and disputes", body: AVIS_EN },
    it: { title: "Legge applicabile e controversie", body: AVIS_IT },
  },
];

/**
 * Le document de DÉPART — ce que le serveur rend tant que personne n'a rien
 * enregistré, et ce dont la boutique se replie quand l'API ne répond pas.
 *
 * 🔴 **Il porte un titre et AUCUN article, et c'est tout le sujet.** Le pied de
 * page se replie sur un contenu complet parce qu'une vitrine vide est un défaut
 * d'affichage. Un document contractuel, non : servir sept articles de
 * démonstration sous le titre « Conditions générales de vente » à un client qui
 * s'engage serait un faux, et le fait qu'ils avouent être des démonstrations ne
 * répare rien — ce qu'on lit d'abord, c'est le titre.
 *
 * Le repli est donc l'ABSENCE, que les deux surfaces savent dire : la boutique
 * annonce que les CGV ne sont pas encore publiées, le back-office propose
 * d'écrire le premier article.
 *
 * ⚠️ Ce repli est le MÊME en lecture et en écriture, et il faut qu'il le reste.
 * Les faire diverger — afficher la démonstration, partir du vide — donnait un
 * écran d'édition dont chaque ligne répondait 404 : des articles visibles que
 * rien ne pouvait ni modifier ni supprimer, parce qu'ils n'avaient jamais
 * existé (constaté et corrigé le 2026-09-13).
 *
 * Les articles de démonstration, eux, vivent dans
 * {@link DEMO_SALES_TERMS_PARAGRAPHS} et n'entrent en base que par le SEMIS de
 * développement — un geste explicite, sur une base locale.
 */
export const DEFAULT_SALES_TERMS: SalesTerms = {
  title: {
    fr: "Conditions générales de vente",
    en: "Terms and conditions of sale",
    it: "Condizioni generali di vendita",
  },
  paragraphs: [],
};
