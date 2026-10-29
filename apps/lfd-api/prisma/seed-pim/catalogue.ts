import type { CatalogueCorpus } from "./corpus.js";

/**
 * **Le catalogue La Folie Coffee** — la donnée de départ du référentiel.
 *
 * Ce fichier remplace `catalogue-seed-data.ts`, et la différence n'est pas dans
 * son contenu : c'est le CHEMIN qui a changé. L'ancien alimentait des `upsert`
 * Prisma, donc il écrivait des lignes sans passer par les invariants — et c'est
 * pour ça que la base de développement portait 95 déclinaisons actives dont une
 * seule avec fiche réglementaire, c'est-à-dire un catalogue que `publish()`
 * refuse. Celui-ci est rejoué **commande par commande** (`seed-pim.ts`) : ce
 * qu'il produit est un état que la production peut atteindre.
 *
 * ## Rien ne lit une base pour fabriquer ce fichier
 *
 * Il a été relevé une fois sur la base de développement, puis **figé ici**. Il
 * n'existe aucun outil d'extraction, et c'est délibéré : un script qui lit une
 * base d'exploitation pour semer un poste de développement est une porte vers
 * la production qu'on ouvre à chaque `pnpm seed`. La donnée de seed est du CODE,
 * elle se relit dans une revue et se modifie à la main.
 *
 * ## Ce qu'il ne porte pas
 *
 * Les fiches réglementaires. Une seule référence en déclare une — c'est l'état
 * réel du catalogue, et le mentir ici reviendrait à inventer des allergènes dans
 * le dépôt. L'invention, quand on la veut, est explicite et marquée
 * (`SEED_PIM_SYNTHETIC_SHEETS=1`, cf. `declarations.ts`).
 *
 * ## Comment le modifier
 *
 * À la main, comme n'importe quelle donnée de référence. Les entités se
 * désignent par **clé portable** — nom de famille, clé de contexte, nom de taux, SKU — jamais par identifiant : le rejeu passe
 * par les commandes, qui frappent leurs propres ULID.
 */
