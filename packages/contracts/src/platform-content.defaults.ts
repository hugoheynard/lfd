import type { FooterContent, FooterLocaleContent } from "./platform-content.js";

/**
 * Les trois langues de la vitrine. L'ordre est celui du sélecteur.
 *
 * ⚠️ Elles vivent ICI et non dans `platform-content.ts` pour une raison de
 * POIDS, pas de rangement : ce module-ci n'importe que des types, donc il ne
 * tire pas zod. Les deux fronts ont besoin de la liste et du contenu de départ
 * comme de vraies valeurs ; les prendre au baril du paquet embarquait zod dans
 * le bundle — mesuré, +380 ko, et le budget du front client passait de vert à
 * rouge. Le schéma, lui, dérive de cette liste, pas l'inverse.
 */
export const contentLocales = ["fr", "en", "it"] as const;

/**
 * Les **canaux sociaux** connus, et le mot qui les nomme à l'écran.
 *
 * Une liste fermée, et non un libellé libre : un pied de page qui affiche
 * « Insta » sur une page et « Instagram » sur l'autre a déjà divergé, et un
 * canal nommé librement ne peut porter ni icône ni gabarit d'URL. Ce qui est
 * ouvert, c'est le NOMBRE de lignes — pas leur vocabulaire.
 *
 * ⚠️ Ils vivent ici pour la même raison que les langues : ce module n'importe
 * que des types, donc les deux fronts peuvent lire la liste sans embarquer zod.
 */
/**
 * Les **mentions légales** du bandeau de pied de page, dans l'ordre où elles se
 * lisent.
 *
 * 🔴 Une liste FERMÉE, et non des libellés libres — c'est le même geste que
 * pour les réseaux sociaux, et pour une raison plus forte : ce ne sont pas des
 * textes de vitrine, ce sont des **prérequis**. Une mention légale ne
 * s'INVENTE pas ; elle s'affiche ou non, comme le bandeau cookies. Les laisser
 * en chaînes libres invitait à en écrire une qui n'existe pas, à en
 * orthographier deux différemment d'une langue à l'autre, et ne permettait à
 * aucun rendu de savoir de quoi il parlait.
 *
 * Toutes sont masquables, CGV comprises : la maison décide ce qu'elle affiche.
 * Ce que la forme interdit, c'est d'en ajouter une qui n'est pas une mention.
 */
export const legalMentionOrder = [
  "legalNotice",
  "salesTerms",
  "privacy",
  "cookies",
  "accessibility",
] as const;

export type LegalMention = (typeof legalMentionOrder)[number];

/**
 * Celles dont le mot est FIXE — c'est-à-dire toutes sauf les CGV.
 *
 * ⚠️ `salesTerms` n'a pas de libellé écrit ici, et c'est délibéré : le sien est
 * le TITRE du document, qui vit en base et se renomme depuis l'écran des CGV.
 * Un document renommé renomme son propre lien ; un libellé en double aurait
 * divergé au premier renommage.
 */
export type FixedLabelMention = Exclude<LegalMention, "salesTerms">;

/**
 * Le mot de chaque mention, par langue.
 *
 * Il vit dans le CONTRAT et non en base : une mention légale porte un nom
 * consacré, pas un nom qu'on choisit. Le rédacteur décide de l'afficher, pas de
 * la renommer — et les trois langues ne peuvent plus diverger.
 */
export const legalMentionLabels: Readonly<
  Record<(typeof contentLocales)[number], Readonly<Record<FixedLabelMention, string>>>
> = {
  fr: {
    legalNotice: "Mentions légales",
    privacy: "Confidentialité",
    cookies: "Cookies",
    accessibility: "Accessibilité",
  },
  en: {
    legalNotice: "Legal notice",
    privacy: "Privacy",
    cookies: "Cookies",
    accessibility: "Accessibility",
  },
  it: {
    legalNotice: "Note legali",
    privacy: "Privacy",
    cookies: "Cookie",
    accessibility: "Accessibilità",
  },
};

export const socialChannels = [
  "instagram",
  "facebook",
  "tiktok",
  "linkedin",
  "youtube",
  "x",
] as const;

