# lfc-PIM-backend — conventions

> Les règles **communes à tous les backends** (SOLID, DDD, CQRS, erreurs, tests)
> vivent dans le [`CLAUDE.md` du monorepo](../../CLAUDE.md). Ne pas les redupliquer
> ici — ce fichier ne note que ce qui est **propre au PIM**.

## CQRS — command + handler colocalisés **par cas**

Le PIM utilise le bus `@nestjs/cqrs`, avec **un fichier par cas** colocalisant la
classe `Command`/`Query` **et** son handler (≠ les fichiers séparés du B2B). Détail,
arborescence de référence et règles : **[monorepo CLAUDE.md § 4 — PIM](../../CLAUDE.md#pim--bus-nestjscqrs-command--handler-colocalisés-par-cas)**.

En bref : `application/<cas>.ts` = command + handler ; les gardes/dérivations
partagées par plusieurs cas dans `application/<agrégat>-support.ts` ; le contrôleur
ne fait que `execute<Command, Result>()`. Contextes de référence : `catalogue/`,
`commerce/`.
