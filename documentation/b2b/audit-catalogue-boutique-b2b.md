# Audit — Catalogue boutique B2B (design + features) + roadmap

> **But du doc.** Cadrer la montée en gamme du catalogue de la boutique B2B (La
> Folie Coffee) : où on en est, ce que font les vrais catalogues pro, les manques
> classés par sévérité, et une **roadmap cochable** qu'on attaque point par point.
> Point de départ concret demandé par le produit : **pouvoir définir une quantité
> avant d'ajouter au panier**.
>
> Statut : **audit + plan, rien d'implémenté.** Date : 2026-08-04.

## Périmètre & fichiers concernés

Front B2B (`apps/lfc-B2B-platform-frontend`) :

- `src/shared/fold-product-card/` — la carte produit (`fold-product-card.{ts,html,scss}`) + son modèle `fold-product.model.ts` (`FoldProduct`). Écrite aux conventions fold → candidate à remonter dans `fold-ng`.
- `src/app/catalogue/product-catalogue/` — le navigateur (filtres, recherche, favoris, pagination, grille).
- `src/app/boutique/boutique-page/` — la page (hero bannières + « à la une » + catalogue).
- `src/app/data/cart.service.ts` — le panier (localStorage `id→qty`, dérivés `computed`).
- `src/app/data/catalogue-seed.ts` — le seed (92 produits copiés du PIM ; colonnes `[sku, nom, slug, prix€, poids(g), catégorie, description, flags]`).

## Verdict

**C'est une très bonne vitrine B2C qui porte un badge B2B.** Le socle de
présentation (fold) est propre ; la **couche « commande pro »** — celle qui
distingue un catalogue B2B d'une boutique grand public — est **quasi absente**.
« Quantité avant ajout » n'est pas un détail : c'est le symptôme n°1 d'un
**modèle produit resté présentationnel**.

## Le socle honnête (ce qui marche déjà)

- Carte à ratio média constant, placeholder initiale, badge d'angle, favoris,
  lazy-loading image.
- Rupture → ruban + « Me prévenir » ; avertissement « plus que N jours ».
- Filtre catégories (multiselect), recherche, favoris-only, pagination
  « Voir plus » + paginator, empty-state.
- Rail « à la une » éditorial + bannières hero.
- **Le `CartService` est déjà prêt pour la quantité** : `add(id, qty)`,
  `setQty(id, qty)`, dérivés `count`/`totalEur`, persistance `id→qty`. Le blocage
  « qté avant ajout » est **100 % dans l'UI de la carte** (`boutique-page.onAdd`
  appelle `cart.add(id)` → qté 1 codée en dur). La plomberie est prête.

## Le bon benchmark : les distributeurs food-service, pas Shopify

La référence n'est pas Amazon grand public, c'est **Metro / Transgourmet / Brake /
Pro à Pro / Ankorstore / Faire** : des gens qui vendent à des pros qui
**recommandent les mêmes réfs chaque semaine, en volume, au colis**. Ce qu'ils
cochent systématiquement et qui manque ici :

| #   | Attendu B2B pro                                                        | Présent ici ? |
| --- | ---------------------------------------------------------------------- | ------------- |
| 1   | Commande **par référence** (SKU visible + recherchable)                | ❌            |
| 2   | **Order pad / commande rapide** (table dense réf→qté→ajouter, clavier) | ❌            |
| 3   | **Colisage / PCB** (« par combien » : par 12, par carton, multiple)    | ❌            |
| 4   | **Prix HT** + unité vs colis + **€/kg** + **paliers dégressifs**       | ❌            |
| 5   | **Recommander la dernière commande** / listes récurrentes              | ❌            |
| 6   | **Dispo fine** (stock chiffré, délai, date de livraison/ligne)         | ❌ (binaire)  |
| 7   | **Vue liste dense** en plus de la grille                               | ❌            |
| 8   | **Minimum de commande** visible/bloquant                               | ❌            |

## Audit par axe (sévérité)

### 1. Quantité & ajout — 🔴 le trou béant (sujet P0)

- Aucun sélecteur de quantité ; ajout = 1. Pour une boulangerie qui vend au pro
  (croissant 2 €), commander = « 60 croissants, 24 pains au choc » — cliquer 60
  fois est absurde.
- Pas de **stepper +/–** ni saisie directe ; pas de **multiple de commande (PCB)** ;
  pas de **min par ligne**.
- Pas d'état **« déjà N au panier / modifier »** sur la carte.
- CTA en `emphasis="soft"` → **trop faible pour un geste d'achat** ; devrait
  devenir un **« Ajouter N »** solide.
- Pas d'**unité de commande** explicite (pièce / colis / kg).

### 2. Prix B2B — 🔴

- `FoldProduct.price` est une **chaîne pré-formatée** (`"2,00 €"`), pas un
  numérique → impossible de calculer sous-total ligne, €/kg, paliers, HT/TTC sur
  la carte.
- Pas de **HT/TTC** (B2B → référence = **HT**), TVA=0 en placeholder.
- Pas de **prix unité vs prix colis**, pas de **dégressif par quantité**, pas de
  **prix négocié client** (à relier plus tard à l'activation/`agreedPaymentTerm`
  déjà présents côté admin).

### 3. Identité produit & donnée — 🟠

- **La référence (SKU) n'est jamais affichée** — or le pro commande _par réf_. Le
  seed a `sku`, `weightGrams`, `slug` : le mapping `FoldProduct` les **jette**.
- Pas de **fiche produit détaillée** (la carte est le seul niveau) : conservation,
  DLC, allergènes, marque, conditionnement.
- Pas de **€/kg** alors que la donnée poids existe.

### 4. Recherche & découverte — 🟠

