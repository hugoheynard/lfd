# L'état côté front : promesses, signaux, et le vide qui ment

✅ **Décrit l'état réel au 2026-08-22.** Les chiffres viennent d'un comptage sur
`apps/lfc-B2B-admin-frontend`, pas d'une impression.

## 1. Ce qui est en place, et pourquoi

Trois couches, et une seule est réactive :

| Couche         | Forme                             | Exemple                  |
| -------------- | --------------------------------- | ------------------------ |
| Transport HTTP | `Promise` via `firstValueFrom`    | `EmplacementHttpApi`     |
| État partagé   | un `signal` dans un store         | `EmplacementStore.items` |
| Écran          | lit le signal, ne s'abonne à rien | `store.items()`          |

**`firstValueFrom` n'est pas une paresse.** Un `POST`/`PUT`/`DELETE` de
`HttpClient` émet **une fois puis complète** : c'est une promesse déguisée en
observable. Un `.subscribe()` y demanderait une désinscription pour rien, et un
pipeline Rx un `switchMap` de cérémonie pour une commande à un coup. 43 fichiers
l'utilisent, et c'est le bon outil à cet endroit.

**La réactivité vit dans le store, pas dans le flux.** Les mutations rechargent
(`await this.reload()`), le signal se met à jour, et tout écran qui le lit se
recompose. C'est pour ça qu'aucun composant ne fait `subscribe()`.

`toSignal` n'apparaît qu'à un seul endroit — `staff-auth.ts`, sur
`isAuthenticated$` et `user$` d'Auth0. Ce sont de **vrais** flux, qui émettent
plusieurs fois : c'est exactement son usage, et son absence ailleurs est un
choix, pas un oubli.

## 2. Le défaut que ça cachait : le vide qui ment

Les stores chargeaient en « best-effort » :

```ts
void this.reload().catch(() => undefined);
```

Un backend injoignable laissait donc la liste vide — et l'écran affichait
**« Aucun emplacement. Créez-en un »**, mot pour mot ce qu'il affiche quand il
n'y en a réellement aucun.

Les deux états sont pourtant opposés. Dans l'un il n'y a rien à faire ; dans
l'autre on invite quelqu'un à **recréer ce qui existe déjà**. C'est la forme la
plus coûteuse d'un bug d'affichage : non pas une erreur visible, mais un
mensonge qui a l'aplomb d'un fait.

`ListLoadState` retient la raison, et l'état vide la lit :

```
liste vide + loadError() === null   → « Aucun taux »
liste vide + loadError() !== null   → « Taux illisibles — Serveur injoignable. »
```

Trois règles qu'il faut garder :

- **L'échec est relancé**, pas absorbé. Une mutation qui recharge derrière elle
  doit continuer de voir le refus ; seul le chargement automatique du démarrage
  l'absorbe, et il le fait sciemment.
- **Rien n'est appliqué en cas d'échec** : la liste garde ce qu'elle avait, elle
  ne se vide pas.
- **Pas d'état de « chargement ».** La liste part vide et se remplit ; une
  bannière sur un appel de 40 ms clignoterait pour rien. Seul l'ÉCHEC change le
  sens de la page.

`products-page` n'est pas concernée : elle tient sa propre liste et **affiche**
son erreur au-dessus du tableau. `reconciliation-store` non plus — il avait déjà
`loading` et `error`.

## 3. Ce qui n'a pas été fait, et pourquoi

**`httpResource` (Angular 22) n'est utilisé nulle part.** Il exprime « quand ce
paramètre change, refais l'appel » et donne `isLoading()` / `error()` /
`value()` sans machinerie. Il vaudrait pour un **écran de détail piloté par un
paramètre de route** — là où l'app fabrique aujourd'hui un `init(id)` avec ses
signaux à la main.

Il ne remplacerait PAS les stores : une ressource ne sait pas se rejouer après
une mutation faite ailleurs sans qu'on lui ajoute un déclencheur, soit plus de
machinerie pour le même résultat. Le convertir en masse serait du culte du
cargo ; l'adopter sur le prochain écran de détail serait un progrès réel.

## 4. À lire ensuite

- [`ops/runbook.md`](../ops/runbook.md) — dont « un `400` sur un corps pourtant
  valide », l'autre panne de dev qui accuse le front à tort.