/** Le mot affiché pour chaque canal — le pied de page en fait sa pastille. */
export const socialChannelLabels: Readonly<Record<(typeof socialChannels)[number], string>> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  x: "X",
};

/**
 * Le **contenu de départ** du pied de page — celui qui était compilé dans le
 * bundle du front client, repris mot pour mot.
 *
 * Il vit dans le contrat parce que **deux** consommateurs en ont besoin, et
 * qu'ils doivent partir du même texte : le serveur, qui le sert tant que
 * personne n'a rien enregistré, et le front, qui s'y replie quand le réseau ne
 * répond pas. Le dupliquer aurait garanti qu'ils divergent au premier mot
 * corrigé d'un seul côté.
 *
 * ⚠️ Ce n'est PAS la source de vérité : dès le premier enregistrement, c'est la
 * base qui fait foi. Ce fichier est un point de départ et un filet — pas un
 * endroit où corriger une coquille une fois la fonction en service.
 *
 * L'identité y porte ce que la vitrine PUBLIAIT DÉJÀ — raison sociale, capital,
 * téléphone, e-mail, réseaux. Les vider aurait été une régression : ces mentions
 * sont à l'écran aujourd'hui, et ce fichier ne fait que déplacer d'où elles
 * viennent.
 *
 * Les trois NUMÉROS D'IMMATRICULATION restent vides, et c'est délibéré : ils
 * n'ont jamais été publiés parce qu'on ne les invente pas, pas même comme valeur
 * de départ. Le rendu omet ce qui est vide, et le back-office est là pour les
 * saisir — sans déploiement.
 */

const FR: FooterLocaleContent = {
  brand: {
    tagline: "Boulangerie d’altitude",
    pitch:
      "Pain au levain, viennoiserie au beurre AOP et pâtisserie de station, cuits chaque nuit au Labo, route de la Balme. Livrés dans la station avant l’ouverture des remontées.",
  },
  houses: {
    head: "Les maisons",
    items: [
      {
        name: "Le Labo",
        street: "Route de la Balme",
        city: "73150 Val d’Isère",
        hours: "7 h – 19 h, tous les jours",
      },
      {
        name: "Le Village",
        street: "4 avenue Olympique",
        city: "73150 Val d’Isère",
        hours: "9 h – 20 h, tous les jours",
      },
    ],
  },
  order: {
    head: "Commander",
    links: [
      "Retrait au Labo ou au Village",
      "Coursier dans la station",
      "Traiteur et événements",
      "Ouvrir un compte pro",
      "Nos rayons et nos méthodes",
      "Opérations Pâques et Noël",
    ],
  },
  help: {
    head: "Aide et contact",
    phoneHours: "7 h – 19 h · ajouts jusqu’à 18 h",
    links: [
      "Prendre rendez-vous",
      "Suivre ma commande",
      "Questions fréquentes",
      "Signaler un problème",
    ],
  },
  legal: {
    pay: "Paiement sécurisé CB et Apple Pay, virement pour les comptes pro.",
    vat: "Prix TTC, TVA 5,5 % ou 10 % selon les produits.",
    // ⚠️ Plus de « CGV » ici : les conditions ont désormais un lien VIVANT,
    // posé par le pied de page lui-même et titré par le document. Garder le
    // libellé inerte à côté offrait deux fois le même mot, dont un seul
    // cliquable — et c'est le mort qui ressemblait le plus à un lien.
    links: ["Mentions légales", "Confidentialité", "Cookies", "Accessibilité"],
  },
};

