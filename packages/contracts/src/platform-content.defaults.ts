import type { FooterContent, FooterLocaleContent } from "./platform-content.js";

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
 * L'IDENTITÉ légale n'y est pas remplie, et c'est délibéré : un numéro
 * d'immatriculation ne s'invente pas, pas même comme valeur de départ. Le rendu
 * omet ce qui est vide, et le back-office est là pour le saisir.
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
    links: ["Mentions légales", "CGV", "Confidentialité", "Cookies", "Accessibilité"],
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
    links: ["Legal notice", "Terms", "Privacy", "Cookies", "Accessibility"],
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
    links: ["Note legali", "Condizioni", "Privacy", "Cookie", "Accessibilità"],
  },
};

export const DEFAULT_FOOTER_CONTENT: FooterContent = {
  identity: {
    company: "",
    capital: "",
    siret: "",
    rcs: "",
    vat: "",
    phone: "",
    phoneHref: "",
    email: "",
    instagram: "",
    facebook: "",
  },
  fr: FR,
  en: EN,
  it: IT,
};
