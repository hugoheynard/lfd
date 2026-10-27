# Plan — les allergènes ne bloquent plus jamais une publication

> 🟡 **Bâti en partie le 2026-10-27** — règle A, constat
> `allergens_precautionary`, complétude, écran (commit `326d71e73`) ; puis la
> règle B jusqu'au commerce (non commité au moment d'écrire) : union du
> catalogue lue par projection, fil `mayContain` / `allergensPrecautionary`,
> colonnes `catalog_items`, aveu `incomplete` au back-office et sur la ligne
> de commande. **Reste** le §3 : la boutique ne montre aucun allergène (la vue
> `shop-catalogue` n'en porte pas) — ni libellés traduits des traces, ni
> mention de précaution. État décrit dans
> [`data-model/05-allergenes-gs1-inco.md`](data-model/05-allergenes-gs1-inco.md).
>
> 📝 Plan d'origine (2026-10-27). Hugo : « je dois diminuer la
> friction admin ». Il revient sur la décision du matin même (contradiction
> composition / déclaration **bloquante**, `productCompliance`) : elle devient
> une **correction automatique**, et l'absence de déclaration devient une
> **publication avec précaution**. À bâtir après le lot R3 du rapport pro,
> qui touche les mêmes fichiers.

## 1. Les deux règles

**A. Ce que la composition cite est déclaré.** À l'enregistrement d'une
déclinaison, à son activation et à la projection vers le commerce, les
allergènes que portent les ingrédients cités entrent dans les allergènes
**déclarés** de la déclinaison (et sortent de ses traces s'ils y étaient).
Jamais de retrait. La contradiction n'existe donc plus comme refus.

**B. Une déclinaison sans déclaration se publie avec précaution.** Quand ses
allergènes ne sont **pas renseignés**, elle n'est plus incomplète : elle part
avec

- en **allergènes** : ceux de sa composition (règle A) ;
- en **traces** (« peut contenir ») : l'union des allergènes **déclarés** sur
  toutes les autres déclinaisons publiées du catalogue, recalculée à chaque
  projection — une liste figée deviendrait fausse au premier produit ajouté.

« Aucun allergène » déclaré reste une déclaration : elle ne déclenche pas B.

## 2. Ce que voit l'admin

- **Aucun geste de plus.** Pas de case à cocher.
- Dans la table des produits, une fiche en B est **« À vérifier »**, constat
  `allergens_precautionary` (« publiée sans information précise : traces de
  tous les allergènes du catalogue ») ; un filtre la retrouve.
- À la publication d'une telle fiche, un toast d'information le dit, sans rien
  demander.
- La règle A ne produit **aucun constat** : elle corrige.

## 3. Ce que voit le client

- Allergènes : ceux de la composition. Traces : « Peut contenir : … », la
  liste de B.

## 4. Ce qui change dans le code

- `productCompliance` : les constats `allergens_cited_not_declared` et
  `allergens_contradict_none` disparaissent (la règle A les rend impossibles
  à l'état servi) ; le manque `allergens` disparaît de la complétude ;
  nouveau constat `allergens_precautionary`, gravité `warning`.
- Un service de domaine unique `effectiveAllergens(déclaration, cités,
unionCatalogue)` sert à l'activation, à la projection (`catalog-facts`) et à
  la fiche ; l'union du catalogue est lue par lot, une fois par projection.
- La déclaration **enregistrée** n'est pas réécrite par A ni par B : c'est
  l'état **servi** qui l'applique. La propagation depuis un ingrédient
  (`plan-propager-allergenes-d-un-ingredient.md`) reste le geste qui écrit.
- ~~Aucune migration.~~ Une, additive, côté commerce
  (`20261027120000_les_traces_atteignent_le_commerce`) : le fil devait
  porter les traces jusqu'à `catalog_items`.

## 5. Questions

- **Q1** — DGCCRF : une mention de précaution généralisée est mal vue quand
  elle remplace une déclaration. Le constat « À vérifier » est là pour que ces
  fiches ne le restent pas ; Hugo assume le risque pour réduire la friction
  (2026-10-27).
