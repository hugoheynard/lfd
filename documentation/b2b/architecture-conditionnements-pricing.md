# Conditionnements (PIM) × prix (canonique PIM + dégressif B2B)

> **But.** Modéliser les **conditionnements** (unité, sachet de 10, carton de 50…)
> et le **prix** proprement, en séparant ce qui est un **fait produit** (PIM) de ce
> qui est une **décision commerciale** (B2B). Se reflète en B2B par un **select de
> conditionnements** (qui remplace le toggle unité/pack provisoire) + un prix résolu.
>
> Statut : **conception.** Date : 2026-08-04, **révisé le 2026-08-23**.
> Voisin : [`audit-catalogue-boutique-b2b.md`](audit-catalogue-boutique-b2b.md).

## Point de départ (ce qui existe déjà)

- Le PIM a **`ProductVariant`** = « la **déclinaison**, l'unité réellement vendue
  (R4) » : `sku` propre, `options` (JSON), `attributes` (JSON), `isDefault`,
  `position`. Tout produit naît **avec sa déclinaison par défaut** (invariant
  transactionnel — `product-commands.service.ts`).
- **Le PIM ne porte AUJOURD'HUI ni prix ni `unitsPerPack`.** Le prix vit dans le
  **seed B2B** (`catalogue-seed.ts`, hardcodé du CSV). Le contrat de commande
  (`packages/contracts/src/order.ts`) dit déjà « le serveur ré-résout les prix
  depuis le catalogue (autorité) » — l'intention est là, le branchement non.
- Provisoire côté B2B : `FoldProduct` a gagné `step`/`packLabel` + un toggle
  unité↔pack sur la carte. **Ce toggle est un cas particulier** du select de
  conditionnements ci-dessous — il sera remplacé.

## Le modèle en couches

```
┌─ PIM — faits produit (channel-agnostic) ─────────────────────────────┐
│ Product                                                              │
│  └─ variants[] = DÉCLINAISONS (l'unité réellement vendue, R4)         │
│       · sku propre · allergènes · nutrition · poids NET               │
│       · prix canonique de l'unité                                     │
│       └─ packagings[] = CONDITIONNEMENTS (vente en volume)            │
│            · type × quantity → libellé DÉRIVÉ ("Carton de 20")        │
│            · sku propre       (le pro commande par réf)               │
│            · poids BRUT       (emballage inclus — pas le net + n)     │
│            · prix canonique   = TARIF de liste, PRÉ-altération        │
│            · canaux propres   (un plateau peut se vendre à emporter)  │
└──────────────────────────────────────────────────────────────────────┘
                 │  (le PIM expose structure + prix canonique)
                 ▼
┌─ B2B — pricing commercial (altérations) ─────────────────────────────┐
│ Résout (variant, quantité, [client]) → prix final :                  │
│   · dégressif DE VOLUME (achète 5 cartons → -x%)                      │
│   · remises retrait / frais de zone (CartAdjustment — déjà là)        │
│   · prix négocié client (plus tard)                                  │
│ Prend le prix canonique PIM en entrée, l'ALTÈRE. Jamais dans le PIM.  │
└──────────────────────────────────────────────────────────────────────┘
                 │
                 ▼
┌─ B2B — UI catalogue ─────────────────────────────────────────────────┐
│ <fold-select> conditionnements   ← ceux de la DÉCLINAISON choisie     │
│ prix HT + sous-total             ← résolu par le PRICING B2B          │
└──────────────────────────────────────────────────────────────────────┘
```

