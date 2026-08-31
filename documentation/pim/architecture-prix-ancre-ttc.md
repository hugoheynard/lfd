# Le prix ancré au TTC — et le rapport prix public / prix pro

> **État : tranches 1 et 2 livrées** (2026-08-31) — le rapport a une maison, une
> API, un écran et ses tests. **Rien ne le lit encore : aucun prix n'a changé**,
> et l'écran le dit. Les tranches 3 et 4 sont décrites ici mais pas écrites.
>
> Voisins : [`contextes-et-points-de-vente.md`](contextes-et-points-de-vente.md)
> — où vit le taux, et pourquoi une carte naît d'une règle fiscale ;
> [`../b2b/architecture-resolution-de-prix.md`](../b2b/architecture-resolution-de-prix.md)
> — la chaîne d'étages, qui reste **HT de bout en bout** et que ce chantier ne
> touche pas.

---

## 1. Le problème

Toute la chaîne est ancrée **HT** : `product_variant.price_cents` est un prix
canonique hors taxe, la TVA se résout par contexte, et le TTC se calcule.

Ça décrit correctement une facture professionnelle. Ça décrit mal une vitrine.
Le même croissant est à 1,20 € sur l'étiquette qu'on l'emporte (5,5 %) ou qu'on
le mange en salle (10 %) : **le prix affiché est le même, et c'est le HT qui
diffère**. Le prix de vitrine n'est pas une conséquence, c'est la décision.

Il faut donc un second **ancrage** — un prix qui se lit TTC et dont chaque taux
dérive son propre HT — sans retirer le premier, dont le B2B dépend entièrement.

## 2. Ce que le modèle savait déjà faire

Le point rassurant, et il est structurel : le référentiel porte **un prix, et N
taux par contexte**. C'est exactement la forme qu'un ancrage TTC demande.

Il n'y a donc **pas de table « prix par contexte » à créer**. Un prix unique
ancré au TTC, traversé par trois taux, produit trois HT — le modèle actuel, lu à
l'envers.

## 3. Le rapport prix public / prix pro

Sans lui, un modèle TTC obligerait à porter **deux prix** par déclinaison (un TTC
de vitrine, un HT professionnel) et à les tenir d'accord à la main. Avec lui, un
seul prix reste la source de vérité.

```
Prix public TTC (saisi)
  × rapport                → prix pro TTC (DÉRIVÉ)
  ou prix pro TTC POSÉ     → qui gagne sur le dérivé
  ÷ (1 + taux du contexte) → un HT par contexte
```

### Trois décisions, et pourquoi

| Décision                                | Pourquoi                                                                                                                                                                          |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Global**, pas par famille             | « le pro paie 10 % de moins » est une décision de maison. Une dérogation par famille s'ajoutera SOUS ce réglage le jour où le besoin existera — elle ne le remplacera pas.        |
| **Dérivé**, avec montant posé qui gagne | Le dérivé garantit qu'aucun prix ne dérive tout seul ; le montant posé garde la main sur les prix ronds. C'est la règle déjà appliquée par `CatalogItemOverride` côté plateforme. |
| **TTC / TTC**                           | Donc il s'applique **avant** toute TVA. Un rapport HT/HT ne serait pas le même nombre dès que deux contextes ont deux taux, et rien à l'écran ne le dirait.                       |

### Où il n'est PAS rangé, et pourquoi

- **Pas en colonne sur `Category`** — c'est exactement ce que la famille vient de
  perdre avec `emporter_tva_id` / `sur_place_tva_id` / `b2b_tva_id`. Rouvrir
  cette porte serait le seul contresens vraiment coûteux du chantier.
- **Pas dans `PriceRule`** — la mécanique y est (`scopeType`, `mode: percent`,
  `value` en points de base, fenêtres datées), mais c'est le mauvais contexte
  borné. `PriceRule` **altère** un prix canonique reçu, côté B2B. Le rapport,
  lui, **fabrique** le prix canonique, côté PIM. L'y ranger rendrait le push
  incapable de tarifer le professionnel.
- **Pas sur `CategoryChannel`** — ça mélangerait « ce que cette famille vend » et
  « à quel prix ».

## 4. La frontière à ne pas franchir

**Le B2B ne voit jamais un prix TTC.** Mercuriale, volume, promotion, geste,
planchers, `catalog_price_history`, `computeVatCents` : tout reste HT, parce
qu'une facture professionnelle est HT.

La conversion se fait donc **au push**, une fois : le référentiel résout le taux
`b2b` de l'article, dérive le HT, et envoie ce qu'il a toujours envoyé.
`catalog_items.price_cents` garde son contrat à la lettre, et rien en aval ne
bouge.

⚠️ En revanche `catalog-parity.ts` et le contrat de push devront transporter
l'ancrage : sans lui, la parité comparerait un TTC à un HT et crierait au faux
positif. C'est un point de la tranche 3, pas un détail d'implémentation.

## 5. Les tranches

