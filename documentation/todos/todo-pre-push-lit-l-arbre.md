# TODO — le hook `pre-push` lit l'arbre de travail, pas le commit poussé

> 📝 **Noté le 2026-11-05** (Hugo : « note le »). Personne ne l'a pris.

## Le problème, simplement

Avant un push, `.githooks/pre-push` lance les portes du dépôt et les
typechecks de ce qui a changé. Mais il les lance sur **les fichiers du
disque**, pas sur **le commit qui part**. Les deux diffèrent dès qu'un
travail local n'est pas encore poussé — un lot en cours, un agent qui écrit.

Il se trompe alors dans les deux sens :

| Cas                                                           | Ce qui arrive                       |
| ------------------------------------------------------------- | ----------------------------------- |
| le commit poussé est bon, l'arbre local casse une porte       | **refus à tort** (vécu ci-dessous)  |
| le commit poussé est cassé, l'arbre local le corrige en douce | **passage à tort** — la CI rattrape |

Vécu le 2026-11-05 : la promotion de `35b4c9c` vers `main` (CI de `dev`
verte) a été refusée par `lint:doc-references`, parce que le lot b, commité
en local mais pas poussé, avait raccourci `shop-storefront.store.ts` sous une
référence de ligne d'un plan. Il a fallu corriger la doc locale pour pouvoir
pousser un commit qui n'en avait pas besoin.

## La correction proposée

Lancer les portes sur le SHA poussé, dans un arbre à part :

1. lire sur l'entrée standard du hook les SHA poussés (`<local ref> <local sha> <remote ref> <remote sha>`) ;
2. `git worktree add --detach <dossier temporaire> <sha>` ;
3. y relier les dépendances (lien vers `node_modules` du dépôt, ou
   `pnpm install --offline`) — **à mesurer**, c'est le coût du lot ;
4. lancer les mêmes portes dedans, puis `git worktree remove`.

Non vérifié : le temps ajouté, le comportement des typechecks incrémentaux
(`tsbuildinfo`) dans un arbre neuf, et les paquets du workspace qui
demandent un build (`dist/`) avant le typecheck.
