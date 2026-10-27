# Plan — la boutique affiche les allergènes et les traces

> ✅ **Bâti le 2026-10-27** (non commité au moment d'écrire) — fil
> `allergenTexts`, `AllergenNaming` au référentiel, colonne
> `catalog_items.allergen_texts` (migration additive
> `20261027150000_les_libelles_d_allergenes_par_langue`), `ShopItemView.allergens`
> (optionnel : absent quand le commerce ne sait pas), fiche boutique. État
> décrit dans
> [`data-model/05-allergenes-gs1-inco.md`](data-model/05-allergenes-gs1-inco.md).
> Écarts au texte : une liste amputée (`incomplete`) n'est pas servie ; le
> flux de l'agence vitrine n'est pas élargi.
>
> **Deux décisions de Hugo du même jour, bâties avec le lot** (§5 ci-dessous).
>
> 📝 Plan d'origine (2026-10-27). Constat du lot « traces jusqu'au
> commerce » (`322c34af5`) : la boutique n'affiche **aucun** allergène, ni
> déclarés ni traces (`product-sheet.ts` : « pièce et allergènes ne traversent
> pas encore » ; `ShopItemView` n'a aucun champ allergène). Or l'information
> sur les allergènes est due **avant l'achat** à distance, même pour du non
> préemballé (règlement (UE) 1169/2011, art. 14 et 44). Décisions de Hugo du
> 2026-10-27, « ok pour les trois ».

## 1. Les trois décisions

- **(a) Des libellés, pas des codes.** La vue publique porte ce que le client
  lit.
- **(b) Les libellés viennent du référentiel, dans le fil**, dans les trois
  langues. La boutique ne recopie aucun dictionnaire d'allergènes (le
  référentiel en est la seule source, D6).
- **(c) « Peut contenir » n'apparaît jamais sans les allergènes.** Une fiche
  affiche toujours ses allergènes (ou « Aucun allergène » quand c'est déclaré)
  avant ses traces ; une fiche sous précaution le dit : « Information précise
  non disponible ».

## 2. Le chemin

1. **Fil** (`packages/catalog-sync/src/snapshot.ts`) : `allergenLabels` existe
   en français ; ajouter les libellés **par langue** (fr, en, it) des
   allergènes et des traces — ajout sans changer de version, avec défaut,
   comme `mayContain` (`322c34af5`).
2. **Référentiel** : la projection les remplit depuis le référentiel des
   allergènes (`AllergenCatalogueReader` ou le lecteur INCO déjà utilisé pour
   `allergenLabels`).
3. **Commerce** : colonnes additives sur `catalog_items` si les libellés
   traduits doivent être rangés (ou un jsonb unique par langue) ; la vue
   publique `ShopItemView` (`packages/contracts/src/shop-catalogue.ts`)
   gagne un bloc `allergens` : `{ state: 'declared' | 'none' |
'precautionary', contains: string[], mayContain: string[] }`, déjà dans
   la langue de la requête. Élargir cette vue est une **décision de
   sécurité** (son JSDoc) : on n'y met que ce qui est public — des libellés
   d'allergènes, rien d'autre ; l'e2e qui énumère ses clés est mis à jour.
4. **Boutique** : fiche produit — « Allergènes : … », « Peut contenir : … »,
   ou « Aucun allergène », ou « Information précise non disponible — peut
   contenir : … » ; textes dans les dictionnaires fr/en/it (`pnpm
copy:digest`) ; budget du bundle initial (`ng build -c cloudflare`) et
   accessibilité (porte axe) tenus.

## 3. Ce qui ne change pas

La déclaration enregistrée, les règles A et B (`effectiveAllergens`), le
pro (sa vue suit la même règle si elle affiche les allergènes, à vérifier).

## 4. Tests

Unitaires à chaque couche ; e2e : une fiche déclarée, une « aucun
allergène », une sous précaution arrivent à la vue publique avec le bon
état et les bons libellés dans les trois langues ; specs de la fiche
boutique ; porte axe.

## 5. Décisions ajoutées le 2026-10-27 (Hugo), bâties

- **La forme, validée sur maquette.** Sur la fiche ouverte, sous le prix et
  la description : « Allergènes » (liste), puis « Peut contenir » (plus
  discret) ; « Aucun allergène » seul quand c'est déclaré ; sous précaution,
  les allergènes de la composition puis un encadré d'avertissement
  (`fold-callout`) « Information précise non disponible » suivi de « Peut
  contenir » et de la liste complète. Jamais dans le panier.
- **Un réglage global de la vitrine** : « Allergènes en boutique : sur la
  fiche ouverte seulement | aussi dans la galerie », défaut « fiche ouverte
  seulement ». Table `public.storefront_settings` (une ligne `main`, migration
  additive `20261027160000_la_place_des_allergenes_en_vitrine`, à relire),
  à part de la révision de la vitrine : régler n'attend pas « Enregistrer »
  et ne refuse pas un éditeur ouvert. `GET|PUT /admin/storefront/settings`
  (ressource `b2b_storefront`), tracé `storefront.allergen_display_changed`
  sur le sujet de la vitrine. La boutique le lit sur la page de vitrine
  qu'elle charge déjà (`PublicStorefrontPageView.allergenDisplay`, servi sur
  toute page) — aucun appel de plus. En mode galerie, la carte du rayon dit
  « Contient : … · Peut contenir : … » (ou « Aucun allergène », ou
  « Information précise non disponible »), en texte coupé à deux lignes.
- **Ce qui n'a pas été fait** : retirer les allergènes de la vue catalogue en
  mode « fiche seulement ». La fiche s'ouvre depuis le catalogue déjà chargé,
  sans appel par article ; les libellés y coûtent quelques octets par
  article (mesuré : bundle initial inchangé, 1,40 Mo).