| #     | Tranche           | Contenu                                                                                                                                      | État |
| ----- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| **1** | Le rapport, socle | `pim.accounting_rules` (singleton), VO `ProPriceRatio`, agrégat, dépôt, `GET` / `PUT`, journal, tests. **Aucune lecture de prix ne change.** | ✅   |
| **2** | Le rapport, écran | La case dans « Règles comptables ». On saisit, on voit ; ça ne décide encore rien.                                                           | ⬜   |
| **3** | L'ancrage         | `price_basis: ht \| ttc` (défaut `ht`), conversion TTC↔HT, ancrage dans le contrat de push, parité réveillée.                                | ⬜   |
| **4** | Le raccordement   | Le prix pro se dérive, projection Shopify, fiche qui affiche public TTC · HT par contexte · pro.                                             | ⬜   |

Les tranches 1 à 3 **ne changent aucun prix facturé** : le défaut `ht` conserve
le comportement d'aujourd'hui tant que personne ne bascule un article.

## 6. Ce que la tranche 1 a posé

- `pim.accounting_rules` — singleton (`id = "accounting"`), une colonne
  `pro_price_ratio_bp`. **L'absence de ligne est la donnée** : rien réglé ⇒
  `read()` rend `null`, et l'écran doit dire « à régler ». Un défaut à 100 %
  affirmerait « le pro paie le prix public », que personne n'a décidé — c'est le
  travers déjà retiré avec `DEFAULT_FOOD_VAT_RATE`.
- Le rapport en **points de base entiers** (9 000 = 90 %). Pas de flottant sur de
  l'argent ; c'est déjà l'unité de `PriceRule.value`. Et c'est le **rapport**,
  pas la remise : c'est ce qui multiplie.
- Deux murs plutôt qu'un : le VO `ProPriceRatio` **et** la contrainte
  `accounting_rules_pro_ratio_bounds` en base. Un rapport hors bornes
  surfacturerait tout le catalogue d'un coup, et ce genre d'écriture arrive par
  un script de reprise, jamais par l'écran.
- `applyTo()` **multiplie d'abord, divise ensuite, arrondit une seule fois** —
  la règle déjà tenue par la chaîne de résolution de prix.
- Le journal part **dès maintenant** (`accounting_rules.pro_ratio_changed`),
  alors que rien ne lit encore le rapport : une lacune de trace ne se rattrape
  pas, et le jour du raccordement on voudra savoir depuis quand le rapport vaut
  ce qu'il vaut. Reposer la même valeur ne trace rien.

## 6 bis. Ce que la tranche 2 a posé

- **Un écran à part**, `/pim/regles-comptables`, et pas un bloc de plus sur
  « Taux de TVA » : un taux est imposé de l'extérieur, une remise est décidée
  par la maison. Les ranger ensemble parce qu'ils tiennent dans la même phrase
  (« ce qu'on facture ») mélangerait la loi et la politique commerciale. Même
  mur (`tax:read` / `tax:write`) — la décision est comptable.
- **On saisit une remise, on stocke un rapport.** « Le pro paie 10 % de moins »
  est le mot qu'on emploie ; `9 000` est ce qui multiplie un prix. La traduction
  vit en un seul endroit (`pro-discount.ts`), et refuse plutôt que de corriger
  en silence — 100 % de remise donnerait un prix nul, que la base rejette.
- **Le calcul a déménagé dans le contrat.** L'écran montre ce que le réglage
  produit sur un article à 10,00 € TTC ; il appelle `proPriceFromPublic`, la
  même fonction que le VO du serveur. C'était le risque nommé au § 7 de la
  tranche 1 : il se refermait au moment précis où on allait l'ouvrir.
- **Trois blancs, trois phrases différentes.** « Jamais réglé » (à saisir),
  « réglage illisible » (à réessayer, et surtout : aucun formulaire, sinon on
  écraserait ce qu'on n'a pas su lire), « droit manquant » (nommé). Les
  confondre en un seul écran vide était le raccourci évident.
- **L'écran dit qu'il n'est pas branché.** Un bandeau annonce que la remise est
  enregistrée et tracée mais qu'aucun prix ne s'en sert encore. L'honnêteté
  coûte une phrase ; la découvrir soi-même coûte une facture.

## 7. Restant à trancher

- **La conversion TTC → HT divisera** — et c'est là qu'il faudra rouvrir la
  question de l'arithmétique exacte. Le référentiel ne peut pas voir
  `b2b/pricing/domain/exact-money.ts` (matrice des frontières) ; la tranche 1
  n'en a pas besoin (que des entiers), la tranche 3 si.
- **Shopify est nativement TTC** (« prices include tax »). À vérifier avant la
  tranche 4 : l'ancrage TTC pourrait **simplifier** la projection au lieu de la
  compliquer.
- ~~**Le calcul ne doit exister qu'une fois.**~~ Réglé en tranche 2 :
  `proPriceFromPublic` vit dans `@lfd/pim-contracts`, et le VO du serveur y
  délègue. La conversion TTC → HT de la tranche 3 devra y entrer aussi.
