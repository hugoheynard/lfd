import type { LegalMention } from "./platform-content.defaults.js";
import type {
  LegalDocument,
  LegalDocumentHeading,
  LegalDocumentParagraphPayload,
} from "./legal-document.js";

/**
 * Les **documents légaux de démonstration** — la forme de documents réels, avec
 * un contenu qu'on ne peut pas prendre pour le vrai.
 *
 * 🔴 **Ces textes n'ont aucune valeur juridique, et ils le disent eux-mêmes.**
 * Les titres d'articles sont ceux qu'on attend de chaque mention — éditeur et
 * hébergeur pour les mentions légales, finalités et droits pour la
 * confidentialité, catégories de traceurs pour les cookies, niveau de
 * conformité pour l'accessibilité — parce que c'est la structure qu'un écran
 * et un dialogue doivent être capables de porter. Les corps, eux, annoncent
 * qu'ils sont des corps de démonstration.
 *
 * C'est un choix, pas une paresse. Des mentions plausibles rendues par défaut
 * sur une boutique en service seraient lues comme opposables par un client et
 * par un juge, et rien à l'écran ne les distinguerait d'un document validé. Le
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
  "Texte de démonstration, sans aucune valeur contractuelle ni juridique. Il occupe la place " +
  "de l'article réel, qui se saisit depuis le back-office avant toute mise en ligne.";

const AVIS_EN =
  "Placeholder text with no contractual or legal value whatsoever. It stands in for the " +
  "real clause, which is to be written from the back-office before going live.";

const AVIS_IT =
  "Testo dimostrativo, privo di qualsiasi valore contrattuale o giuridico. Sostituisce " +
  "l'articolo reale, da redigere dal back-office prima della pubblicazione.";

/**
 * Un article de démonstration : trois titres, et le même avis en guise de corps.
 *
 * Une fonction plutôt que trois lignes recopiées par article — le corps est le
 * MÊME partout, et c'est ce qui rend la démonstration reconnaissable d'un coup
 * d'œil, mention comprise.
 */
const article = (fr: string, en: string, it: string): LegalDocumentParagraphPayload => ({
  fr: { title: fr, body: AVIS_FR },
  en: { title: en, body: AVIS_EN },
  it: { title: it, body: AVIS_IT },
});

/** Un document de démonstration : son titre, et ses articles dans l'ordre de lecture. */
interface DemoLegalDocument {
  readonly title: LegalDocumentHeading;
  readonly paragraphs: readonly LegalDocumentParagraphPayload[];
}

/**
 * Les cinq documents de démonstration, **par mention**.
 *
 * Exporté parce que le semis de développement les repose **par les commandes**
 * — il ne réécrit aucune ligne en direct. Le corpus de démonstration et le
 * repli du serveur partent donc du même texte : les dupliquer aurait garanti
 * qu'ils divergent au premier article corrigé d'un seul côté.
 *
 * 🔴 Le TITRE de chaque mention vit ici et nulle part ailleurs : c'est lui que
 * {@link DEFAULT_LEGAL_DOCUMENT} sert quand rien n'est publié. Un second
 * exemplaire aurait divergé du premier au premier ajustement de traduction.
 */
