# TODO — les trous que la CI ne couvre pas

> **État au 2026-08-09** : `.github/workflows/ci.yml` existe et garde les Pull
> Requests + `main` + `dev` (lint, typecheck, tests, build AOT). Trois trous
> restent, **déclarés ici** plutôt que masqués.
>
> Audit : [`../b2b/audit-flux-plateforme-admin.md`](../b2b/audit-flux-plateforme-admin.md) §P0-6.

## 1. ~~Les specs ne sont typecheckées nulle part~~ — FERMÉ le 2026-08-22

> **La porte est posée.** `tsc --noEmit -p tsconfig.test.json` tourne dans le
> job `backend` de la CI, à côté du typecheck de production. 194 erreurs → 0.
>
> Falsifié : renommer une méthode d'un double de test laisse `tsc --noEmit`
> (l'ancien) à **zéro** et fait passer la nouvelle porte à **1**.
>
> Deux choses en sont sorties, qui disent ce que le trou coûtait vraiment :
>
> - un vrai défaut de production — `ListTvaRates` composait son usage par défaut
>   avec **deux canaux sur trois**. Un taux que seule la plateforme B2B utilise
>   s'affichait « 0 famille », donc supprimable ; la base l'aurait refusé, mais
>   l'écran promettait l'inverse ;
> - `container/worker.ts` est **sorti** de cette configuration. Il vit dans le
>   monde Cloudflare Workers, a son propre tsconfig, et le compiler avec les
>   types Node produisait huit erreurs qui ne disaient rien de vrai. Sa spec
>   reste couverte : elle lit le fichier comme du **texte**.
>
> Le récit ci-dessous est conservé — c'est la description de la panne, et elle
> reste la meilleure justification de la porte.

### Ce que le trou cachait

`tsc --noEmit` tourne sur `tsconfig.json`, qui **exclut** `test/` et
`**/*.spec.ts`. Jest, lui, transpile sans vérifier les types. Résultat : le code
de test n'est contrôlé par personne.

Ce n'est pas théorique. `test/activations.e2e-spec.ts` importait
`ActivationView` depuis `src/growth/domain/activation.js`, **qui ne l'exporte
pas** — le type valait donc `any` et l'assertion ne garantissait rien. Trouvé en
lançant ESLint (type-aware, lui, sur `tsconfig.test.json`), corrigé le
2026-08-09.

> **2026-08-18 — la variante FRONT était pire, et elle est corrigée.**
>
> Le même trou existait sur les quatre apps Angular, en plus large : `tsc
--noEmit` y tournait sur le tsconfig **racine**, une config « solution » qui
> ne porte que des `references` et aucun `include`. Elle ne compilait donc
> **aucun fichier** — ni les specs, ni le code de production — et rendait vert.
> Vérifié en y glissant un appel de méthode inexistante : silence. Seul le build
> AOT protégeait, et il ne tourne pas sur les quatre apps.
>
> La CI pointe désormais sur `tsconfig.app.json`. Les quatre passent en l'état.

`tsc -p tsconfig.test.json --noEmit` est aujourd'hui **rouge sur les deux
backends** : des doubles de test ont dérivé de l'interface qu'ils simulent
(`CompanyRepository` a gagné `load`/`save`/`declareUnowned`, les mocks non). Une
douzaine de fichiers côté B2B, autant côté PIM.

**À faire** : réparer les doubles, puis ajouter `tsc -p tsconfig.test.json` à la
CI. Tant que ce n'est pas fait, l'ajouter maintenant rendrait la CI rouge en
permanence — et une CI rouge en permanence se fait désactiver.

> **2026-08-22 — mesuré, et un contexte nettoyé.** `tsc -p tsconfig.test.json`
> sur `lfd-api` rend **211 erreurs**. Une revue de la famille du catalogue en a
> vidé six, et ce qu'elles cachaient mérite d'être cité, parce que c'est
> exactement le risque que ce trou fait courir :
>
> - `category.spec.ts` appelait `setChannels({ b1, b2 })` et
>   `setTva("tva_5", null)` — **deux signatures mortes**. Les tests passaient
>   quand même : le refus « famille archivée » se déclenche AVANT que la forme
>   fausse ne soit lue. Un test vert qui ne teste plus rien est pire qu'un test
>   absent, parce qu'il occupe la place.
> - `InMemoryRegimes` avait dérivé de `TvaRateRepository` (un `findByTag`
>   disparu, deux méthodes jamais implémentées) et lisait un champ `tag` que
>   l'agrégat n'a plus.
>
> `src/pim/catalogue/**` passe au vert sous `tsconfig.test.json` — **tout le
> catalogue**, famille et produit : les doubles du ramassage des visuels
> traînaient la même dérive (`MediaStore.remove`, trois méthodes de
> `MediaLibrary`, un paramètre disparu de `SweepOrphanMedia.execute`).
> **Épilogue le même jour** : les 194 restantes sont tombées à leur tour. Ce
> qu'elles étaient, en une phrase chacune — des doubles qui avaient perdu la
> moitié des méthodes de leur port, des fixtures dont le domaine avait bougé
> sous elles (`"member"` n'est plus un rôle, une commande a gagné un paramètre,
> une date de livraison est devenue obligatoire), des propriétés dupliquées dans
> un même littéral, et deux appels à des signatures mortes qui passaient parce
> qu'un autre refus se déclenchait d'abord.

## 1bis. Les adaptateurs Prisma du référentiel n'avaient aucun test

Fermé le même jour, et il vaut d'être noté séparément : les specs remplacent le
dépôt Prisma par un double en mémoire. Le filtre sur le chemin `fr` d'une
colonne `jsonb`, le `COUNT` des sous-familles, l'écriture réelle des colonnes de
TVA — rien de tout ça n'était vérifié.

`test/pim-categories.e2e-spec.ts` les éprouve contre un vrai Postgres.
Démonstration de l'écart : remplacer `path: ["fr"]` par un chemin inexistant
laisse les **155 tests unitaires du catalogue verts** et fait tomber l'e2e.

Défaut du harnais trouvé au passage : `truncateAll` balayait `public`, `growth`
et `ops` — **pas `pim`**. Les lignes du référentiel fuyaient d'une suite e2e à
la suivante.

## 2. Les quatre apps Angular n'ont aucun ESLint

`lfc-B2B-admin-frontend`, `lfc-B2B-platform-frontend`, `lfc-PIM-frontend` et
`lfc-suite-shell` n'ont **ni configuration ESLint, ni script `lint`**. La CI ne
peut donc rien y lancer ; elles sont couvertes par le typecheck, les tests et le
build de production.

**Piège rencontré** : `pnpm --filter <app> lint` **sort en succès** quand le
script n'existe pas (« None of the selected packages has a "lint" script »,
code 0). Un relevé rapide fait donc croire que tout est vert. C'est pourquoi la
CI nomme explicitement ce qu'elle lance, app par app, plutôt qu'un `-r` global.

