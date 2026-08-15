# Build des fronts — tokens et budgets

Deux réglages de build que les quatre applications Angular partagent, et qui
avaient divergé jusqu'au 2026-08-15 : **comment les tokens fold entrent dans la
page**, et **ce que veut dire un budget de bundle**.

Les deux se vérifient au même endroit : la sortie de `pnpm --filter <app> build`
doit être **silencieuse**. C'est la règle qui tient les deux sections ci-dessous.

---

## 1. Les tokens fold entrent par le graphe SCSS

Une seule ligne, en tête du `src/styles.scss` de chaque app :

```scss
@import "fold-ng/tokens.css";
```

`fold-ng/tokens.css` est un **sous-chemin d'export déclaré** par le paquet
(`exports` de son `package.json`), qui pointe vers `tokens/index.css` — lequel
agrège primitives, scales et semantic. Le builder l'inline dans le bundle de
styles : minifié, empreinté, servi avec le reste.

### Ce qu'on ne fait plus

Trois apps sur quatre copiaient à la place les CSS en **asset** puis les liaient
depuis `index.html` :

```jsonc
// angular.json — SUPPRIMÉ
{ "glob": "**/*.css", "input": "node_modules/fold-ng/tokens", "output": "fold-tokens" }
```

```html
<!-- index.html — SUPPRIMÉ -->
<link rel="stylesheet" href="fold-tokens/index.css" />
```

Le commentaire qui accompagnait ce montage invoquait le builder **Native
Federation**, qui n'inlinait pas ces CSS. C'était vrai à l'époque de la suite
fédérée ; la fédération a été abandonnée au profit des iframes, les quatre apps
sont depuis sous `@angular/build:application`, et la contrainte avait disparu
sans que le commentaire suive. L'app client, elle, n'avait jamais eu ce montage
— elle servait donc de démenti permanent.

Ce que le retour au graphe SCSS rachète :

- **une requête bloquante de moins** au premier rendu — les tokens ne sont plus
  une feuille séparée à aller chercher ;
- **plus d'avertissement de build.** `<link href="fold-tokens/index.css">` vise
  un fichier qui n'existe qu'après la copie d'asset : le builder ne le trouvait
  pas à la compilation et émettait `Unable to locate stylesheet` à **chaque**
  build des trois apps ;
- **le rechargement à chaud** quand on édite le paquet en local.

Le poids initial monte d'environ 21 ko sur chaque app — ce sont les tokens, qui
étaient comptés à part. Pour le navigateur, l'échange est favorable.

---

## 2. Un budget dit ce qui serait une régression

Les budgets vivaient à `500kB` (ou `800kB`) d'avertissement pour des bundles à
970 ko : **toujours rouges**. Un avertissement qui se déclenche toujours
n'avertit de rien, et il apprend à ne plus lire la sortie de build — c'est très
exactement par ce mécanisme que 29 variables CSS mortes ont survécu jusqu'au
gate `lint:fold-tokens`.

La règle retenue : **le seuil part de la vérité du jour**, pas d'un idéal.

| Budget           | Seuil                      | Ce qu'il attrape                               |
| ---------------- | -------------------------- | ---------------------------------------------- |
| `maximumWarning` | mesure du jour **+ ~6 %**  | une bibliothèque importée en eager par mégarde |
| `maximumError`   | mesure du jour **+ ~30 %** | la même, non traitée, qui part en production   |

Valeurs posées le 2026-08-15, après le passage des tokens dans le bundle :

| App                         | Mesuré | Avertissement | Erreur  |
| --------------------------- | ------ | ------------- | ------- |
| `lfc-B2B-admin-frontend`    | 970 ko | 1050 ko       | 1300 ko |
| `lfc-B2B-platform-frontend` | 994 ko | 1050 ko       | 1300 ko |
| `lfc-PIM-frontend`          | 573 ko | 625 ko        | 800 ko  |
| `lfc-suite-shell`           | 629 ko | 675 ko        | 850 ko  |

`anyComponentStyle` est uniforme : **7 ko** d'avertissement, **10 ko** d'erreur.
La plus grosse feuille du dépôt (`order-detail.scss`, 6,4 ko) passe donc, et une
feuille qui doublerait ne passerait pas.

### Ce que ces chiffres ne disent pas

Ce sont des applications **derrière authentification**, pas des pages
d'atterrissage : un initial autour du mégaoctet (≈ 210 ko compressés) est tenable
et n'a jamais été un sujet de plainte. Les seuils ci-dessus **ne sont pas un
objectif de performance** — ils ne servent qu'à faire du bruit le jour où le
poids bouge d'un coup. Toutes les routes sont déjà en `loadComponent`, et les
gros morceaux (ECharts, D3) sont dans des chunks paresseux.

**Quand une mesure dépasse durablement son seuil**, on tranche : soit c'est une
régression et on la corrige, soit c'est la nouvelle vérité et on remonte les deux
chiffres **dans le même commit que ce qui les a fait bouger**. Ce qu'on ne fait
pas, c'est laisser l'avertissement s'installer.
