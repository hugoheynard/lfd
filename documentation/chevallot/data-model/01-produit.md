# 01 — Anatomie d'un produit (le cas premium)

> 🔒 **Le socle figé des items** (`Product` / `ProductVariant` / `Category`, champs & invariants qui
> font foi pour Prisma) est dans [`02-catalogue-items.md`](./02-catalogue-items.md). **Ce document-ci**
> couvre l'**enrichissement éditorial premium** (récit, provenance, labels, médias, SEO) et la
> projection par canal — il n'altère pas le socle.

> Source de vérité du **quoi** : ce que la boulangerie vend, décrit **une seule fois**, de façon
> canonique et **neutre par rapport aux canaux**. Ni prix (couche 02), ni disponibilité (couche 03),
> ni ids de plateformes (couche 04) — trois rythmes de vie différents.

## Méthode : partir du cas le plus riche

Pour n'oublier aucun champ, on modélise à partir d'un **produit premium / signature** — le cas qui
mobilise *toute* la fiche. Un produit simple (une baguette) n'en remplit qu'une partie ; un produit
premium (une **Tarte aux fraises signature**, une **Galette des Rois**) exige le récit, la provenance,
les labels, les médias soignés, le SEO. On distingue trois natures de champ :

- 🟦 **Socle** — obligatoire pour tout produit vendable (identité, classement, variante).
- 🟨 **Premium** — enrichissement qui fait la valeur perçue (récit, provenance, labels, médias, SEO).
- 🟥 **Réglementaire** — non négociable en agroalimentaire (allergènes, ingrédients, conservation).

---

## 1. Identité & classification 🟦

| Champ | Type | Rôle | Notes |
|---|---|---|---|
| `id` | UUID | Identifiant interne stable | Ne change **jamais** |
| `sku` | string | Référence métier lisible, unique | Ex. `PATI-TARTE-FRAISE` |
| `name` | string | Désignation commerciale | « Tarte aux fraises » |
| `slug` | string | Identifiant URL | `tarte-aux-fraises` |
| `kind` | enum | `daily` \| `made_to_order` \| `resale` | Détermine la logique de dispo (couche 03) |
| `category_id` | UUID | Famille de rattachement | → `Category` (alignée familles caisse PI) |
| `has_variants` | bool | Possède des déclinaisons | Sinon variante « défaut » implicite |
| `unit_of_sale` | enum | `piece` \| `weight_kg` \| `lot` \| `portion` | |
| `is_active` | bool | Vivant dans le catalogue | `false` = retiré sans suppression |
| `default_tax_category` | enum | Régime TVA par défaut | Détail couche 02 |
| `tags` | string[] | Étiquettes libres | `signature`, `tradition`, `noel`, `bio` |
| `created_at`/`updated_at` | timestamp | Audit | |

`kind` (spécifique boulangerie) : **`daily`** (frais du jour, dispo = capacité de production) ·
**`made_to_order`** (sur commande, dispo = date retrait + délai + cut-off) · **`resale`** (revendu tel
quel — seul cas de vrai stock).

---

## 2. Contenu commercial premium 🟨

C'est ce qui distingue une fiche premium d'une fiche minimale. Le récit **vend**, surtout sur le web.

| Champ | Type | Rôle |
|---|---|---|
| `description_short` | string | Résumé (caisse, listes, cartes produit) |
| `description_long` | text (markdown) | Fiche complète web — texte éditorial |
| `story` | text? | Récit / savoir-faire : « façonnée à la main chaque matin… » |
| `provenance` | Provenance[]? | Origine des ingrédients nobles (voir ci-dessous) |
| `producer` / `brand` | string? | Signature maison / gamme (« Signature Chevallot ») |
| `pairing` / `suggestions` | string? | Accord / conseil de dégustation (premium web) |

`Provenance` : `{ ingredient, origin, label? }` — ex. `{ "beurre", "AOP Charentes-Poitou", "AOP" }`,
`{ "farine", "Moulin de Val d'Isère", null }`. Fait la crédibilité du positionnement premium.

---

## 3. Labels & certifications 🟨 (le marqueur premium)

| Champ | Type | Rôle |
|---|---|---|
| `certifications` | Certification[] | Labels officiels — preuve, pas marketing |
| `is_bio` | bool | Certifié bio (aussi porté par la fiche nutrition) |

`Certification` : `{ code, label, authority?, valid_until? }`. Ex. `bio` (AB/Eurofeuille), `label_rouge`,
`igp`, `aop`, `fait_maison`, `artisan_boulanger`, `commerce_equitable`. Certains ont des **règles
d'affichage légales** (logo, mentions) → l'adaptateur canal les rend, la donnée les déclare.

---

## 4. Médias 🟨

Le premium se joue beaucoup à l'image. Plusieurs assets, qualité maîtrisée, par usage.

| Champ (`MediaAsset`) | Type | Rôle |
|---|---|---|
| `id` | UUID | |
| `owner_type` / `owner_id` | enum / UUID | `product` \| `variant` \| `category` |
| `role` | enum | `hero` \| `gallery` \| `lifestyle` \| `thumbnail` \| `print` |
| `url` | string | Stockage / CDN |
| `alt` | string | Accessibilité + SEO |
| `position` | int | 0 = image principale |
| `focal_point` | {x,y}? | Recadrage propre selon les ratios de chaque canal |

