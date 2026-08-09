# TODO — les trous que la CI ne couvre pas

> **État au 2026-08-09** : `.github/workflows/ci.yml` existe et garde les Pull
> Requests + `main` + `dev` (lint, typecheck, tests, build AOT). Trois trous
> restent, **déclarés ici** plutôt que masqués.
>
> Audit : [`../b2b/audit-flux-plateforme-admin.md`](../b2b/audit-flux-plateforme-admin.md) §P0-6.

## 1. Les specs ne sont typecheckées nulle part

`tsc --noEmit` tourne sur `tsconfig.json`, qui **exclut** `test/` et
`**/*.spec.ts`. Jest, lui, transpile sans vérifier les types. Résultat : le code
de test n'est contrôlé par personne.

Ce n'est pas théorique. `test/activations.e2e-spec.ts` importait
`ActivationView` depuis `src/growth/domain/activation.js`, **qui ne l'exporte
pas** — le type valait donc `any` et l'assertion ne garantissait rien. Trouvé en
lançant ESLint (type-aware, lui, sur `tsconfig.test.json`), corrigé le
2026-08-09.

`tsc -p tsconfig.test.json --noEmit` est aujourd'hui **rouge sur les deux
backends** : des doubles de test ont dérivé de l'interface qu'ils simulent
(`CompanyRepository` a gagné `load`/`save`/`declareUnowned`, les mocks non). Une
douzaine de fichiers côté B2B, autant côté PIM.

**À faire** : réparer les doubles, puis ajouter `tsc -p tsconfig.test.json` à la
CI. Tant que ce n'est pas fait, l'ajouter maintenant rendrait la CI rouge en
permanence — et une CI rouge en permanence se fait désactiver.

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
