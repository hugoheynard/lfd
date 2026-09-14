# @lfd/b2b-ui

Composants de **présentation** partagés entre les frontends B2B — la plateforme
client (`lfc-B2B-platform-frontend`) et l'admin staff (`lfc-B2B-admin-frontend`).
Les deux affichent les mêmes entités (société, contacts, commandes…) ; leur
apparence vit ici, une seule fois.

## Ce qui appartient à ce package

**Présentation only.** Un composant d'ici :

- reçoit tout par `input()` — un **view-model neutre** + des drapeaux de
  **capacité** — et communique par `output()` (des **intentions**) ;
- n'`inject`e **aucun** service, ne `fetch` rien, ne **mute** rien, n'ouvre
  aucun panneau, ne connaît **aucun** modèle d'app (`Company`, `AdminCompany`…)
  ni endpoint ;
- ne branche **jamais** sur _qui_ l'affiche. Pas de `isAdmin`. Une différence
  client/admin s'exprime en **valeurs d'input** (view-model, capacités, texte,
  slots), jamais en conditionnel d'identité — sinon un 3ᵉ consommateur (support,
  aperçu prospect…) casse le composant.

Test d'appartenance d'un nouvel input : s'il nomme un **comportement** ou une
**donnée** (`canManage`, `density`, `kbisEmptyHint`) → oui. S'il nomme un
**appelant** (`isAdmin`, `isCustomer`) → non.

## Ce qui n'appartient PAS ici

- Générique et agnostique du domaine → **`fold-ng`** (le design system).
- Données, auth, mutations, ouverture de panneaux → **dans les apps**. Chaque
  app enveloppe la vue dans un _container_ qui injecte ses services et mappe
  _son_ modèle vers le view-model neutre.

## Les formulaires — un seul par sujet, habillé par chaque app

Décidé le 2026-09-14 avec Hugo, après avoir trouvé le même formulaire écrit deux
fois (le RIB, les options du mandat) : un formulaire de saisie métier qui sert
les deux fronts **vit ici, dans le dossier de son sujet**, et pas dans un paquet
à part. Il a besoin du modèle, des pays, de l'affichage de son sujet — les
séparer ferait deux paquets qui s'importent l'un l'autre.

Trois règles :

1. **Il s'appelle `*-form`** (`address-form`, `hours-form`, `delivery-address-form`,
   `bank-account-form`, `mandate-options-form`)
   et ne fait **que** le formulaire : un brouillon en `model()`, des champs.
   Ni bouton d'envoi, ni écriture, ni panneau — chaque app l'**habille** (panneau
   côté staff, dialogue centré ou feuille du bas côté client) et écrit par son
   propre chemin.
2. **La logique n'est pas dans le composant** : le brouillon, sa lecture depuis
   une vue, sa validation et sa conversion en payload sont des **fonctions pures**
   d'un `*.model.ts` voisin (`deliveryDraftFrom`, `deliveryIssueOf`,
   `toDeliveryPayload`). Pures plutôt qu'un service injectable : aucun état
   partagé entre deux panneaux ouverts, rien à fournir, et elles se testent sans
   Angular.
3. **Ses libellés entrent par une entrée typée**, le français par défaut : l'admin
   ne passe rien et ne change pas ; la plateforme passe les siens (fr/en/it).

⚠️ La règle « présentation only » ci-dessus a déjà **deux exceptions** au
2026-09-14 : `delivery-address-panel` et `billing-address-panel` injectent
`ADDRESS_WRITER` et `FoldPanelRef`. Elles précèdent cette section ; un nouveau
formulaire partagé n'en ajoute pas une troisième.

⚠️ **Deux textes échappent encore aux libellés** (relevé le 2026-09-14) : les noms
de pays de `address/countries.ts`, calculés en français quelle que soit la langue
de l'app, et le message de `coordinatesIssueOf` (point GPS invalide). Les
traduire demande de choisir la langue d'`Intl.DisplayNames` **sans** changer la
valeur enregistrée.

## Structure

Un dossier par domaine, exporté en subpath (liste vérifiée le 2026-09-14) :
`address`, `appointment`, `cart`, `catalog`, `company`, `flags`, `hours`,
`order`, `panel`, `payment`, `pricing`, `subscription`.

`payment` porte le RIB d'une société et les zones facultatives de son mandat :
ni une adresse, ni une fiche société — le compte qu'on débite, et ce que le
mandat imprime en plus.

## Consommation

Lib **source** (pas de build, pas de `ng-packagr`, pas de `dist`) : les apps la
compilent via un `paths` tsconfig pointant vers `src`. Ajouter dans l'app :

```jsonc
// tsconfig.json → compilerOptions.paths
"@lfd/b2b-ui/company": ["../../packages/b2b-ui/src/company/index.ts"]
```

et `"@lfd/b2b-ui": "workspace:*"` dans ses dépendances.
