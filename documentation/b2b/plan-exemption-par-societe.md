# L'exemption d'une fonctionnalité par société

> ✅ **Bâti le 2026-11-28** (plan du 2026-11-27). Décidé par Hugo le 2026-11-27 : « en prod
> l'exemption concernera la company, pas un membre ». Premier consommateur :
> la clé `orderPlanner` du
> [planificateur de commandes](../commandes/planificateur/plan-planificateur-de-commandes.md)
> (§ 6.1). L'état actuel des accès est décrit dans
> [`architecture-feature-flags.md`](architecture-feature-flags.md). Contredit
> par `vitruve` le même jour (3 bloquants, 5 sérieux), intégrés au § 6.

## 1. En simple

Une fonctionnalité fermée pour tous peut s'ouvrir à quelques-uns : c'est une
**exemption**. Elle visait **une adresse e-mail prouvée**, donc une personne.
Le planificateur s'ouvre à **un client**, c'est-à-dire à une société : tous
ceux qui agissent pour elle le voient, et personne d'autre.

```mermaid
flowchart LR
  S["Staff : Accès aux fonctionnalités"] -->|"exempte la société X"| E["feature_access_company_exemptions"]
  P["Une personne agit pour X<br/>(espace déclaré, vérifié par le serveur)"] --> R["accès au planificateur ?"]
  E --> R
  R -->|"ouvert"| A["menu, page et routes du planificateur"]
```

## 2. Les règles

