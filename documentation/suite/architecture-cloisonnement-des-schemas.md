# Cloisonnement des schémas — qui a le droit de lire quoi

> 📐 **Doc-first.** Rien de ce document n'est codé, à une exception près,
> livrée le 2026-08-20 et décrite en §3 : le référentiel est cloisonné, les
> autres blocs ne le sont pas.
>
> Écrit à partir d'une question posée pendant B4 : « pim ne peut pas accéder à
> ops, si ? »

## 1. Le problème, en une ligne

Une seule base, **quatre schémas** (`public`, `growth`, `ops`, `pim`), **un seul
client Prisma** — donc n'importe quel bloc peut lire n'importe quelle table.

Tant qu'il y avait deux bases, le mur existait sans qu'on l'écrive : le client du
référentiel ne connaissait que ses modèles, et `prisma.company` ne compilait pas.
B4 a fusionné les bases et **a supprimé ce mur sans le remplacer**. C'est le prix
de la consolidation, et il faut le payer explicitement.

## 2. Ce qui existe déjà, et ce que ça ne couvre pas

| Mécanisme                        | Ce qu'il vérifie                                  | Ce qu'il laisse passer                            |
| -------------------------------- | ------------------------------------------------- | ------------------------------------------------- |
| `context-boundaries.mjs`         | un bloc n'IMPORTE un autre que s'il en a le droit | `ops/` qui lit la table `companies` par le client |
| `cross-schema-join.mjs`          | aucune requête BRUTE ne joint deux schémas        | la même jointure faite en deux appels typés       |
| `schema-ops.counter.ts` + parité | la table modèle → schéma ne ment pas              | rien — il compte, il n'interdit pas               |

Les trois sont bons et ne se remplacent pas. Aucun ne dit **quel bloc a le droit
de toucher quel schéma**.

## 3. Ce qui est fait : le référentiel, et lui seul

`PimPrismaService` n'aliase plus le client complet : il **énumère ses 16
modèles**. Le compilateur refuse le reste — éprouvé en glissant un accès à
`nodeStatusLog` dans un dépôt du référentiel.

Deux frontières distinctes, qu'il ne faut pas confondre :

- **QUI peut injecter** — `PimDatabaseModule` n'est pas `@Global` ;
- **QUOI il atteint une fois injecté** — la surface énumérée.

⚠️ `$transaction` n'est déclaré qu'en forme **tableau**. La forme callback rend
un client complet dans `tx` : elle annulerait tout le rétrécissement en une
ligne, sans que rien ne le signale.

## 4. La question ouverte : qui possède `public` ?

C'est elle qui bloque la généralisation, et ce n'est pas une question technique.

| Schéma   | Écrit par                     | Lu par                          |
| -------- | ----------------------------- | ------------------------------- |
| `pim`    | `pim/`                        | `pim/`                          |
| `growth` | `b2b/`                        | `b2b/`                          |
| `ops`    | `ops/`, `platform/` (mailer)  | `ops/`                          |
| `public` | `staff/`, `b2b/`, `platform/` | tout le monde, y compris `ops/` |

`public` est le bac commun : sociétés, commandes, utilisateurs staff,
notifications. Trois blocs y écrivent. Lui donner un propriétaire unique
demanderait soit de le découper, soit d'accepter une exception si large qu'elle
viderait le gate de son sens.

**Trois issues possibles**, à trancher :

**A — Cloisonner par la SURFACE, comme le référentiel.** Chaque bloc reçoit un
jeton d'injection énumérant ses modèles. Exact, tenu par le compilateur, aucun
faux positif. Coût : quatre listes à tenir, et il faut quand même répondre à la
question de `public`.

**B — Un gate `schema-access`.** Un fichier de `src/<bloc>/` ne référence que des
modèles des schémas de son bloc, en lisant `NON_PUBLIC_SCHEMA_OF_MODEL`. Uniforme
avec les autres gates du dépôt, volontairement grossier. Coût : `public` devient
une exception globale, donc le gate ne protège en pratique que `growth`, `ops` et
`pim` — ce qui est peut-être suffisant.

**C — Ne rien faire de plus.** Le référentiel est le seul bloc destiné à
redevenir une app un jour ; les trois autres sont durablement ensemble. Le
cloisonnement des trois protégerait contre une erreur qui ne coûte pas cher à
corriger tant qu'on est dans un seul déployable.

## 5. Recommandation

**B, restreint aux schémas non-`public`.** Il est uniforme avec l'outillage
existant, il se pose en une fois, et il attrape le cas qui coûte vraiment : `b2b/`
qui se met à écrire dans `ops`, ou `ops/` qui cesse d'être un observateur. `public`
reste ouvert, et c'est une décision assumée plutôt qu'un oubli.

À reprendre **après le déploiement du 2026-08-20**, avec du recul sur ce que la
production révèle.