**La frontière clé.** Le PIM porte le **prix canonique** (le tarif : le carton a
son prix de liste, l'unité le sien — un fait catalogue). Le B2B porte les
**altérations** : dégressif _de volume_, remises, négocié. Le « carton moins cher
à l'unité » n'est donc PAS un dégressif — c'est simplement le prix de liste du
carton, dans le PIM. Le dégressif, lui, dépend de la **quantité commandée** (ou du
client), et vit côté B2B.

## Décisions

> **Révision du 2026-08-23 — la décision 1 est RENVERSÉE.** Elle disait
> « conditionnement = `ProductVariant` ». Une maquette de fiche produit a posé la
> question que la conception de 2026-08-04 n'avait pas posée : **« carton de 20
> DE QUOI ?»** — de parts individuelles, ou de tartes 6 parts ?
>
> Dans le modèle plat, « Part individuelle », « Format 6 parts » et « Carton de
> 20 » sont trois lignes du même niveau, et rien ne dit ce que le carton
> contient. Le conditionnement n'est pas une déclinaison de plus : c'est une
> **unité de vente en volume qui emballe une déclinaison**. La relation est
> l'information, et un modèle plat la perd.
>
> Le verrou était encore gratuit à ouvrir : au 2026-08-23, ni `unitsPerPack` ni
> la moindre occurrence de « conditionnement » n'existaient dans `src/pim`. Rien
> n'a été réécrit — seulement pas écrit.
>
> Ce que la révision NE change pas : les décisions 3 (prix canonique dans le PIM)
> et 4 (dégressif en couche B2B) tiennent, et la frontière PIM/B2B est
> inchangée. Seul le porteur du prix change : le conditionnement au lieu de la
> déclinaison-conditionnement.

1. **Conditionnement = agrégat propre** (`ProductPackaging`), rattaché à **une
   déclinaison** par clé étrangère. Il porte son `sku`, son `type`
   (`carton | sac | plateau`), sa `quantity`, son poids brut, son prix canonique
   et ses canaux.
2. **Le libellé est DÉRIVÉ**, jamais saisi : `type` × `quantity` → « Carton de
   20 ». Sinon deux personnes écrivent « Carton 20 » et « carton de 20 » pour la
   même chose — le même argument que le slug proposé depuis le nom.
3. **Prix canonique de base DANS le PIM** — sur la déclinaison ET sur le
   conditionnement. C'est le **tarif de référence, pré-altération**. Un carton de
   20 ne vaut pas 20 × l'unité : c'est le principe même de la vente en volume, et
   un prix dérivé ne saurait pas exprimer la remise de gros qui est la raison
   d'être du conditionnement. `priceCents`, entier, HT, EUR.
4. **Dégressif de volume + altérations = couche pricing B2B**, jamais le PIM. Elle
   prend le prix canonique PIM en entrée. S'appuie sur la résolution serveur
   existante (celle des `CartAdjustment`).
5. **Le B2B reflète les conditionnements par un `fold-select`** (≥2), qui remplace
   le toggle unité↔pack. 1 seul conditionnement → pas de select. Le select liste
   les conditionnements de la déclinaison choisie, plus l'unité elle-même.
6. **Les canaux sont propres au conditionnement** (2026-08-23). La maquette
   supposait « B2B uniquement », mais un plateau de 6 se vend à emporter. Hériter
   de la famille rendrait le cas inexprimable, et c'est justement le cas qui
   justifie un conditionnement.

## Chantier (ordre)

**Phase PIM (structure + prix canonique) — on commence ici.**

- [ ] Schéma : modèle `ProductPackaging` (FK vers `ProductVariant`), `sku`
      unique, `type`, `quantity`, `grossWeightGrams`, `priceCents`, `channels`.
      **Le poids brut est propre au conditionnement** — emballage inclus — et ne
      se déduit PAS du poids net de la déclaration nutritionnelle. Sans lui, pas
      d'expédition B2B.
- [ ] Domaine / commands / events : créer/éditer une déclinaison-conditionnement
      (respecter l'event-sourcing + les ADRs du PIM).
- [ ] **UI fiche produit** : éditer les déclinaisons (conditionnements) + le prix
      canonique. → **Prérequis UX ci-dessous.**

**UX fiche produit — bug/refonte à faire d'abord :**

- [ ] Aujourd'hui « Éditer » ouvre une **div au-dessus de la table** ; ça doit
      **ouvrir la page produit** (route dédiée, comme `create-product`). L'édition
      d'un produit = une vraie page, pas un panneau inline — c'est là que les
      déclinaisons + prix canonique se géreront.

**Phase B2B (pricing + UI) — ensuite.**

- [ ] Consommer les conditionnements PIM (remplacer le seed hardcodé).
- [ ] Couche pricing : résoudre le prix canonique par variante, puis appliquer le
      dégressif de volume + altérations.
- [ ] Catalogue : `fold-select` de conditionnements (carte + order-pad), le pas du
      stepper = `unitsPerPack` du conditionnement choisi, prix/sous-total via le
      pricing. Retirer le toggle unité↔pack provisoire.

## À trancher au moment de coder (pas bloquant maintenant)

- **Forme du dégressif B2B** : paliers de quantité (buy N+ → -x%) vs grille par
  client. (Reco : paliers de quantité d'abord.)
- **Devise / HT** : `priceCents` entier, HT, EUR (aligné sur le contrat commande).
