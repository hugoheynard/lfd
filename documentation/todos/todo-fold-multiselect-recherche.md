# TODO — `fold-multiselect` n'a pas de recherche

**Ouvert le 2026-09-01**, en posant le sélecteur d'allergènes sur la fiche
ingrédient.

## Le fait

`fold-multiselect` n'expose **aucune** entrée de recherche ou de filtre.
Relevé sur **`fold-ng@0.24.0`**, la version installée, la liste complète de ses
entrées est : `value`, `compareWith`, `options`, `disabled`, `touched`,
`errors`, `open`, `size`, `variant`, `label`, `required`, `optional`,
`optionalLabel`, `info`, `infoLabel`, `hint`, `placeholder`, `placement`,
`allowSelectAll`, `allowClear`, `selectAllLabel`, `clearLabel`, `clearWord`,
`inputId`, `listId`, `optionTemplate`, `activeId`.

⚠️ Vérifier la version **dans le manifeste du paquet**, pas dans un chemin du
store pnpm : ce todo a d'abord été écrit contre 0.22.1, un numéro lu dans un
nom de dossier qui ne correspondait pas à ce que l'app résout. La conclusion
tenait, la liste non — 0.24 a gagné `allowSelectAll` et perdu `ariaLabel`.

`FoldSearchComponent` existe, mais c'est un **champ autonome** : le multiselect
rend sa propre liste dans un popover, on ne peut pas lui en glisser un à
l'intérieur.

## Ce qui tient aujourd'hui, et pourquoi ça ne tiendra pas

Le contrôle a la **frappe-au-vol** — panneau ouvert, taper « noi » arme
« Noisettes », avec le `label` de chaque option pour cible. C'est la parité avec
un `<select>` natif.

Sur les 30 entrées du référentiel d'allergènes, réparties en trois groupes et
douze options simples, c'est confortable. Mais **le référentiel est désormais
administrable** : le staff crée ses propres catégories et ses propres entrées.
Trente aujourd'hui, davantage demain — et la frappe-au-vol ne montre jamais
combien de choses correspondent, ni ne réduit la liste.

## Le geste, quand on le fera

C'est un **chantier fold**, pas applicatif. Le pont existe pour ça :

```bash
node dev-toolbox/fold-local.mjs on      # construit fold-ng du disque et le branche
node dev-toolbox/fold-local.mjs sync    # après chaque modif de fold
node dev-toolbox/fold-local.mjs off     # avant de livrer
```

La forme naturelle serait une entrée `searchable` sur `fold-multiselect` (et
sans doute sur `fold-listbox`), qui filtre `[options]` en conservant les
groupes, et annonce le nombre de résultats.

## Ce qu'il ne faut PAS faire

**Filtrer depuis l'extérieur du composant.** Poser un `fold-search` au-dessus du
multiselect et lui recalculer `[options]` semble économique et ne l'est pas : le
champ vit hors du popover, la liste se réduit sous le curseur sans que rien
n'annonce pourquoi, et le résumé du déclencheur cesse de correspondre à ce que
la liste montre. On aurait un contrôle maison déguisé en composant fold, avec
sa propre accessibilité à tenir.

La règle du dépôt vaut ici : ce qui existe dans fold vient de fold, et ce qui
manque dans fold **se demande à fold**.

## Ce que ça ne remet pas en cause

Le groupement décidé pour les allergènes — options simples d'abord, groupes
ensuite — reste juste avec ou sans recherche. Voir le § « Le front », point 2 de
[`pim/data-model/05-allergenes-gs1-inco.md`](../pim/data-model/05-allergenes-gs1-inco.md).
