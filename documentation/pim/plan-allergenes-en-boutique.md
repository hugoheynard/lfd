# Plan — la boutique affiche les allergènes et les traces

> 📝 **Plan, rien n'est bâti** (2026-10-27). Constat du lot « traces jusqu'au
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