export const CATALOGUE: CatalogueCorpus = {
  salesContexts: [
    {
      key: "takeaway",
      label: "À emporter",
      active: true,
    },
    {
      key: "eatIn",
      label: "Sur place",
      active: true,
    },
    {
      key: "b2b",
      label: "B2B",
      active: true,
    },
  ],
  vatRates: [
    {
      name: "Réduit",
      description: "Alimentaire à emporter.",
      percent: 5.5,
    },
    {
      name: "Intermédiaire",
      description: "Consommation sur place.",
      percent: 10.1,
    },
    {
      name: "Normal",
      description: "Taux plein — non alimentaire, alcools, revente.",
      percent: 20,
    },
  ],
  categories: [
    {
      name: {
        fr: "Baguettes & flûtes",
      },
      // Une sous-famille (2026-10-29) : les familles s'imbriquent en
      // production, et le filtre de la boutique « plonge » dans l'arbre.
      parentName: "Pains",
      vat: {
        takeaway: "Réduit",
        eatIn: "Intermédiaire",
        b2b: "Réduit",
      },
    },
    {
      name: {
        fr: "Pains spéciaux",
      },
      // Une sous-famille (2026-10-29) : les familles s'imbriquent en
      // production, et le filtre de la boutique « plonge » dans l'arbre.
      parentName: "Pains",
      vat: {
        takeaway: "Réduit",
        eatIn: "Intermédiaire",
        b2b: "Réduit",
      },
    },
    {
      name: {
        fr: "Pains au kilo",
      },
      // Une sous-famille (2026-10-29) : les familles s'imbriquent en
      // production, et le filtre de la boutique « plonge » dans l'arbre.
      parentName: "Pains",
      vat: {
        takeaway: "Réduit",
        eatIn: "Intermédiaire",
        b2b: "Réduit",
      },
    },
    {
      name: {
        fr: "Croissants & pains au chocolat",
      },
      // Une sous-famille (2026-10-29) : les familles s'imbriquent en
      // production, et le filtre de la boutique « plonge » dans l'arbre.
      parentName: "Viennoiseries",
      vat: {
        takeaway: "Réduit",
        eatIn: "Intermédiaire",
        b2b: "Réduit",
      },
    },
    {
      name: {
        fr: "Brioches",
      },
      // Une sous-famille (2026-10-29) : les familles s'imbriquent en
      // production, et le filtre de la boutique « plonge » dans l'arbre.
      parentName: "Viennoiseries",
      vat: {
        takeaway: "Réduit",
        eatIn: "Intermédiaire",
        b2b: "Réduit",
      },
    },
    {
      name: {
        fr: "Viennoiseries fines",
      },
      // Une sous-famille (2026-10-29) : les familles s'imbriquent en
      // production, et le filtre de la boutique « plonge » dans l'arbre.
      parentName: "Viennoiseries",
      vat: {
        takeaway: "Réduit",
        eatIn: "Intermédiaire",
        b2b: "Réduit",
      },
    },
    {
      name: {
        fr: "Individuelles",
      },
      // Une sous-famille (2026-10-29) : les familles s'imbriquent en
      // production, et le filtre de la boutique « plonge » dans l'arbre.
      parentName: "Pâtisseries",
      vat: {
        takeaway: "Réduit",
        eatIn: "Intermédiaire",
        b2b: "Réduit",
      },
    },
    {
      name: {
        fr: "Tartes",
      },
      // Une sous-famille (2026-10-29) : les familles s'imbriquent en
      // production, et le filtre de la boutique « plonge » dans l'arbre.
      parentName: "Pâtisseries",
      vat: {
        takeaway: "Réduit",
        eatIn: "Intermédiaire",
        b2b: "Réduit",
      },
    },
    {
      name: {
        fr: "Tartes à partager",
      },
      // Une sous-famille (2026-10-29) : les familles s'imbriquent en
      // production, et le filtre de la boutique « plonge » dans l'arbre.
      parentName: "Tartes",
      vat: {
        takeaway: "Réduit",
        eatIn: "Intermédiaire",
        b2b: "Réduit",
      },
    },
    {
      name: {
        fr: "Parts",
      },
      // Une sous-famille (2026-10-29) : les familles s'imbriquent en
      // production, et le filtre de la boutique « plonge » dans l'arbre.
      parentName: "Tartes",
      vat: {
        takeaway: "Réduit",
        eatIn: "Intermédiaire",
        b2b: "Réduit",
      },
    },
    {
      name: {
        fr: "Viennoiseries",
      },
      parentName: null,
      vat: {
        takeaway: "Réduit",
        eatIn: "Intermédiaire",
        b2b: "Réduit",
      },
    },
    {
      name: {
        fr: "Pains",
      },
      parentName: null,
      // Le sur place comme les Viennoiseries (2026-10-28) : sans lui, la
      // boutique ne met pas leurs articles en vente (manque `vat:eatIn`), et le
      // scénario de commandes, qui sert des pains, s'arrête au départ.
      vat: {
        takeaway: "Réduit",
        eatIn: "Intermédiaire",
        b2b: "Réduit",
      },
    },
    {
      name: {
        fr: "Pâtisseries",
      },
      parentName: null,
      // Ouverte aux pros le 2026-09-13, sur demande : les trois familles
      // restantes portaient une matrice VIDE, donc leurs 54 fiches n'étaient
      // candidates à aucun canal — le miroir B2B n'en montrait que 38 sur 94,
      // et le reste tombait en « canal fermé » sans que rien ne dise pourquoi.
      //
      // 🔴 **Ouverte au COMPTOIR le 2026-09-21**, et c'est la moitié qui
      // manquait. Le geste de 2026-09-13 n'avait ouvert que le canal pro ; la
      // vitrine publique ne montrait donc que 37 des 92 articles du corpus,
      // sans que rien ne le dise non plus. Une famille de pâtisseries qu'une
      // boulangerie ne vendrait pas à son comptoir n'existe pas.
      // Le sur place comme les Viennoiseries (2026-10-28) : sans lui, la
      // boutique ne met pas leurs articles en vente (manque `vat:eatIn`), et le
      // scénario de commandes, qui sert des pains, s'arrête au départ.
      vat: {
        takeaway: "Réduit",
        eatIn: "Intermédiaire",
        b2b: "Réduit",
      },
    },
    {
      name: {
        fr: "Salé & traiteur",
      },
      parentName: null,
      // Ouverte aux pros le 2026-09-13, au comptoir le 2026-09-21 — même geste
      // que « Pâtisseries », et pour la même raison.
      // Le sur place comme les Viennoiseries (2026-10-28) : sans lui, la
      // boutique ne met pas leurs articles en vente (manque `vat:eatIn`), et le
      // scénario de commandes, qui sert des pains, s'arrête au départ.
      vat: {
        takeaway: "Réduit",
        eatIn: "Intermédiaire",
        b2b: "Réduit",
      },
    },
    {
      name: {
        fr: "Chocolat & confiserie",
      },
      parentName: null,
      // Ouverte aux pros le 2026-09-13 — même geste que « Pâtisseries ».
      //
      // ⚠️ Taux PLEIN, à l'inverse des quatre autres familles : la confiserie
      // n'est pas de l'alimentaire à taux réduit. Le chocolat, lui, se discute
      // selon la forme — c'est un arbitrage de dev posé faute de source, pas
      // une position fiscale de la maison. À reprendre avec la comptabilité
      // avant que ce canal serve ailleurs qu'en démonstration.
      vat: {
        // Le MÊME taux qu'au canal pro, et pas 5,5 % : l'arbitrage ci-dessus
        // porte sur la nature du produit, pas sur le canal par lequel il part.
        // Poser un taux réduit ici parce que « c'est à emporter » aurait
        // contredit en silence la note qu'on vient de lire.
        takeaway: "Normal",
        eatIn: "Normal",
        b2b: "Normal",
      },
    },
  ],
  products: [
    {
      sku: "CHO-001",
      name: {
        fr: "Gros florentin laite",
        en: "tyurerty",
        it: "etry",
      },
      kind: "daily",
      categoryName: "Pains",
      status: "draft",
      priceCents: 1000,
      proPriceHt: "8.17439",
      weightGrams: null,
      descriptionShort: {
        fr: "Amandes caramélisées et chocolat au lait, format généreux.",
        en: "erty",
        it: "erty",
      },
      declaration: {
        allergens: ["AM"],
        mayContain: [],
        nutrition: {
          energyKcal: null,
          fatG: null,
          saturatedFatG: null,
          carbsG: null,
          sugarsG: null,
          proteinG: null,
          saltG: null,
          glycemicIndex: null,
        },
      },
      vat: {
        eatIn: "Normal",
        b2b: "Intermédiaire",
      },
    },
    {
      sku: "CHO-002",
      name: {
        fr: "Gros florentin noir",
      },
      kind: "resale",
      categoryName: "Chocolat & confiserie",
      status: "draft",
      priceCents: 600,
      proPriceHt: "4.50000",
      weightGrams: null,
      descriptionShort: {
        fr: "Amandes caramélisées et chocolat noir, format généreux.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "CHO-003",
      name: {
        fr: "Tablette chocolat maison lait 100 g",
      },
      kind: "resale",
      categoryName: "Chocolat & confiserie",
      status: "draft",
      priceCents: 1000,
      proPriceHt: "7.50000",
      weightGrams: 100,
      descriptionShort: {
        fr: "Tablette de chocolat au lait tempéré à l'atelier.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "CHO-004",
      name: {
        fr: "Sablé Gianduja pièce 300 g",
      },
      kind: "resale",
      categoryName: "Chocolat & confiserie",
      status: "draft",
      priceCents: 650,
      proPriceHt: "4.87500",
      weightGrams: 300,
      descriptionShort: {
        fr: "Sablé et gianduja, le duo noisette-chocolat.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "CHO-005",
      name: {
        fr: "Magalinettes sachet 150 g",
      },
      kind: "resale",
      categoryName: "Chocolat & confiserie",
      status: "draft",
      priceCents: 1300,
      proPriceHt: "9.75000",
      weightGrams: 150,
      declaration: null,
      vat: {},
    },
    {
      sku: "CHO-006",
      name: {
        fr: "Sablés Gianduja 200 g",
      },
      kind: "resale",
      categoryName: "Chocolat & confiserie",
      status: "draft",
      priceCents: 1700,
      proPriceHt: "12.75000",
      weightGrams: 200,
      descriptionShort: {
        fr: "Assortiment de sablés au gianduja.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "CHO-007",
      name: {
        fr: "Boîte de florentins 220 g",
      },
      kind: "resale",
      categoryName: "Chocolat & confiserie",
      status: "draft",
      priceCents: 2800,
      proPriceHt: "21.00000",
      weightGrams: 220,
      descriptionShort: {
        fr: "Florentins en boîte, à offrir ou à garder.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "CHO-008",
      name: {
        fr: "Grignottines boîte 150 g",
      },
      kind: "resale",
      categoryName: "Chocolat & confiserie",
      status: "draft",
      priceCents: 1700,
      proPriceHt: "12.75000",
      weightGrams: 150,
      declaration: null,
      vat: {},
    },
    {
      sku: "CHO-009",
      name: {
        fr: "Œufs praliné 150 g",
      },
      kind: "resale",
      categoryName: "Chocolat & confiserie",
      status: "draft",
      priceCents: 1500,
      proPriceHt: "11.25000",
      weightGrams: 150,
      descriptionShort: {
        fr: "Œufs en chocolat fourrés praliné.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "CHO-010",
      name: {
        fr: "Meringuettes noisette 100 g",
      },
      kind: "resale",
      categoryName: "Chocolat & confiserie",
      status: "draft",
      priceCents: 1000,
      proPriceHt: "7.50000",
      weightGrams: 100,
      descriptionShort: {
        fr: "Petites meringues à la noisette, croquantes et légères.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "CHO-011",
      name: {
        fr: "Oups 250 g - chocolat des montagnes",
      },
      kind: "resale",
      categoryName: "Chocolat & confiserie",
      status: "draft",
      priceCents: 3000,
      proPriceHt: "22.50000",
      weightGrams: 250,
      declaration: null,
      vat: {},
    },
    {
      sku: "CHO-012",
      name: {
        fr: "Boîte de 6 pattes d'ourson",
      },
      kind: "resale",
      categoryName: "Chocolat & confiserie",
      status: "draft",
      priceCents: 1600,
      proPriceHt: "12.00000",
      weightGrams: null,
      descriptionShort: {
        fr: "Guimauve maison enrobée de chocolat, la spécialité de la maison.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "CHO-013",
      name: {
        fr: "Mendiants boîte 200 g",
      },
      kind: "resale",
      categoryName: "Chocolat & confiserie",
      status: "draft",
      priceCents: 1600,
      proPriceHt: "12.00000",
      weightGrams: 200,
      descriptionShort: {
        fr: "Mendiants au chocolat et fruits secs.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "P-8EMFGZ",
      name: {
        fr: "aa",
      },
      kind: "daily",
      categoryName: "Viennoiseries",
      status: "draft",
      priceCents: null,
      proPriceHt: null,
      weightGrams: null,
      declaration: null,
      vat: {},
    },
    {
      sku: "P-LHKT76",
      name: {
        fr: "zert",
      },
      kind: "daily",
      categoryName: "Viennoiseries",
      status: "draft",
      priceCents: null,
      proPriceHt: null,
      weightGrams: null,
      declaration: null,
      vat: {},
    },
    {
      sku: "P-VN5YEV",
      name: {
        fr: "a",
      },
      kind: "daily",
      categoryName: "Viennoiseries",
      status: "draft",
      priceCents: null,
      proPriceHt: null,
      weightGrams: null,
      declaration: null,
      vat: {},
    },
    {
      sku: "PAI-001",
      name: {
        fr: "Baguette tradition",
      },
      kind: "daily",
      categoryName: "Baguettes & flûtes",
      status: "draft",
      priceCents: 200,
      proPriceHt: "1.70616",
      weightGrams: null,
      descriptionShort: {
        fr: "Farine française, levain nourri chaque jour, croûte qui chante a la sortie du four.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "PAI-002",
      name: {
        fr: "Baguette artisane 200 g",
      },
      kind: "daily",
      categoryName: "Baguettes & flûtes",
      status: "draft",
      priceCents: 180,
      proPriceHt: "1.53555",
      weightGrams: 200,
      descriptionShort: {
        fr: "Baguette de fabrication artisanale, mie alvéolée et croûte fine.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "PAI-003",
      name: {
        fr: "Baguette village plateau 200 g",
      },
      kind: "daily",
      categoryName: "Baguettes & flûtes",
      status: "draft",
      priceCents: 200,
      proPriceHt: "1.70616",
      weightGrams: 200,
      descriptionShort: {
        fr: "Baguette de plateau, format pratique pour la table.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "PAI-004",
      name: {
        fr: "Pain Viking 300 g",
      },
      kind: "daily",
      categoryName: "Pains spéciaux",
      status: "draft",
      priceCents: 400,
      proPriceHt: "3.41232",
      weightGrams: 300,
      descriptionShort: {
        fr: "Pain aux céréales, dense et rustique, parfait avec les fromages.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "PAI-005",
      name: {
        fr: "Petit pain Beaufort",
      },
      kind: "daily",
      categoryName: "Pains spéciaux",
      status: "draft",
      priceCents: 210,
      proPriceHt: "1.79147",
      weightGrams: null,
      descriptionShort: {
        fr: "Petit pain au Beaufort, un classique savoyard.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "PAI-006",
      name: {
        fr: "Pain moisson 300 g",
      },
      kind: "daily",
      categoryName: "Pains spéciaux",
      status: "draft",
      priceCents: 400,
      proPriceHt: "3.41232",
      weightGrams: 300,
      descriptionShort: {
        fr: "Pain aux graines, mie souple et gout de céréales grillees.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "PAI-007",
      name: {
        fr: "Flûte village 450 g",
      },
      kind: "daily",
      categoryName: "Baguettes & flûtes",
      status: "draft",
      priceCents: 250,
      proPriceHt: "2.13270",
      weightGrams: 450,
      descriptionShort: {
        fr: "Flûte de village, croûte dorée et mie moelleuse.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "PAI-008",
      name: {
        fr: "Pain de campagne 300 g",
      },
      kind: "daily",
      categoryName: "Pains spéciaux",
      status: "draft",
      priceCents: 400,
      proPriceHt: "3.41232",
      weightGrams: 300,
      descriptionShort: {
        fr: "Pain de campagne au levain, il tient toute la journée.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "PAI-009",
      name: {
        fr: "Baguette campagrain 200 g",
      },
      kind: "daily",
      categoryName: "Baguettes & flûtes",
      status: "draft",
      priceCents: 250,
      proPriceHt: "2.13270",
      weightGrams: 200,
      descriptionShort: {
        fr: "Baguette de campagne aux graines.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "PAI-010",
      name: {
        fr: "Ficelle artisane 140 g",
      },
      kind: "daily",
      categoryName: "Baguettes & flûtes",
      status: "draft",
      priceCents: 175,
      proPriceHt: "1.49763",
      weightGrams: 140,
      descriptionShort: {
        fr: "Petit format, beaucoup de croûte.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "PAI-011",
      name: {
        fr: "Flûte artisane 420 g",
      },
      kind: "daily",
      categoryName: "Baguettes & flûtes",
      status: "draft",
      priceCents: 350,
      proPriceHt: "2.98578",
      weightGrams: 420,
      descriptionShort: {
        fr: "Flûte artisanale, mie alvéolée.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "PAI-012",
      name: {
        fr: "Flûte tradition 450 g",
      },
      kind: "daily",
      categoryName: "Baguettes & flûtes",
      status: "draft",
      priceCents: 350,
      proPriceHt: "2.98578",
      weightGrams: 450,
      descriptionShort: {
        fr: "Flûte de tradition francaise, fermentation lente.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "PAI-013",
      name: {
        fr: "Pain complet 300 g",
      },
      kind: "daily",
      categoryName: "Pains spéciaux",
      status: "draft",
      priceCents: 400,
      proPriceHt: "3.41232",
      weightGrams: 300,
      descriptionShort: {
        fr: "Pain complet à la farine française, riche en fibres.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "PAI-014",
      name: {
        fr: "Pain de seigle 300 g",
      },
      kind: "daily",
      categoryName: "Pains spéciaux",
      status: "draft",
      priceCents: 400,
      proPriceHt: "3.41232",
      weightGrams: 300,
      descriptionShort: {
        fr: "Pain de seigle dense, idéal avec les huîtres et les fromages.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "PAI-015",
      name: {
        fr: "Pain sportif au kg",
      },
      kind: "daily",
      categoryName: "Pains au kilo",
      status: "draft",
      priceCents: 1600,
      proPriceHt: "13.64929",
      weightGrams: 1000,
      descriptionShort: {
        fr: "Pain aux graines et fruits secs, vendu au kilo.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "PAI-016",
      name: {
        fr: "Campaillou au kg",
      },
      kind: "daily",
      categoryName: "Pains au kilo",
      status: "draft",
      priceCents: 1000,
      proPriceHt: "8.53081",
      weightGrams: 1000,
      descriptionShort: {
        fr: "Pain de campagne rustique, vendu au kilo.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "PAI-017",
      name: {
        fr: "Pavé aux noix 300 g",
      },
      kind: "daily",
      categoryName: "Pains spéciaux",
      status: "draft",
      priceCents: 500,
      proPriceHt: "4.26540",
      weightGrams: 300,
      descriptionShort: {
        fr: "Pavé garni de noix, le compagnon du plateau de fromages.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "PAI-018",
      name: {
        fr: "Pain de mie carré frais 340 g",
      },
      kind: "daily",
      categoryName: "Pains spéciaux",
      status: "draft",
      priceCents: 550,
      proPriceHt: "4.69194",
      weightGrams: 340,
      descriptionShort: {
        fr: "Pain de mie frais en carré, mie régulière et moelleuse.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "PAT-001",
      name: {
        fr: "Tartelette myrtilles",
      },
      kind: "daily",
      categoryName: "Individuelles",
      status: "draft",
      priceCents: 600,
      proPriceHt: "5.11848",
      weightGrams: null,
      descriptionShort: {
        fr: "Myrtilles sauvages de nos alpages sur une pâte sablée.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "PAT-002",
      name: {
        fr: "Flan nature (part)",
      },
      kind: "daily",
      categoryName: "Parts",
      status: "draft",
      priceCents: 400,
      proPriceHt: "3.41232",
      weightGrams: null,
      descriptionShort: {
        fr: "Le flan pâtissier à l'ancienne, vanille et texture fondante.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "PAT-003",
      name: {
        fr: "Tartelette framboises",
      },
      kind: "daily",
      categoryName: "Individuelles",
      status: "draft",
      priceCents: 600,
      proPriceHt: "5.11848",
      weightGrams: null,
      descriptionShort: {
        fr: "Framboises fraîches et crème pâtissière sur pâte sablée.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "PAT-004",
      name: {
        fr: "Délice des neiges",
      },
      kind: "daily",
      categoryName: "Individuelles",
      status: "draft",
      priceCents: 400,
      proPriceHt: "3.41232",
      weightGrams: null,
      declaration: null,
      vat: {},
    },
    {
      sku: "PAT-005",
      name: {
        fr: "Éclair chocolat",
      },
      kind: "daily",
      categoryName: "Individuelles",
      status: "draft",
      priceCents: 600,
      proPriceHt: "5.11848",
      weightGrams: null,
      descriptionShort: {
        fr: "Pâte à choux, crème pâtissière au chocolat et glacage brillant.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "PAT-006",
      name: {
        fr: "Tartelette citron",
      },
      kind: "daily",
      categoryName: "Individuelles",
      status: "draft",
      priceCents: 600,
      proPriceHt: "5.11848",
      weightGrams: null,
      descriptionShort: {
        fr: "Creme au citron acidulée sur une pâte sablée croustillante.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "PAT-007",
      name: {
        fr: "Éclair café",
      },
      kind: "daily",
      categoryName: "Individuelles",
      status: "draft",
      priceCents: 600,
      proPriceHt: "5.11848",
      weightGrams: null,
      descriptionShort: {
        fr: "Pâte à choux et crème au café, le classique intemporel.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "PAT-008",
      name: {
        fr: "Éclair vanille",
      },
      kind: "daily",
      categoryName: "Individuelles",
      status: "draft",
      priceCents: 600,
      proPriceHt: "5.11848",
      weightGrams: null,
      descriptionShort: {
        fr: "Pâte à choux garnie de crème à la vanille.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "PAT-009",
      name: {
        fr: "Tarte citron meringuée (part)",
      },
      kind: "daily",
      categoryName: "Parts",
      status: "draft",
      priceCents: 600,
      proPriceHt: "5.11848",
      weightGrams: null,
      descriptionShort: {
        fr: "Citron acidulé et meringue dorée au chalumeau.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "PAT-010",
      name: {
        fr: "Crumble framboise",
      },
      kind: "daily",
      categoryName: "Individuelles",
      status: "draft",
      priceCents: 750,
      proPriceHt: "6.39810",
      weightGrams: null,
      descriptionShort: {
        fr: "Framboises et pâte à crumble beurrée, servi en part.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "PAT-011",
      name: {
        fr: "Rose des sables",
      },
      kind: "daily",
      categoryName: "Individuelles",
      status: "draft",
      priceCents: 400,
      proPriceHt: "3.41232",
      weightGrams: null,
      declaration: null,
      vat: {},
    },
    {
      sku: "PAT-012",
      name: {
        fr: "Pyramide",
      },
      kind: "daily",
      categoryName: "Individuelles",
      status: "draft",
      priceCents: 500,
      proPriceHt: "4.26540",
      weightGrams: null,
      declaration: null,
      vat: {},
    },
    {
      sku: "PAT-013",
      name: {
        fr: "Tartelette noix caramel",
      },
      kind: "daily",
      categoryName: "Individuelles",
      status: "draft",
      priceCents: 600,
      proPriceHt: "5.11848",
      weightGrams: null,
      descriptionShort: {
        fr: "Caramel tendre et noix torréfiées sur pâte sablée.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "PAT-014",
      name: {
        fr: "Mousse chocolat",
      },
      kind: "daily",
      categoryName: "Individuelles",
      status: "draft",
      priceCents: 600,
      proPriceHt: "5.11848",
      weightGrams: null,
      descriptionShort: {
        fr: "Mousse au chocolat aérienne, servie en part individuelle.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "PAT-015",
      name: {
        fr: "Tarte myrtille T1 (4 personnes)",
      },
      kind: "daily",
      categoryName: "Tartes à partager",
      status: "draft",
      priceCents: 3000,
      proPriceHt: "25.59242",
      weightGrams: null,
      descriptionShort: {
        fr: "La tarte aux myrtilles sauvages en format à partager, 4 personnes.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "PAT-016",
      name: {
        fr: "Mont-Blanc individuel",
      },
      kind: "daily",
      categoryName: "Individuelles",
      status: "draft",
      priceCents: 700,
      proPriceHt: "5.97156",
      weightGrams: null,
      descriptionShort: {
        fr: "Vermicelles de crème de marron, meringue et chantilly.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "PAT-017",
      name: {
        fr: "Tarte poire fermière (part)",
      },
      kind: "daily",
      categoryName: "Parts",
      status: "draft",
      priceCents: 500,
      proPriceHt: "4.26540",
      weightGrams: null,
      descriptionShort: {
        fr: "Poires fondantes sur une base d'amandes.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "PAT-018",
      name: {
        fr: "Tarte abricot fermière (part)",
      },
      kind: "daily",
      categoryName: "Parts",
      status: "draft",
      priceCents: 500,
      proPriceHt: "4.26540",
      weightGrams: null,
      descriptionShort: {
        fr: "Abricots et pâte sablée, la tarte de saison à l'ancienne.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "SAL-001",
      name: {
        fr: "Sandwich jambon blanc Beaufort",
      },
      kind: "daily",
      categoryName: "Salé & traiteur",
      status: "draft",
      priceCents: 700,
      proPriceHt: "5.97156",
      weightGrams: null,
      descriptionShort: {
        fr: "Jambon blanc et Beaufort sur pain maison.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "SAL-002",
      name: {
        fr: "Tourte au Beaufort (part)",
      },
      kind: "daily",
      categoryName: "Salé & traiteur",
      status: "draft",
      priceCents: 650,
      proPriceHt: "5.54502",
      weightGrams: null,
      descriptionShort: {
        fr: "Tourte généreuse au Beaufort, servie en part.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "SAL-003",
      name: {
        fr: "Quiche lorraine (part)",
      },
      kind: "daily",
      categoryName: "Salé & traiteur",
      status: "draft",
      priceCents: 550,
      proPriceHt: "4.69194",
      weightGrams: null,
      descriptionShort: {
        fr: "Quiche lorraine a l'appareil crème et lardons, part individuelle.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "SAL-004",
      name: {
        fr: "Pan bagnat thon",
      },
      kind: "daily",
      categoryName: "Salé & traiteur",
      status: "draft",
      priceCents: 700,
      proPriceHt: "5.97156",
      weightGrams: null,
      descriptionShort: {
        fr: "Le pan bagnat garni au thon, version montagne.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "SAL-005",
      name: {
        fr: "Pizza (part)",
      },
      kind: "daily",
      categoryName: "Salé & traiteur",
      status: "draft",
      priceCents: 550,
      proPriceHt: "4.69194",
      weightGrams: null,
      descriptionShort: {
        fr: "Part de pizza maison, pâte levée sur place.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "SAL-006",
      name: {
        fr: "Club poulet",
      },
      kind: "daily",
      categoryName: "Salé & traiteur",
      status: "draft",
      priceCents: 700,
      proPriceHt: "5.97156",
      weightGrams: null,
      descriptionShort: {
        fr: "Club sandwich au poulet, en trois étages.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "SAL-007",
      name: {
        fr: "Sandwich poulet graines",
      },
      kind: "daily",
      categoryName: "Salé & traiteur",
      status: "draft",
      priceCents: 700,
      proPriceHt: "5.97156",
      weightGrams: null,
      descriptionShort: {
        fr: "Poulet et pain aux graines, croquant et rassasiant.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "SAL-008",
      name: {
        fr: "Sandwich jambon cru tomme",
      },
      kind: "daily",
      categoryName: "Salé & traiteur",
      status: "draft",
      priceCents: 700,
      proPriceHt: "5.97156",
      weightGrams: null,
      descriptionShort: {
        fr: "Jambon cru et tomme de Savoie sur pain maison.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "SAL-009",
      name: {
        fr: "Sandwich persillé",
      },
      kind: "daily",
      categoryName: "Salé & traiteur",
      status: "draft",
      priceCents: 700,
      proPriceHt: "5.97156",
      weightGrams: null,
      declaration: null,
      vat: {},
    },
    {
      sku: "SAL-010",
      name: {
        fr: "Sandwich jambon beurre cornichons",
      },
      kind: "daily",
      categoryName: "Salé & traiteur",
      status: "draft",
      priceCents: 650,
      proPriceHt: "5.54502",
      weightGrams: null,
      descriptionShort: {
        fr: "Le jambon-beurre, avec les cornichons qui vont avec.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "SAL-011",
      name: {
        fr: "Quiche poireaux chèvre (part)",
      },
      kind: "daily",
      categoryName: "Salé & traiteur",
      status: "draft",
      priceCents: 600,
      proPriceHt: "5.11848",
      weightGrams: null,
      descriptionShort: {
        fr: "Poireaux fondants et chèvre, part individuelle.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "SAL-012",
      name: {
        fr: "Salade César (barquette)",
      },
      kind: "daily",
      categoryName: "Salé & traiteur",
      status: "draft",
      priceCents: 1000,
      proPriceHt: "8.53081",
      weightGrams: null,
      descriptionShort: {
        fr: "Salade Cesar en barquette, prête à emporter.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "SAL-013",
      name: {
        fr: "Tranche tomate mozzarella",
      },
      kind: "daily",
      categoryName: "Salé & traiteur",
      status: "draft",
      priceCents: 700,
      proPriceHt: "5.97156",
      weightGrams: null,
      descriptionShort: {
        fr: "Tranche garnie tomate et mozzarella.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "SAL-014",
      name: {
        fr: "Quiche saumon épinards (part)",
      },
      kind: "daily",
      categoryName: "Salé & traiteur",
      status: "draft",
      priceCents: 700,
      proPriceHt: "5.97156",
      weightGrams: null,
      descriptionShort: {
        fr: "Saumon et épinards dans un appareil crèmeux.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "SAL-015",
      name: {
        fr: "Salade de lentilles (barquette)",
      },
      kind: "daily",
      categoryName: "Salé & traiteur",
      status: "draft",
      priceCents: 850,
      proPriceHt: "7.25118",
      weightGrams: null,
      descriptionShort: {
        fr: "Lentilles vertes en barquette, assaisonnées maison.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "SAL-016",
      name: {
        fr: "Tranche miel chèvre",
      },
      kind: "daily",
      categoryName: "Salé & traiteur",
      status: "draft",
      priceCents: 650,
      proPriceHt: "5.54502",
      weightGrams: null,
      descriptionShort: {
        fr: "Tranche garnie chèvre et miel.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "SAL-017",
      name: {
        fr: "Quiche légumes (part)",
      },
      kind: "daily",
      categoryName: "Salé & traiteur",
      status: "draft",
      priceCents: 550,
      proPriceHt: "4.69194",
      weightGrams: null,
      descriptionShort: {
        fr: "Quiche aux légumes de saison, part individuelle.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "SAL-018",
      name: {
        fr: "Sandwich rosette",
      },
      kind: "daily",
      categoryName: "Salé & traiteur",
      status: "draft",
      priceCents: 700,
      proPriceHt: "5.97156",
      weightGrams: null,
      descriptionShort: {
        fr: "Rosette et beurre sur pain maison.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "SAL-019",
      name: {
        fr: "Fougasse provençale",
      },
      kind: "daily",
      categoryName: "Salé & traiteur",
      status: "draft",
      priceCents: 650,
      proPriceHt: "5.54502",
      weightGrams: null,
      descriptionShort: {
        fr: "Fougasse aux saveurs du Sud.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "SAL-020",
      name: {
        fr: "Croque courgette",
      },
      kind: "daily",
      categoryName: "Salé & traiteur",
      status: "draft",
      priceCents: 650,
      proPriceHt: "5.54502",
      weightGrams: null,
      descriptionShort: {
        fr: "Croque végétarien à la courgette.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "SAL-021",
      name: {
        fr: "Croque monsieur rustique",
      },
      kind: "daily",
      categoryName: "Salé & traiteur",
      status: "draft",
      priceCents: 650,
      proPriceHt: "5.54502",
      weightGrams: null,
      descriptionShort: {
        fr: "Croque-monsieur sur pain de campagne, jambon et fromage.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "SAL-022",
      name: {
        fr: "Tranche légumes",
      },
      kind: "daily",
      categoryName: "Salé & traiteur",
      status: "draft",
      priceCents: 650,
      proPriceHt: "5.54502",
      weightGrams: null,
      descriptionShort: {
        fr: "Tranche garnie de légumes de saison.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "SAL-023",
      name: {
        fr: "Sandwich maraîcher",
      },
      kind: "daily",
      categoryName: "Salé & traiteur",
      status: "draft",
      priceCents: 700,
      proPriceHt: "5.97156",
      weightGrams: null,
      descriptionShort: {
        fr: "Sandwich végétarien aux légumes croquants.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "SAL-024",
      name: {
        fr: "Tartiflette (part)",
      },
      kind: "daily",
      categoryName: "Salé & traiteur",
      status: "draft",
      priceCents: 700,
      proPriceHt: "5.97156",
      weightGrams: null,
      descriptionShort: {
        fr: "La tartiflette en part individuelle, pommes de terre et reblochon.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "VIE-001",
      name: {
        fr: "Croissant",
      },
      kind: "daily",
      categoryName: "Croissants & pains au chocolat",
      status: "draft",
      priceCents: 200,
      proPriceHt: "1.70616",
      weightGrams: null,
      descriptionShort: {
        fr: "Le pur beurre, le vrai : un tourage patient et un feuilletage qui craque à la première bouchée.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "VIE-002",
      name: {
        fr: "Pain au chocolat",
      },
      kind: "daily",
      categoryName: "Croissants & pains au chocolat",
      status: "draft",
      priceCents: 220,
      proPriceHt: "1.87678",
      weightGrams: null,
      descriptionShort: {
        fr: "Feuilletage généreux et deux barres de chocolat qui ne font pas semblant.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "VIE-003",
      name: {
        fr: "Patte d'ours",
      },
      kind: "daily",
      categoryName: "Viennoiseries fines",
      status: "draft",
      priceCents: 300,
      proPriceHt: "2.55924",
      weightGrams: null,
      declaration: null,
      vat: {},
    },
    {
      sku: "VIE-004",
      name: {
        fr: "Pain aux raisins",
      },
      kind: "daily",
      categoryName: "Viennoiseries fines",
      status: "draft",
      priceCents: 250,
      proPriceHt: "2.13270",
      weightGrams: null,
      descriptionShort: {
        fr: "Spirale de crème pâtissière et raisins moelleux, roulée à la main.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "VIE-005",
      name: {
        fr: "Chausson aux pommes",
      },
      kind: "daily",
      categoryName: "Viennoiseries fines",
      status: "draft",
      priceCents: 300,
      proPriceHt: "2.55924",
      weightGrams: null,
      descriptionShort: {
        fr: "Feuilletage doré et pommes fondantes, comme à la sortie du four.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "VIE-006",
      name: {
        fr: "Brioche pralinée individuelle",
      },
      kind: "daily",
      categoryName: "Brioches",
      status: "draft",
      priceCents: 250,
      proPriceHt: "2.13270",
      weightGrams: null,
      descriptionShort: {
        fr: "Brioche moelleuse et pralines roses, la gourmandise version alpine.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "VIE-007",
      name: {
        fr: "Brioche pépites de chocolat",
      },
      kind: "daily",
      categoryName: "Brioches",
      status: "draft",
      priceCents: 270,
      proPriceHt: "2.30332",
      weightGrams: null,
      descriptionShort: {
        fr: "Mie filante et pépites de chocolat généreusement reparties.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "VIE-008",
      name: {
        fr: "Brioche au sucre",
      },
      kind: "daily",
      categoryName: "Brioches",
      status: "draft",
      priceCents: 230,
      proPriceHt: "1.96209",
      weightGrams: null,
      descriptionShort: {
        fr: "La brioche simple et bien faite, croustillante de sucre sur le dessus.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "VIE-009",
      name: {
        fr: "Pain au lait",
      },
      kind: "daily",
      categoryName: "Brioches",
      status: "draft",
      priceCents: 200,
      proPriceHt: "1.70616",
      weightGrams: null,
      descriptionShort: {
        fr: "Mie douce et moelleuse, le classique du goûter.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "VIE-010",
      name: {
        fr: "Brioche a tete",
      },
      kind: "daily",
      categoryName: "Brioches",
      status: "draft",
      priceCents: 250,
      proPriceHt: "2.13270",
      weightGrams: null,
      descriptionShort: {
        fr: "La brioche parisienne traditionnelle, façonnée a la main.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "VIE-011",
      name: {
        fr: "Grosse brioche 350 g",
      },
      kind: "daily",
      categoryName: "Brioches",
      status: "draft",
      priceCents: 1000,
      proPriceHt: "8.53081",
      weightGrams: 350,
      descriptionShort: {
        fr: "Grande brioche à partager, mie filante et croûte dorée.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "VIE-012",
      name: {
        fr: "Abricotin",
      },
      kind: "daily",
      categoryName: "Viennoiseries fines",
      status: "draft",
      priceCents: 250,
      proPriceHt: "2.13270",
      weightGrams: null,
      declaration: null,
      vat: {},
    },
    {
      sku: "VIE-013",
      name: {
        fr: "Pain chocolat-banane",
      },
      kind: "daily",
      categoryName: "Croissants & pains au chocolat",
      status: "draft",
      priceCents: 250,
      proPriceHt: "2.13270",
      weightGrams: null,
      descriptionShort: {
        fr: "Feuilletage garni de chocolat et de banane, une association qui claque.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "VIE-014",
      name: {
        fr: "Pain de mie brioché 500 g cuit",
      },
      kind: "daily",
      categoryName: "Brioches",
      status: "draft",
      priceCents: 650,
      proPriceHt: "5.54502",
      weightGrams: 500,
      descriptionShort: {
        fr: "Pain de mie brioche, mie filante, idéal pour le petit-déjeuner et le goûter.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "VIE-015",
      name: {
        fr: "Croix de Savoie",
      },
      kind: "daily",
      categoryName: "Viennoiseries fines",
      status: "draft",
      priceCents: 300,
      proPriceHt: "2.55924",
      weightGrams: null,
      declaration: null,
      vat: {},
    },
    {
      sku: "VIE-016",
      name: {
        fr: "Sablé suisse",
      },
      kind: "daily",
      categoryName: "Viennoiseries fines",
      status: "draft",
      priceCents: 380,
      proPriceHt: "3.24171",
      weightGrams: null,
      descriptionShort: {
        fr: "Pâte sablée, crème pâtissière et pepites de chocolat.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "VIE-017",
      name: {
        fr: "Croissant aux amandes",
      },
      kind: "daily",
      categoryName: "Croissants & pains au chocolat",
      status: "draft",
      priceCents: 300,
      proPriceHt: "2.55924",
      weightGrams: null,
      descriptionShort: {
        fr: "Croissant garni de crème d'amandes et repassé au four, amandes effilees dessus.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "VIE-018",
      name: {
        fr: "Pain au chocolat aux amandes",
      },
      kind: "daily",
      categoryName: "Croissants & pains au chocolat",
      status: "draft",
      priceCents: 300,
      proPriceHt: "2.55924",
      weightGrams: null,
      descriptionShort: {
        fr: "Pain au chocolat garni de crème d'amandes, gratiné aux amandes effilees.",
      },
      declaration: null,
      vat: {},
    },
    {
      sku: "VIE-019",
      name: {
        fr: "Gros cookie",
      },
      kind: "daily",
      categoryName: "Viennoiseries fines",
      status: "draft",
      priceCents: 400,
      proPriceHt: "3.41232",
      weightGrams: null,
      descriptionShort: {
        fr: "Cookie généreux, cœur moelleux et bords croustillants.",
      },
      declaration: null,
      vat: {},
    },
  ],
};
