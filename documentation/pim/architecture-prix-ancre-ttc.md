# Le prix ancré au TTC — et le rapport prix public / prix pro

> **État : terminé** (2026-08-31). Le rapport a une maison, une API et un écran ;
> la fiche saisit un prix public TTC ; chaque canal en dérive son hors taxe.
>
> 🔴 **Le chantier ne s'est pas terminé comme il avait commencé.** Il visait un
> SECOND ancrage à côté du premier ; une décision de réunion en a fait le SEUL.
> `price_basis` a donc été livrée puis retirée le même jour — voir le § 8, qui
> supersède ce que les § 1, 6 ter et 7 disent de la coexistence des deux
> assiettes.
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

~~⚠️ En revanche `catalog-parity.ts` et le contrat de push devront transporter
l'ancrage.~~ **Faux, corrigé en tranche 3.** La conversion se fait dans la
projection, donc le fil ne transporte que du HT et son contrat ne change pas.
Et la parité n'a rien à apprendre non plus : `CheckCatalogParityService` rejoue
**cette même projection** pour construire sa référence, si bien qu'elle compare
déjà deux HT. L'annonce de la tranche 1 était une hypothèse écrite avant d'avoir
lu ce service.

## 5. Les tranches

| #     | Tranche           | Contenu                                                                                                                                              | État |
| ----- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| **1** | Le rapport, socle | `pim.accounting_rules` (singleton), VO `ProPriceRatio`, agrégat, dépôt, `GET` / `PUT`, journal, tests. **Aucune lecture de prix ne change.**         | ✅   |
| **2** | Le rapport, écran | La case dans « Règles comptables ». On saisit, on voit ; ça ne décide encore rien.                                                                   | ⬜   |
| **3** | L'ancrage         | `price_basis: ht \| ttc` (défaut `ht`), conversion TTC↔HT dans le contrat, conversion au push B2B. Parité : rien à faire, elle rejoue la projection. | ✅   |
| **4** | Le raccordement   | Le prix pro se dérive, fiche qui affiche public TTC · HT par contexte · pro.                                                                         | ✅   |
| **5** | L'assiette unique | Décision de réunion : le hors taxe ne se saisit plus. `price_basis` retirée, `ttcFromHt` / `htPriceOf` supprimées. Voir § 8.                         | ✅   |

Les tranches 1 à 3 n'ont changé aucun prix facturé : le défaut `ht` conservait
le comportement d'alors tant que personne ne basculait un article. La tranche 5,
elle, en change le SENS — voir § 8.

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

## 6 ter. Ce que la tranche 3 a posé

- **`product_variant.price_basis`**, `ht` par défaut. Le défaut est le point :
  la colonne portait un prix hors taxe depuis toujours, et tout autre défaut
  changerait le SENS des lignes existantes sans les toucher — une reprise de
  données déguisée en migration, et la pire espèce, puisque rien ne la
  signalerait. Non-nullable : une déclinaison sans assiette n'existe pas, alors
  qu'une déclinaison sans PRIX, si.
- **`htFromTtc` / `ttcFromHt` / `htPriceOf` dans `@lfd/pim-contracts`**, à côté
  de `proPriceFromPublic`. Le taux repasse par les points de base entiers avant
  la division : `5.5 * 100` vaut `550.0000000000001` en binaire, et `4.85 * 100`
  vaut `484.99999999999994`. Le référentiel a déjà payé ce piège dans
  `VatPercent`.
- **Le TTC fait foi.** L'aller-retour `ttcFromHt(htFromTtc(x))` peut perdre un
  centime, et c'est le bon sens de la perte : l'étiquette est ce qu'un client
  lit et ce que la caisse encaisse ; le hors taxe en est la conséquence. On ne
  recalcule jamais une étiquette depuis sa propre déduction — un test le
  documente plutôt que de prétendre l'inverse.
- **La conversion vit dans la projection B2B**, dernier endroit qui connaît
  encore l'assiette. Passé ce point, tout est HT, y compris pour la parité.
- **Un motif d'exclusion de plus** : `variant_ttc_sans_taux`. Distinct de
  « pas de tarif » — ici le prix EXISTE, c'est le taux qui manque, et c'est un
  autre écran qu'il faut ouvrir. Écarté plutôt que converti au jugé : inventer
  un taux ferait facturer un montant que personne n'a décidé.