export const DEMO_LEGAL_DOCUMENTS: Readonly<Record<LegalMention, DemoLegalDocument>> = {
  legalNotice: {
    title: {
      fr: "Mentions légales",
      en: "Legal notice",
      it: "Note legali",
    },
    paragraphs: [
      article("Éditeur du site", "Site publisher", "Editore del sito"),
      article(
        "Directeur de la publication",
        "Publication director",
        "Direttore della pubblicazione",
      ),
      article("Hébergeur", "Hosting provider", "Fornitore di hosting"),
      article("Propriété intellectuelle", "Intellectual property", "Proprietà intellettuale"),
      article("Nous contacter", "Contact us", "Contattaci"),
    ],
  },
  salesTerms: {
    title: {
      fr: "Conditions générales de vente",
      en: "Terms and conditions of sale",
      it: "Condizioni generali di vendita",
    },
    paragraphs: [
      article("Objet", "Purpose", "Oggetto"),
      article("Commandes", "Orders", "Ordini"),
      article("Prix et paiement", "Prices and payment", "Prezzi e pagamento"),
      article("Livraison et retrait", "Delivery and pickup", "Consegna e ritiro"),
      article("Réserve de propriété", "Retention of title", "Riserva di proprietà"),
      article("Réclamations et retours", "Claims and returns", "Reclami e resi"),
      article(
        "Droit applicable et litiges",
        "Governing law and disputes",
        "Legge applicabile e controversie",
      ),
    ],
  },
  privacy: {
    title: {
      fr: "Politique de confidentialité",
      en: "Privacy policy",
      it: "Informativa sulla privacy",
    },
    paragraphs: [
      article("Données collectées", "Data we collect", "Dati raccolti"),
      article("Finalités du traitement", "Purposes of processing", "Finalità del trattamento"),
      article("Base légale", "Legal basis", "Base giuridica"),
      article("Durées de conservation", "Retention periods", "Periodi di conservazione"),
      article(
        "Destinataires et sous-traitants",
        "Recipients and processors",
        "Destinatari e responsabili",
      ),
      article("Vos droits", "Your rights", "I tuoi diritti"),
      article(
        "Délégué à la protection des données",
        "Data protection officer",
        "Responsabile della protezione dei dati",
      ),
    ],
  },
  cookies: {
    title: {
      fr: "Gestion des cookies",
      en: "Cookie policy",
      it: "Gestione dei cookie",
    },
    paragraphs: [
      article("Ce qu'est un traceur", "What a tracker is", "Che cos'è un tracciante"),
      article(
        "Cookies strictement nécessaires",
        "Strictly necessary cookies",
        "Cookie strettamente necessari",
      ),
      article("Cookies de mesure d'audience", "Analytics cookies", "Cookie di misurazione"),
      article(
        "Cookies de personnalisation",
        "Personalisation cookies",
        "Cookie di personalizzazione",
      ),
      article("Durée de vie et consentement", "Lifetime and consent", "Durata e consenso"),
      article("Modifier vos choix", "Change your choices", "Modificare le tue scelte"),
    ],
  },
  accessibility: {
    title: {
      fr: "Déclaration d'accessibilité",
      en: "Accessibility statement",
      it: "Dichiarazione di accessibilità",
    },
    paragraphs: [
      article("Niveau de conformité", "Conformance level", "Livello di conformità"),
      article("Résultats des tests", "Test results", "Risultati dei test"),
      article("Contenus non accessibles", "Non-accessible content", "Contenuti non accessibili"),
      article("Retour d'information", "Feedback", "Segnalazioni"),
      article("Voies de recours", "Remedies", "Vie di ricorso"),
    ],
  },
};

/**
 * Le document de DÉPART d'une mention — ce que le serveur rend tant que
 * personne n'a rien enregistré, et ce dont la boutique se replie quand l'API ne
 * répond pas.
 *
 * 🔴 **Il porte un titre et AUCUN article, et c'est tout le sujet.** Le pied de
 * page se replie sur un contenu complet parce qu'une vitrine vide est un défaut
 * d'affichage. Un document qu'on lit pour s'engager, non : servir des articles
 * de démonstration sous le titre « Conditions générales de vente » à un client
 * serait un faux, et le fait qu'ils avouent être des démonstrations ne répare
 * rien — ce qu'on lit d'abord, c'est le titre.
 *
 * Le repli est donc l'ABSENCE, que les deux surfaces savent dire : la boutique
 * annonce que la mention n'est pas encore publiée, le back-office propose
 * d'écrire le premier article.
 *
 * ⚠️ Ce repli est le MÊME en lecture et en écriture, et il faut qu'il le reste.
 * Les faire diverger — afficher la démonstration, partir du vide — donnait un
 * écran d'édition dont chaque ligne répondait 404 : des articles visibles que
 * rien ne pouvait ni modifier ni supprimer, parce qu'ils n'avaient jamais
 * existé (constaté et corrigé le 2026-09-13).
 *
 * Les articles de démonstration, eux, vivent dans {@link DEMO_LEGAL_DOCUMENTS}
 * et n'entrent en base que par le SEMIS de développement — un geste explicite,
 * sur une base locale.
 */
export const DEFAULT_LEGAL_DOCUMENT = (mention: LegalMention): LegalDocument => ({
  title: DEMO_LEGAL_DOCUMENTS[mention].title,
  paragraphs: [],
});
