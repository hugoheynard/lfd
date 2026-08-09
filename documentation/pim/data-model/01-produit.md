# 01 — Éditorial (couche ✍️) : ce qui fait la fiche premium

> 🔒 **Ce document ne décrit PAS le socle.** L'identité (`Product` / `ProductVariant` / `Category` /
> `Collection`), ses champs et ses invariants sont dans
> [`02-catalogue-items.md`](./02-catalogue-items.md), qui fait **seul** autorité. Le réglementaire est
> dans [`03-nutrition.md`](./03-nutrition.md).
>
> Ici : uniquement l'**enrichissement éditorial** — récit, provenance, labels, médias, SEO. Ni prix,
> ni disponibilité, ni ids de plateformes ([`04`](./04-composition-et-canaux.md)).

## Méthode : partir du cas le plus riche

Pour n'oublier aucun champ, on modélise à partir d'un **produit premium / signature** — le cas qui
mobilise _toute_ la fiche. Une baguette n'en remplit qu'une partie ; une **Tarte aux fraises
signature** ou une **Galette des Rois** exige le récit, la provenance, les labels, les médias
soignés, le SEO.

Cette couche est **entièrement optionnelle** : la ligne `product_editorial` n'existe que si quelqu'un
a écrit quelque chose (motif _shared primary key_, cf. [`04`](./04-composition-et-canaux.md#le-motif--shared-primary-key)).

---

## 1. `ProductEditorial` — PK/FK `product_id`

| Champ                  | Type                      | Rôle                                                        |
| ---------------------- | ------------------------- | ----------------------------------------------------------- |
| `description_short` 🌐 | LocalizedText?            | Résumé (listes, cartes produit, écran caisse)               |
| `description_long` 🌐  | LocalizedText? (markdown) | Fiche complète web                                          |
| `story` 🌐             | LocalizedText?            | Récit / savoir-faire : « façonnée à la main chaque matin… » |
| `provenance`           | `Provenance[]`            | Origine des ingrédients nobles                              |
| `brand`                | string?                   | Signature maison / gamme (« Signature Chevallot »)          |
| `pairing` 🌐           | LocalizedText?            | Accord / conseil de dégustation                             |
| `seo_title` 🌐         | LocalizedText?            |                                                             |
| `seo_description` 🌐   | LocalizedText?            |                                                             |

`Provenance` : `{ ingredient, origin, label? }` — ex. `{ "beurre", "AOP Charentes-Poitou", "AOP" }`,
`{ "farine", "Moulin de Val d'Isère", null }`. C'est ce qui fait la crédibilité du positionnement
premium — donc **structuré**, pas noyé dans le markdown : chaque canal le rend à sa façon.

## 2. Labels & certifications (le marqueur premium)

`ProductCertification` : `(product_id, code)` en PK composite, plus `authority?`, `valid_until?`.

Codes : `bio` (AB / Eurofeuille), `label_rouge`, `igp`, `aop`, `fait_maison`, `artisan_boulanger`,
`commerce_equitable`. Certains ont des **règles d'affichage légales** (logo, mentions) → l'adaptateur
canal les rend, la donnée les déclare.

> ⚠️ **Pas de booléen `is_bio`.** Le premier jet en portait un sur le produit _et_ un sur la fiche
> nutrition, en plus du code `bio` dans les certifications : trois sources de vérité pour un même
> fait, sans règle de préséance. `certifications` fait foi, seul. « Est bio » se calcule.

## 3. Médias

Le premium se joue beaucoup à l'image : plusieurs assets, qualité maîtrisée, par usage.

`MediaAsset` est un **agrégat propre** (cycle de vie d'upload, réutilisable) :

| Champ         | Type          | Rôle                                              |
| ------------- | ------------- | ------------------------------------------------- |
| `id`          | UUID v7       |                                                   |
| `url`         | string        | Stockage / CDN                                    |
| `alt` 🌐      | LocalizedText | Accessibilité + SEO                               |
| `focal_point` | `{x,y}?`      | Recadrage propre selon les ratios de chaque canal |

L'attachement passe par des **tables de liaison dédiées** — `product_media`, `variant_media`,
`category_media` — portant `(owner_id, media_id, role, position)`.

> ⚠️ **Pas de FK polymorphe** (`owner_type` + `owner_id`). Postgres ne peut alors garantir **aucune**
> intégrité référentielle, et l'appartenance à l'agrégat devient illisible. Trois petites tables
> valent mieux qu'une colonne discriminante.

`role` : `hero` · `gallery` · `lifestyle` · `thumbnail` · `print`. `position` : 0 = principale.

> Chaque canal a ses contraintes (Shopify multi-format, vignette caisse PI, haute-déf pour
> l'impression B2B). On stocke le **master** + un `focal_point` ; les déclinaisons de taille sont
> **dérivées**, jamais ressaisies.

---

## 4. Ce que chaque canal consomme de cette couche

| Donnée                                      | Shopify (C&C web)  | Caisse PI / Helios | B2B     |
| ------------------------------------------- | ------------------ | ------------------ | ------- |
| `description_short`                         | ✅                 | ✅ (tronqué)       | ✅      |
| `description_long`, `story`, `pairing`, SEO | ✅                 | —                  | —       |
| `provenance`                                | ✅                 | —                  | ✅      |
| Médias                                      | `hero` + `gallery` | `thumbnail`        | `print` |
| Certifications                              | ✅ (logos)         | éventuel           | ✅      |

Le **comment** de cette projection (bindings, overrides, état de synchro) est dans
[`04-composition-et-canaux.md`](./04-composition-et-canaux.md).

## 5. Recette / BOM — hors périmètre

À inclure **seulement si** on couvre la planification matières du labo. Forme pressentie :
`Recipe { id, variant_id, yield_quantity, components: { ingredient_id, quantity, unit }[] }`.
Décision de scope : **D3** dans [`todo.md`](../todo.md).

## 6. Questions ouvertes

1. **`story` / `provenance` / `pairing` structurés ou markdown libre ?** Tranché ici en faveur du
   **structuré** (réutilisable par canal) — à confirmer à l'usage, quand quelqu'un aura réellement
   saisi dix fiches.
2. **Niveau de l'éditorial** : produit uniquement, ou certaines déclinaisons méritent-elles leur
   propre récit ? (par défaut : **produit** — c'est le produit qui raconte une histoire, pas la
   taille 6 personnes).