- **`htPriceOf` teste `ttc`, pas `ht`.** Une valeur inattendue — fixture
  incomplète, ligne écrite par un script — retombe alors sur le hors taxe, ce
  que la colonne a toujours voulu dire. La forme inverse faisait CONVERTIR tout
  ce qui n'était pas exactement `"ht"`, donc baisser un prix sur une assiette
  absente ; un test l'a montré avant la production.

### Une dérive attrapée au passage

`B2bExclusionReason` (contrat) et `Exclusion.reason` (domaine) étaient deux
déclarations **indépendantes** du même ensemble, et elles avaient divergé : le
domaine produisait déjà `canal_ferme`, absent du contrat. Une fiche écartée
parce qu'on ne la vend pas aux professionnels s'affichait donc avec un motif
**vide** dans l'écran de publication, et le compilateur ne pouvait rien en dire
— deux synonymes ne se contredisent jamais, ils divergent.

Le domaine importe désormais l'union du contrat. C'est un **alias**, donc le
compilateur tient les deux bouts : un motif ajouté ne compile pas tant qu'il
n'est pas traduit à l'écran.

## 7. Restant à trancher

- ~~**La conversion TTC → HT divisera.**~~ Réglé en tranche 3 : la division
  passe par les points de base entiers et n'arrondit qu'une fois. Pas besoin de
  rationnel exact — un seul quotient, pas une chaîne.
- 🔴 **Shopify est nativement TTC** (« prices include tax »), et sa projection
  envoie `price_cents` **tel quel**, sans jamais voir de taux. C'est le
  **bloquant de la tranche 4**, et la raison pour laquelle la tranche 3 ne
  livre AUCUN moyen de poser `ttc` : tant que personne ne peut basculer un
  article, la question reste théorique et aucun prix ne part de travers. La
  trancher demande de savoir si la boutique encaisse taxe comprise — ce qui se
  lit dans son paramétrage, pas dans ce dépôt.
- ~~**Le calcul ne doit exister qu'une fois.**~~ Réglé en tranche 2 :
  `proPriceFromPublic` vit dans `@lfd/pim-contracts`, et le VO du serveur y
  délègue. La conversion TTC → HT de la tranche 3 devra y entrer aussi.

## 8. L'assiette unique — la décision qui a clos le chantier

**Décision de réunion, 2026-08-31 : le calcul par le HT n'a pas d'utilité.** Un
seul système est valide — prix public TTC, rapport vers le TTC pro, taux vers le
hors taxe de chaque canal. Le hors taxe cesse d'être une saisie ; il devient un
résultat.

### Pourquoi ne pas garder l'assiette « au cas où »

C'était la vraie question, et la réponse n'est pas « YAGNI ».

**L'extensibilité qui compte est ailleurs, et elle est pilotée par la donnée.**
Le rapport est une LIGNE (`accounting_rules.ratio_bp`) ; les taux sont des
LIGNES par (contexte × produit|famille). Un second rapport, un rapport par
famille, un rapport par client, un canal de plus — tout ça s'absorbe en ajoutant
des lignes. **Aucun de ces cas de figure ne rouvre `price_basis`.**

`price_basis` n'était pas un axe extensible, c'était un interrupteur à deux
positions, et le garder inerte se payait à chaque lecture. Deux exemples, tous
deux livrés en tranche 3 :

- `htMillicentsOf` devait rendre `null` sur une branche qui n'aurait jamais été
  prise ;
- la projection B2B avait dû inventer une exclusion `variant_ttc_sans_taux`
  **uniquement** parce que les deux assiettes coexistaient.

Une branche jamais prise est une branche jamais testée pour de vrai. Et une
colonne à deux valeurs dont une n'est plus jamais écrite est pire qu'absente :
le jour où un import y remet `ht`, personne ne le voit, et on ne sait plus si
c'est un cas légitime ou une ligne oubliée.

### Ce qui a été retiré

| Retiré                               | Remplacé par                                             |
| ------------------------------------ | -------------------------------------------------------- |
| `pim.price_basis` (enum + colonne)   | rien : `price_cents` EST un prix public TTC              |
| `PRICE_BASES`, `priceBasisSchema`    | rien                                                     |
| `ttcFromHt`, `htPriceOf`             | rien — le sens inverse n'existe plus                     |
| `price-basis.ts`                     | `tax.ts` : `htFromTtc` + `htMillicentsOf`                |
| `variant_ttc_sans_taux`              | `variant_sans_taux` — il n'y a plus d'ancrage à préciser |
| le sélecteur d'assiette sur la fiche | l'étiquette fixe « Prix public TTC »                     |

