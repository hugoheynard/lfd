# TODO — `Company` porte trop de choses pour un seul fichier

**Ouvert le 2026-09-03**, en y faisant entrer le KBIS.

## Le fait

`apps/lfd-api/src/b2b/account/domain/entities/company.ts` fait **673 lignes**.
La règle du dépôt est « fichiers ≲300 lignes » (`CLAUDE.md` §6). Il en faisait
597 avant ce chantier : la limite était déjà franchie, et je l'ai éloignée.

C'est écrit ici plutôt que tu, parce qu'une violation qu'on prolonge sans la
nommer devient la nouvelle norme au commit suivant.

## Ce que ça coûte, concrètement

Rien aujourd'hui à la lecture — l'agrégat est ordonné et chaque méthode porte sa
raison. Le coût est **à l'écriture** : personne ne relit 673 lignes avant
d'ajouter une méthode, donc la prochaine règle ira là où il y a de la place au
lieu d'aller où elle appartient. C'est ainsi qu'une entité devient un sac.

## Ce qu'il NE faut pas faire

Découper par **taille** — « les 300 premières lignes ici, le reste là ». Deux
fichiers qui se partagent un invariant sont pires qu'un gros fichier qui le
porte : le cycle charger → muter → écrire cesse d'être lisible d'un bloc.

## La coupure qui a du sens

`Company` mêle aujourd'hui **quatre sujets** qui n'évoluent pas ensemble :

| Sujet           | Ce qui bouge avec lui                                                            |
| --------------- | -------------------------------------------------------------------------------- |
| L'identité      | `completeLegalIdentity`, `correctLegalIdentity`, `editSoftIdentity`, `assignNaf` |
| Le détenteur    | `attachHolder`, `changePrimaryContact`                                           |
| Le cycle de vie | `activate`, `suspend`, `reactivate`, `terminate`                                 |
| Le commerce     | `requestTerm`, `grantTerms`, `preferFulfillment`                                 |

Le KBIS, lui, **est déjà sorti** : `KbisDeposit` porte sa règle dans son propre
fichier, et `Company` ne garde que trois délégations. C'est le motif à répéter —
un sujet qui a une règle sort en value object, pas en « partie 2 de l'entité ».

Le candidat le plus net est le **cycle de vie** : quatre transitions, une machine
à états, ses propres erreurs (`CompanyStatusTransitionError`,
`CompanyActivationBlockedError`) et sa propre cause de suspension. Il se tient
tout seul.

## Quand le faire

Pas maintenant, et pas pour la taille. Le jour où une **cinquième** transition
d'état arrive, ou qu'une règle d'activation se complique : c'est là que le
découpage se paie tout seul, et qu'on saura où couper parce que le besoin le
dira. Un découpage fait à froid choisit la mauvaise ligne.