> Chaque canal a ses contraintes (Shopify multi-format, vignette caisse PI, haute-déf pour l'impression
> B2B). On stocke le **master** + un `focal_point` ; les déclinaisons de taille sont dérivées, pas
> ressaisies.

---

## 5. Déclinaisons — `ProductVariant` 🟦

**C'est la variante, pas le produit, qui porte le prix et la disponibilité.** Un produit sans
déclinaison a une variante « défaut » unique.

| Champ | Type | Rôle |
|---|---|---|
| `id` | UUID | Stable |
| `product_id` | UUID | Produit parent |
| `sku` | string | Unique — ex. `PATI-TARTE-FRAISE-6P` |
| `name` | string | « 6 personnes » |
| `barcode` | string? | EAN13 — caisse PI & `resale` |
| `options` | map<string,string> | Axes — `{ "taille": "6 pers" }` |
| `weight_grams` | int? | Si vente au poids/portion |
| `is_default` | bool | Variante par défaut |
| `is_active` | bool | Vivante |
| `position` | int | Ordre d'affichage |

> **Règle** : on ne crée une variante que si elle a un **prix ou une disponibilité propre**. Sinon
> c'est une **option de préparation** (« bien cuit »), une note de commande — pas une déclinaison.

---

## 6. Réglementaire — `NutritionInfo` 🟥

**Obligatoire** (règlement INCO / UE 1169/2011). Porté au niveau `Product` (ou `ProductVariant` si la
recette diffère selon la déclinaison).

| Champ | Type | Rôle |
|---|---|---|
| `allergens` | AllergenCode[] (**GS1**) | Allergènes présents — stockage canonique GS1 |
| `may_contain` | AllergenCode[] (**GS1**) | Traces — « peut contenir » |
| `ingredients_text` | text | Liste d'ingrédients réglementaire |
| `nutrition_per_100g` | object? | Énergie, MG, sucres, sel… (selon obligations) |
| `conservation` | string? | Conseil conservation / DLC |
| `is_bio` | bool | Certifié bio |

> Stockage **GS1 `AllergenTypeCode`** → projection **INCO** (14 UE + libellés + mise en forme) à
> l'affichage. Mapping n:1, cf. [`05-allergenes-gs1-inco.md`](./05-allergenes-gs1-inco.md) et le code
> [`src/allergens`](../../../apps/chevallot-PIM-backend/src/allergens). Les **14 INCO** à couvrir :
> gluten, crustacés, œufs, poissons, arachides, soja, lait, fruits à coque, céleri, moutarde, sésame,
> sulfites, lupin, mollusques.

---

## 7. Recette / BOM (option) 🟨

Hors périmètre v1 de vente. À inclure **seulement si** on couvre la planification matières du labo.

`Recipe` : `{ id, product_variant_id, yield_quantity, components: RecipeComponent[] }` ;
`RecipeComponent` : `{ ingredient_id, quantity, unit }`. Permet de déduire les **besoins matières**
depuis le plan de production (couche 03). Décision de scope : **D3** dans [`todo.md`](../todo.md).

---

## 8. Projection par canal (ce que chaque canal consomme)

Le produit est canonique ; chaque adaptateur ne prend que ce dont il a besoin.

| Donnée | Shopify (C&C web) | Caisse PI / Helios | B2B / GDSN |
|---|---|---|---|
| Identité (`name`, `sku`) | ✅ | ✅ (`pos_family_code`) | ✅ |
| `slug`, SEO, `description_long`, `story` | ✅ | — | — |
| Médias `hero`/`gallery` | ✅ | `thumbnail` | `print` |
| Déclinaisons (`options`→variants) | ✅ | ✅ (`barcode`) | ✅ (unités logistiques) |
| Allergènes | **INCO** (filtré + gras) | INCO (libellés) | **GS1** (pass-through) |
| Nutrition, `ingredients_text` | ✅ | selon affichage | ✅ (fiche GDSN) |
| Labels / certifications | ✅ (logos) | éventuel | ✅ |

---

## 9. Ce qui n'est PAS ici (volontairement)

- **Prix** → `02-pricing-canaux.md` (un prix *par canal*, jamais un attribut produit).
- **Disponibilité / stock** → `03-disponibilite-production.md` (capacité de production, pas inventaire).
- **Ids Shopify / PI** → `04-publication-versioning.md` (table de mapping, ne pas polluer le canonique).

---

## 10. Questions ouvertes sur le produit

1. **`story` / `provenance` / `pairing`** : champs structurés (comme ci-dessus) ou bloc markdown libre
   dans `description_long` ? Le structuré = réutilisable par canal ; le libre = plus souple à éditer.
2. **Attributs extensibles** : prévoit-on un `attributes: jsonb` fourre-tout (par famille) pour les
   spécificités qu'on ne veut pas figer en colonnes (ex. « température de service », « allergie
   croisée labo ») ? (cohérent avec le `jsonb` d'ADR-05).
3. **Multilingue** : la vitrine est-elle FR seul, ou FR/EN (Val d'Isère = clientèle internationale) ?
   Impacte `name`/`description`/labels → `map<lang,string>` vs string simple.
4. **Niveau de la fiche nutrition** : `Product` suffit, ou certaines déclinaisons ont des recettes
   assez différentes pour porter leur propre `NutritionInfo` ?