**Aucune conversion de données.** Les 92 déclinaisons `ht` étaient du seed, rien
en production — la question a été posée avant d'écrire la migration, parce qu'une
conversion aurait demandé de choisir UN taux par déclinaison alors qu'un prix
public en a un par contexte de vente. C'est tout l'objet de ce modèle : il n'y
avait pas de réponse mécanique.

### Ce que ça règle chez Shopify, et sous quelle hypothèse

Le § 7 annonçait Shopify comme le bloquant : sa projection envoie `price_cents`
**tel quel**, sans jamais voir de taux. C'était vrai — et c'était déjà un défaut
AVANT ce chantier : elle poussait un montant hors taxe dans un champ que Shopify
lit comme taxe comprise (« prices include tax », le réglage français par défaut).

Le prix stocké étant désormais un prix public TTC, la projection envoie la bonne
chose **sans avoir changé une ligne**. ⚠️ Sous une hypothèse qui n'est pas
vérifiable depuis ce dépôt : que la boutique soit bien paramétrée taxe comprise.
À confirmer dans son paramétrage avant le premier push réel.

## 9. Le raccordement du rapport au push

La tranche 4 n'avait été livrée qu'à moitié, et la moitié manquante ne se voyait
pas : **l'écran appliquait le rapport, le fil non.**

```
fiche Tarif  →  basePriceEurFor('b2b')  →  × rapport  →  9,00 € HT affiché
projection   →  htMillicentsOf(prix public, taux)     → 10,00 € HT poussé
```

Les deux nombres ne se lisent pas sur le même écran, donc personne ne pouvait
voir l'écart. Un rapport saisi, tracé, affiché — et jamais facturé.

### La chaîne, désormais complète

```
prix public TTC (stocké)
  × rapport            → prix pro TTC, ARRONDI AU CENTIME ici
  ÷ (1 + taux du canal) → hors taxe en millicentimes, poussé
```

L'arrondi du prix pro **avant** la division n'est pas un détail : c'est un prix,
pas un intermédiaire de calcul. Garder le rationnel exact jusqu'au bout ferait
diverger d'un centime le hors taxe poussé et celui que la fiche montre sous le
prix pro — deux nombres qu'un client peut recompter. Sur 1,99 € à −10 % et
5,5 % : 169 668 millicentimes par le prix pro arrondi, 169 763 par le rationnel.
Un test tient l'écart.

### Le rapport est une PRÉCONDITION du push

`projectCatalog` le reçoit **obligatoire**, sans valeur de repli et sans branche
`null`. Un défaut à 10 000 affirmerait « le pro paie le prix public », que
personne n'a décidé ; une branche `null` ne serait jamais prise sur une maison
correctement réglée, donc jamais éprouvée, et facturerait le plein tarif le jour
où elle le serait.

Le refus vit dans `B2bCatalogFeedProjection`, et il porte sur le **push entier**
plutôt que sur chaque article. C'est la seule forme sûre : un snapshot dont tous
les articles seraient écartés est un snapshot VALIDE, que la plateforme
ingérerait en retirant de sa boutique tout ce qu'elle vendait (`removedSkus`).
Un catalogue vidé par un réglage manquant est exactement ce que ce refus empêche.

Un canal où **rien n'est publié** passe avant le garde : il n'a aucun prix à
montrer, et lui réclamer un réglage comptable refuserait un aperçu qui ne tarife
rien.

⚠️ **Conséquence d'exploitation** : tant que « Règles comptables » est vide, le
push B2B répond en erreur au lieu de partir. C'est voulu, et c'est la première
chose à régler sur un environnement neuf.

⚠️ **Et le contrôle de parité avec.** `CheckCatalogParityService` consomme la
même `preview()` pour construire sa référence : sans rapport réglé, l'écran de
parité tombe lui aussi, sur un message qui parle de règles comptables. C'est
cohérent — il ne peut pas comparer à une référence qu'il ne sait pas calculer —
mais le lien n'est pas évident depuis cet écran-là.

**Couverture** : le garde est tenu par `feed-projection.service.spec.ts`
(unitaire). Aucun e2e ne le traverse — `catalog-parity.e2e-spec.ts` double
`FeedPreview`, donc la chaîne réelle n'est exercée nulle part au niveau e2e.
