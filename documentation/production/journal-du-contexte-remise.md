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
| 3   | `src/handover/` — déplacement et recomposition | ✅ fait       | `T3`   |
| 4   | Les portes — `BLOCK_OF` d'abord                | ✅ fait       | `T3`   |
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

---

## Tranches 3 et 4 — le bloc `handover`, et les portes qui le tiennent

Parties ensemble, comme le plan l'exigeait : `context-boundaries` échoue sur un
dossier de premier niveau qu'il ne connaît pas, donc un `src/handover/` sans sa
ligne dans `BLOCK_OF` rend `pnpm lint:gates` rouge.

**17 fichiers déplacés par `git mv`** — l'historique suit —, plus une scission
d'erreurs (3 classes sur 9), deux index de canal, deux modules Nest et un
adaptateur neuf.

### La règle qu'on s'est donnée : aucun comportement observable ne change

Les trois codes d'erreur gardent leur préfixe `production.handover.*`. Ils
partent dans l'enveloppe servie aux clients, et les renommer aurait mêlé un
déplacement à une modification de surface. Vérifié : le front de retrait matche
sur le **chemin**, jamais sur le code. Ils seront renommés avec l'URL, en
tranche 5, où ils ont leur place.

C'est ce qui permet de relire cette tranche comme un `git mv` — ce qu'elle
n'est pas, mais ce qu'elle doit **valoir**.

### Ce que le déplacement a rendu visible

**Le fournil tenait un dépôt d'écriture pour poser une question.**
`referencesAttestedSince` vivait sur `OrderHandoverRepository`, le port d'écriture
de la remise, et `get-production-day-status` l'appelait en direct. Ça marchait
parce que les deux étaient dans le même bloc.

Elle est devenue `AttestedHandoversReader`, **déclarée par la production** dans
`channels/handover/` et implémentée par un adaptateur dédié de la remise. Deux
adaptateurs pour une même table, et ce n'est pas de la cérémonie : l'un sert
l'agrégat de la remise, l'autre sert une question posée par un autre contexte.
Les fondre ferait qu'élargir l'un élargirait l'autre.

**`ProductionFeedModule` câblait un fil qui ne le traversait pas.** Il portait
les trois ports sous le nom du fournil, alors que `HandoverSubjectReader` est
déclaré par la remise. D'où `HandoverFeedModule` — 🔴 **le seul module du dossier
qui branche un port dans chaque sens**, et c'est ce qui le rend instructif :
aucun des trois contextes ne connaît les deux autres.

**`channels/commerce/index.ts` publiait deux surfaces sous un seul nom.** Le
commerce importait « la production » pour parler à la remise. Scindé.

### Deux erreurs à moi, et ce qui les a attrapées

⚠️ Une chaîne `cd … && cat > …` dont le `cd` a échoué : **le port n'a jamais été
écrit**, et le reste du bloc a continué comme si de rien n'était. Attrapé par le
typecheck, pas par moi.

⚠️ Une découpe de fichier par index de chaîne a laissé **une accolade en trop**.
Même attrape.

### Ce que les portes ont dit

`lint:doc-references` a échoué **sur le plan lui-même** : il citait quatre chemins
qui venaient de bouger. C'est exactement ce pour quoi elle existe — un document
qui nomme un fichier disparu gèle le chantier de celui qui le lit.

**Verdict** : 35 portes vertes, typecheck (production **et** specs) vert, 26
suites unitaires / 239 tests, 4 suites e2e / 77 tests contre le vrai Postgres.