**À faire** : installer `angular-eslint` sur les quatre. À prévoir **après** les
jalons d'août — la première exécution remontera une pile d'erreurs, et ce n'est
pas la semaine pour ça.

## 3. Deux fichiers de test Shopify LIVE sont exclus du lint

`test/shopify/live-context.ts` et `test/shopify/*.shopify-live.ts` (PIM) sont
dans les `ignores` d'ESLint : ils frappent une vraie boutique, ne tournent jamais
en CI, et le typage de `Test.createTestingModule` y résiste (10 erreurs
`no-unsafe-*`). Exclus **explicitement, avec le motif en commentaire** plutôt que
de laisser la CI rouge.

**À faire** : les typer correctement, puis retirer l'exclusion. Faible priorité —
ils ne s'exécutent que sur demande.

## Ce que la CI couvre, elle

| Périmètre         | Lint   | Typecheck   | Tests                                    | Build  |
| ----------------- | ------ | ----------- | ---------------------------------------- | ------ |
| Les 10 paquets    | ✅     | ✅ (build)  | ✅                                       | ✅     |
| Backend B2B       | ✅     | ✅ (source) | ✅ unitaires **+ e2e sur vrai Postgres** | —      |
| Backend PIM       | ✅     | ✅ (source) | ✅                                       | —      |
| Fronts B2B (×2)   | ✖ (§2) | ✅          | ✅                                       | ✅ AOT |
| Front PIM · shell | ✖ (§2) | ✅          | ✅ / —                                   | —      |