- Recherche **sur le nom seul** (`p.name.includes`) : pas de **réf/SKU**, pas de
  tolérance faute, pas de synonymes.
- **Aucun tri** (prix, nom, nouveauté, popularité, déjà commandé).
- Pas de **quick-order / order-pad**, pas d'**import liste/CSV**, pas de
  **recommander la dernière commande**.

### 5. Disponibilité & logistique — 🟠

- Dispo **binaire** (rupture oui/non). Pas de **stock chiffré**, pas de **délai**,
  pas de **date de livraison par ligne**, pas de **substitut** proposé en rupture.

### 6. Densité & mode de vue — 🟠

- **Grille de cartes uniquement.** Manque la **vue liste/table dense** (réf, nom,
  PCB, prix, qté, ajouter par ligne) — le mode par défaut des acheteurs pro qui
  saisissent 40 lignes.

### 7. Feedback & garde-fous — 🟠

- L'ajout ne donne **aucun retour** sur la carte (pas de « ✓ N au panier »).
- Pas de **minimum de commande** signalé/bloquant, pas de sous-total courant à
  côté du catalogue.

### 8. Craft / design (fin) — 🟡

- Ratio média constant OK ; le **prix** mérite plus de poids typographique.
- L'empilement des rubans (rupture > warn > badge) est correct mais **le pied de
  carte va se charger** (qté + prix HT/colis + CTA « Ajouter N ») → **le
  `fpc-foot` doit être repensé** : c'est là que tout se joue.

## Méta-conclusion (la vraie contrainte)

**On ne visse pas des features B2B sur une carte présentationnelle.** 6 des 8 axes
butent sur le même mur : `FoldProduct` porte un **prix string** et **zéro
sémantique de commande** (pas de numérique, PCB, unité, réf, stock, paliers). Le
manque « quantité avant ajout » est juste la première brique qui tombe.

Donc l'ordre juste n'est pas « ajouter un input qté » en isolation, mais
d'enrichir le **contrat produit** en lockstep — a minima, dès le P0 : prix
numérique + `packSize`/`step` + `minQty` + `unit` + `reference`.

## Roadmap (on coche point par point)

### P0 — Quantité avant ajout, carte + order-pad (fait pour de vrai B2B)

1. [ ] **Enrichir `FoldProduct`** (minimum viable, sans casser l'existant) :
       `reference` (SKU), `priceEurNumeric` (**HT**), `unit`
       (`'piece' | 'colis' | 'kg'`), `packSize`/`step` (défaut 1), `minQty`
       (défaut 1). Garder `price` string d'affichage le temps de migrer. Mapper
       depuis le seed (`sku`, `prix€` → HT numérique).
2. [ ] **Stepper de quantité générique** (réutilisable carte + order-pad, piloté
       parent) : +/–, saisie clavier, **respect du multiple (`step`/PCB)** et du
       **`minQty`**, clamp propre, a11y (label, `aria`, focus visible). Reste
       fold-compatible (candidat `fold-ng`, zéro logique panier dedans).
3. [ ] **Carte : CTA « Ajouter N »** (emphasis solide) → `cart.add(id, qty)` ;
       **état « déjà N au panier »** (stepper édite la ligne via `cart.setQty`) ;
       **sous-total ligne live** (HT × qté). **Repenser `fpc-foot`** pour loger
       stepper + prix HT + CTA sans casser la grille ni l'empilement des rubans.
4. [ ] **Order-pad (vue liste dense)** : toggle grille ↔ liste dans le
       `ProductCatalogue` ; table réf, nom, PCB/unité, prix HT, **stepper + ajouter
       par ligne**, saisie clavier de haut en bas. Partage le stepper du point 2.
5. [ ] Specs (Vitest) : clamp `min`/`step`, « Ajouter N », édition d'une ligne
       existante, rupture (pas de stepper), parité carte ↔ order-pad.

### P1 — Vitesse pour les récurrents

- [ ] **Recherche par référence** (SKU) en plus du nom + **tri** (prix, nom,
      nouveauté).
- [ ] **Recommander la dernière commande** (pré-remplit le panier depuis un
      historique).

### P2 — Finesse commerciale & logistique

- [ ] **Prix HT** + **€/kg** + **paliers dégressifs** (modèle de prix B2B).
- [ ] **Dispo fine** : stock chiffré, délai (« sous 48h »), date de livraison par
      ligne, substitut en rupture.
- [ ] **Minimum de commande** visible + bloquant au checkout.
- [ ] **Fiche produit détaillée** (conservation, DLC, allergènes, marque,
      conditionnement).

## Décisions produit (verrouillées 2026-08-04)

1. **Colisage = `step` par produit, défaut 1.** Le modèle porte `packSize`/`step`
   **par produit** ; défaut = unité libre (`step = 1`). On pose un PCB (par 12, par
   carton) **uniquement** là où ça a du sens. Le stepper contraint au multiple et
   au `minQty`.
2. **Prix affiché = HT.** Référence catalogue en **HT** (standard B2B) ; la TVA
   s'ajoute au checkout. Le pied de carte affiche HT.
3. **Order pad dès le P0.** La **carte** ET la **vue liste dense** sont livrées en
   P0 et **partagent le même stepper** (composant/quantité générique). Le P1
   ci-dessous est allégé en conséquence (recherche réf, tri, reorder).

## Note d'archi

`fold-product-card` est écrite aux conventions fold et **destinée à remonter dans
`fold-ng`**. Le stepper de quantité + l'état « déjà au panier » doivent donc
rester **génériques et pilotés par le parent** (inputs/outputs), sans logique
panier LFC dans la carte — comme le reste de ses affordances (favori, action).