1. **La société jugée est celle de l'espace où l'on agit**, déclarée par
   l'en-tête d'espace et vérifiée par le serveur (`@ActingCompany`, qui refuse
   une société que la personne n'atteint plus). Dans l'espace personnel,
   aucune exemption par société ne joue.
2. **Égalité exacte, sans héritage.** Exempter un principal n'ouvre pas ses
   sites ; exempter un site n'ouvre ni son principal ni ses frères. C'est la
   règle des exemptions à l'ouverture des commandes
   (`order-opening-exemption.ts`, `matches`, vérifié le 2026-11-27).
3. **Le catalogue dit par quoi une clé s'exempte** : `exemptBy: "email" |
"company"` remplace le booléen `exemptible` (absent = non exemptible).
   Aujourd'hui, `orderPlanner` est la **seule** clé exemptible
   (`feature-access.levels.ts`, vérifié le 2026-11-27 : `shop` a été retirée
   le 2026-10-09), et elle passe à `company`. Le chemin par adresse reste,
   pour une clé future qui se teste avant toute société ; il n'a plus de
   consommateur aujourd'hui, et le plan le dit plutôt que de le supprimer.
4. **Une table à part**, `public.feature_access_company_exemptions` : clé
   primaire `(key, company_id)`, `company_name` figé à l'ajout, auteur figé
   (`created_at`, `created_by_staff_id`, `created_by_name`,
   `created_by_role`), sans clé étrangère. Pas de colonne nullable, pas de
   `CHECK` ni d'unicité partielle : rien que Prisma ne sache décrire, donc
   aucun écart à admettre dans `schema-drift-admitted.json`. La table des
   adresses ne bouge pas.
5. **Le retrait supprime la ligne**, comme pour les exemptions par adresse du
   même catalogue ; le fait du journal garde qui, quoi et quand. Une société
   inconnue ou archivée à l'ajout est refusée.

## 3. Où l'accès se juge

Le niveau servi par `GET /me` est calculé **sans l'en-tête d'espace**
(`account.service.ts`, et l'intercepteur ne le pose pas avant `/me`) et il est
lu **une fois** par chargement : il ne peut pas dire si l'espace affiché est
exempté. Il ne sert donc plus à ouvrir le planificateur.

- **Serveur** : `PlannerAccess.isOpenFor({ companyId })` — la société du mur
  (`PlannerWall`, déjà `@ActingCompany`). Ouvert si le niveau global est
  `open`, ou si la société est exemptée pour `orderPlanner`.
- **Route de lecture** : `GET /planner/access` → `{ open: boolean }`, dans
  l'espace déclaré, sans écriture. Particulier : `false` (pas de 403 : le menu
  la lit dans tous les espaces).
- **Boutique** : le menu et la garde de `/planificateur` lisent cette route
  **par la brique `client/context-keyed/`** (`lint:context-keyed-readers`) :
  la réponse est rangée par espace, et changer d'espace la relit. La lecture
  de `orderPlanner` dans `client-feature-access.service.ts` est retirée.
- **`/me`** continue de servir le niveau **global** d'`orderPlanner`, sans
  exemption, pour ne pas mentir : le commentaire de `me.controller.ts` qui
  promet que la garde et `/me` répondent pareil est réécrit pour cette clé.

## 4. Ce qui change, fichier par fichier

- **Contrat** : `feature-access.levels.ts` (`exemptBy`), `planner.ts`
  (`PlannerAccessView`), vues admin des exemptions par société.
- **API** :
  - schéma `feature-access.prisma` et migration additive (nouvelle table,
    rollback écrit) ;
  - `lafoliecoffee/feature-access/` : agrégat ou entité de l'exemption par
    société (refus société inconnue, déjà exemptée), port de dépôt, adaptateur
    Prisma, routes admin (ajouter, retirer, lister), lecteur de l'écran ;
    résolution `isOpenForCompany(key, companyId)` ;
  - `recurring/channels/commerce/planner-access.ts` (`PlannerCaller` →
    société), `feature-access-planner-access.ts`, `planner-wall.ts`, les
    handlers et le contrôleur du planificateur, la requête `GET /planner/access` ;
  - `me.controller.ts` / `get-feature-levels.handler.ts` : `orderPlanner`
    global, sans exemption.
- **Boutique** : lecteur context-keyed de l'accès, `planner-open.guard.ts`,
  `client-nav.service.ts`, `client-feature-access.service.ts`.
- **Back-office** : écran `admin/feature-access` — pour une clé `company`, un
  sélecteur de société non archivée (`lint:company-archived-views`) et la liste
  des sociétés exemptées.
- **RGPD** : `created_by_staff_id` et `created_by_name` (staff) entrent au
  registre (`lint:rgpd-staff`). `company_id` / `company_name` désignent une
  personne morale : hors registre. L'oubli existant — la colonne `email` de
  `feature_access_exemptions`, adresse d'un client, absente du registre — est
  inscrit dans le même lot.

## 5. Données existantes

La production n'a jamais porté d'exemption `orderPlanner` par adresse : la clé
y est arrivée avec l'exemption par société (déployée le 2026-11-28). Ailleurs,
une ligne `orderPlanner` par adresse est sans effet ; l'écran la montre comme
« ignorée, sorte retirée », et le staff la supprime.

## 6. La contradiction (`vitruve`, 2026-11-27)

| Objection                                                          | Sort                                                                                                  |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| B1 — la boutique lit le niveau par `/me`, sans espace, une fois    | intégrée : `GET /planner/access` lu par la brique context-keyed (§ 3)                                 |
| B2 — `/me` et la garde répondraient deux choses ; `@ActingCompany` | intégrée : `/me` sert le global, la garde juge l'espace vérifié (§ 3)                                 |
| B3 — la clé `shop` n'existe plus                                   | intégrée : `orderPlanner` seule exemptible ; chemin par adresse gardé et dit (§ 2.3)                  |
| S — lignes par adresse rendues muettes                             | intégrée : jamais en prod ; « ignorées » à l'écran ailleurs (§ 5)                                     |
| S — `CHECK`, unicité partielle, `email` nullable, clé `key_email`  | intégrée : table à part, sans nullable ni contrainte non décrite (§ 2.4)                              |
| S — RGPD non tranché                                               | intégrée : staff au registre, personne morale hors, `email` rattrapé (§ 4)                            |
| S — retrait destructif                                             | assumée : même règle que les exemptions par adresse, le journal garde la trace                        |
| S — chiffrage absent                                               | intégrée (§ 4)                                                                                        |
| Mineurs (`/feature-access/mine` disparue, e2e du sous-compte)      | corrigés ; l'e2e du sous-compte vise un membre du site, rattaché, pour atteindre `PlannerClosedError` |