Le `ci-gate` agrège les trois jobs : **c'est lui**, et lui seul, qu'on met en
statut requis sur la branche — ajouter un job plus tard ne demandera alors aucun
réglage dans GitHub.

## 4. Un flake e2e, une suite sur 182, caractérisé mais non corrigé

_(2026-08-18)_

La suite backend complète échoue **environ une fois sur deux**, sur **une seule
suite**, et jamais la même : `leads`, `appointments`, `staff-lockout`,
`admin-orders`, `contacts`, `cockpit` s'y sont succédé. Un second lancement passe.

Ce qui est établi, et qui vaut mieux que « c'est flaky » :

- **le message est toujours `socket hang up`** — donc le TRANSPORT, pas la
  donnée. Ce n'est pas une fuite d'état entre suites : aucune assertion métier
  n'échoue, la connexion est coupée avant la réponse ;
- il frappe la **première requête** de la suite touchée, très souvent le test
  « mure la route (401) » qui est le premier écrit ;
- il est **antérieur** aux changements du 2026-08-18 : vérifié en remisant
  ceux-ci et en relançant deux fois — run 1 rouge sur `leads`, run 2 vert, même
  signature.

Piste la plus probable, non confirmée : la fermeture de l'application Nest de la
suite précédente (`app.close()`) qui n'a pas fini de drainer quand la suivante
émet sa première requête. La suite tourne déjà en `--runInBand`, et le
`--forceExit` du script masque des handles ouverts — cf. le point 2 de ce
document.

**Ce qu'il ne faut pas faire** : ajouter un `retry` sur la CI. Le flake ne
coûte aujourd'hui qu'un relancement ; le masquer coûterait le jour où il cesse
d'être un flake.

## 5. Aucune commande locale ne reproduit ce que la CI exige

_Relevé le 2026-08-27, après un lot recalé en production._

Le dépôt porte **quatorze gardes** dans `dev-toolbox/gates/`, dont **douze sont
exigées par la CI** — tokens fold, typographie fold, langue des identifiants,
liens de routeur, neutralité du modèle PIM, cycles d'import, journalisation,
frontières de contexte, jointures inter-schémas, dépendances catalogue, fichiers
d'app déployée, événements suivis.

Il n'existe **aucune commande qui les lance toutes**. `pnpm lint` fait
`turbo run lint`, c'est-à-dire ESLint par app — et rien d'autre. Chaque garde a
son script (`pnpm lint:fold-tokens`, …), qu'il faut connaître et appeler une par
une.

Conséquence observée : une session entière de travail vérifiée par ESLint,
`tsc`, les tests et le build AOT — quatre portes réelles, toutes vertes — et
recalée par la treizième, jamais lancée. Deux littéraux de CSS
(`line-height: 1`, un repli de `var()`). Le lot portait une migration ; sans la
garde de déploiement, il partait en production.

Deux de ces gardes auraient d'ailleurs signalé, avant le push, quatre problèmes
de tokens trouvés autrement : deux à la main en auditant token par token, deux
par la CI.

À faire :

- un `pnpm verify` (ou `lint:gates`) qui enchaîne **exactement** ce que la CI
  exige, dans le même ordre — la liste vit alors à UN endroit, et la CI l'appelle
  au lieu d'énumérer douze étapes ;
- le jour où ce script existe, la CI doit l'invoquer plutôt que de répéter la
  liste : deux énumérations divergent, et c'est celle qu'on ne lance pas
  localement qui gagne.

⚠️ En attendant : lancer les douze avant tout push d'un lot qui touche du SCSS,
des tokens, des routes ou le modèle du référentiel.

⚠️ Piège de lecture au passage : ces gardes n'ont pas toutes la même sortie —
certaines impriment `✓`, d'autres `✅`, d'autres une phrase. Un script qui les
agrège doit lire le **code de sortie**, jamais le texte.
