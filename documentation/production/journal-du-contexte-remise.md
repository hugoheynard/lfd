# Journal du contexte remise — ce qui est fait, et ce qu'on a trouvé en le faisant

> **Le ledger du chantier décrit par [`plan-contexte-remise.md`](plan-contexte-remise.md).**
> Une ligne par tranche, tenue **pendant** le travail et non après : ce qu'on a
> touché, ce qu'on a vérifié, et ce que le plan n'avait pas vu.
>
> Un journal n'est pas un compte rendu. Il porte les **surprises**, parce que ce
> sont elles qui coûtent, et parce qu'une tranche qui s'est bien passée n'apprend
> rien à celle d'après.

## L'état, d'un coup d'œil

| #   | Tranche                                        | État          | Commit |
| --- | ---------------------------------------------- | ------------- | ------ |
| 1   | Les quatre phrases fausses sur le jeton        | ✅ fait       | `T1`   |
| 2   | Éprouver la vue sur Accelerate                 | 🔴 **bloqué** | —      |
| 3   | `src/handover/` — déplacement et recomposition | ⏸ à faire     | —      |
| 4   | Les portes — `BLOCK_OF` d'abord                | ⏸ à faire     | —      |
| 5   | L'URL, avec alias déprécié                     | ⏸ à faire     | —      |
| 6   | `SELECT count(*)` puis la migration à la main  | ⏸ dépend de 2 | —      |
| 7   | `DROP VIEW`, puis retrait de l'alias           | ⏸ dépend de 6 | —      |
| 8   | La doc                                         | ⏸ à faire     | —      |

🔴 **La tranche 2 est bloquée et ce n'est pas technique.** Éprouver la vue sur
Accelerate demande un **projet Prisma Postgres jetable** — donc une décision et
un accès qui ne sont pas les miens. Tant qu'elle n'est pas faite, les tranches 6
et 7 n'existent pas : on ne bascule pas une table de schéma en production sur la
foi d'un essai fait sur un autre transport.

⚠️ Et un rappel qui vaut pour toute cette colonne : la clé Prisma Accelerate
fuitée n'a **toujours pas été révoquée**. Elle a fait la migration de production
et a prouvé son accès en écriture. La tranche 2 ne se fait pas avec elle.

---

## Tranche 1 — les quatre phrases fausses sur le jeton

**Ce qu'elle corrige.** `issuesHandoverToken()` n'a plus de paramètre et rend
`true` sans condition depuis le 2026-09-07 : les deux acheminements reçoivent un
jeton, parce que le coursier scanne aussi. Quatre phrases affirment encore le
contraire.

**Les quatre, et ce qu'elles disaient :**

| Où                                           | Ce qu'elle affirmait                                |
| -------------------------------------------- | --------------------------------------------------- |
| `public/orders.prisma`                       | « Émis à la passation pour les seules `pickup` »    |
| `public/orders.prisma`, deux lignes plus bas | « Les deux autres colonnes **SONT** l'attestation » |
| `prisma-order.repository.ts`                 | « Seul le retrait en reçoit un »                    |
| `order/architecture-bon-de-commande.md`      | « Rien de tout ça n'existe »                        |

Aucune n'a été **supprimée** : chacune garde sa formulation d'origine sous un
bandeau daté qui dit ce qui l'a périmée. Une raison qu'on efface se represente —
et la deuxième, sur l'attestation, est celle qui rouvrirait les deux vérités que
la table du fournil a fermées.

⚠️ **La quatrième était la pire, et pas parce qu'elle était fausse.** Le document
`architecture-bon-de-commande.md` écrivait « Rien de tout ça n'existe » à la ligne
302 et marquait **le même lot ✅ livré** à la ligne 582. Une phrase périmée laisse
au lecteur une chance de s'en apercevoir ; un document qui se contredit lui-même
lui retire jusqu'au moyen de trancher.

### 🔴 La surprise : le client Prisma est GITIGNORÉ

En corrigeant un commentaire du schéma, j'ai régénéré le client et constaté un
`git status` vide. J'allais en conclure « rien n'a changé ». C'est faux :
`apps/lfd-api/.gitignore` porte `/src/platform/database/client/`, et
`git ls-files` y compte **zéro** fichier suivi.

**Ce que ça périme, et il faut le dire** : lors de la découpe du schéma en
dossier (`d285e715`), j'ai annoncé le client « régénéré au bit près » sur la foi
d'un `git status` vide. Ce n'était pas une preuve — c'était un dossier ignoré. La
preuve d'équivalence de cette découpe reste entière, mais elle tient **au
`prisma migrate diff`** (« No difference detected »), pas à cette phrase-là.

Un `git status` vide sur un dossier généré ne prouve jamais rien. Vérifié le
2026-09-10.

**Portes** : 35/35 vertes.