const EN: FooterLocaleContent = {
  brand: {
    tagline: "Mountain bakery",
    pitch:
      "Sourdough bread, AOP-butter viennoiserie and resort pastry, baked every night at Le Labo, route de la Balme. Delivered around the resort before the lifts open.",
  },
  houses: {
    head: "The bakeries",
    items: [
      {
        name: "Le Labo",
        street: "Route de la Balme",
        city: "73150 Val d’Isère",
        hours: "7 am – 7 pm, every day",
      },
      {
        name: "Le Village",
        street: "4 avenue Olympique",
        city: "73150 Val d’Isère",
        hours: "9 am – 8 pm, every day",
      },
    ],
  },
  order: {
    head: "Order",
    links: [
      "Pickup at Le Labo or Le Village",
      "Courier around the resort",
      "Catering and events",
      "Open a trade account",
      "Our counters and our methods",
      "Easter and Christmas operations",
    ],
  },
  help: {
    head: "Help and contact",
    phoneHours: "7 am – 7 pm · additions until 6 pm",
    links: ["Book an appointment", "Track my order", "Frequent questions", "Report a problem"],
  },
  legal: {
    pay: "Secure card and Apple Pay payment, bank transfer for trade accounts.",
    vat: "Prices include VAT, at 5.5% or 10% depending on the product.",
    links: ["Legal notice", "Privacy", "Cookies", "Accessibility"],
  },
};

const IT: FooterLocaleContent = {
  brand: {
    tagline: "Panificio d’alta quota",
    pitch:
      "Pane a lievitazione naturale, viennoiserie al burro AOP e pasticceria di stazione, cotti ogni notte al Labo, route de la Balme. Consegnati in stazione prima dell’apertura degli impianti.",
  },
  houses: {
    head: "Le case",
    items: [
      {
        name: "Le Labo",
        street: "Route de la Balme",
        city: "73150 Val d’Isère",
        hours: "7 – 19, tutti i giorni",
      },
      {
        name: "Le Village",
        street: "4 avenue Olympique",
        city: "73150 Val d’Isère",
        hours: "9 – 20, tutti i giorni",
      },
    ],
  },
  order: {
    head: "Ordinare",
    links: [
      "Ritiro al Labo o al Village",
      "Corriere in stazione",
      "Catering ed eventi",
      "Aprire un account pro",
      "I nostri banchi e i nostri metodi",
      "Operazioni Pasqua e Natale",
    ],
  },
  help: {
    head: "Aiuto e contatti",
    phoneHours: "7 – 19 · aggiunte fino alle 18",
    links: [
      "Fissare un appuntamento",
      "Seguire il mio ordine",
      "Domande frequenti",
      "Segnalare un problema",
    ],
  },
  legal: {
    pay: "Pagamento sicuro con carta e Apple Pay, bonifico per gli account pro.",
    vat: "Prezzi IVA inclusa, 5,5 % o 10 % secondo i prodotti.",
    links: ["Note legali", "Privacy", "Cookie", "Accessibilità"],
  },
};

export const DEFAULT_FOOTER_CONTENT: FooterContent = {
  // Toutes affichées : ce sont des obligations, et le repli d'une obligation
  // est de paraître. Les décocher est un geste que quelqu'un pose sciemment.
  legalMentions: {
    legalNotice: true,
    salesTerms: true,
    privacy: true,
    cookies: true,
    accessibility: true,
  },
  identity: {
    brandName: "La Folie Coffee",
    company: "La Folie Coffee SAS",
    capital: "capital 40 000 €",
    // Les trois qui ne s'inventent pas. Ils se saisissent au back-office.
    siret: "",
    rcs: "",
    vat: "",
    phone: "04 79 06 12 40",
    phoneHref: "tel:+33479061240",
    email: "contact@lafoliecoffee.fr",
    socials: [
      { channel: "instagram", url: "https://www.instagram.com/" },
      { channel: "facebook", url: "https://www.facebook.com/" },
    ],
  },
  fr: FR,
  en: EN,
  it: IT,
};

/**
 * Les CGV de démonstration, reprises ici pour que `@lfd/contracts/content-values`
 * reste **l'unique** entrée sans zod des deux fronts.
 *
 * Un second sous-chemin aurait marché aussi, et aurait obligé chaque écran à
 * savoir lequel des deux porte la valeur qu'il cherche. Ce module n'importe que
 * des types, celui qu'il réexporte aussi : la garantie de poids tient.
 */
export { DEFAULT_SALES_TERMS, DEMO_SALES_TERMS_PARAGRAPHS } from "./sales-terms.defaults.js";

/** Les bornes des CGV, par la même entrée sans zod que le reste des valeurs. */
export { MAX_SALES_TERMS_BODY, MAX_SALES_TERMS_PARAGRAPHS } from "./sales-terms.bounds.js";
