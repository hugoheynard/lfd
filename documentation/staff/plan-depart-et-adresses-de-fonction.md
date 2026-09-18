# Plan — une fiche est une personne : le départ, et les adresses de fonction

> **Ouvert le 2026-09-18** à la demande de Hugo, en trois temps :
>
> - « pas possible de supprimer une fiche staff, ça serait une erreur, propose
>   moi autre chose » ([`architecture-acces-staff.md`](architecture-acces-staff.md) §13.2) ;
> - « si la personne derrière dev@lafoliedouce.com change, il faut qu'on puisse
>   opérer une transition qui fige les faits opérés par la personne ayant
>   l'adresse avant » ;
> - « la problématique serait pour n'importe quel poste, si j'avais
>   comptabilité@ : ce n'est pas le rôle qui a une journalisation, c'est la
>   personne occupant le rôle ».
>
> Remplace [`journalisation-staff/todo-changement-de-titulaire-de-la-racine.md`](journalisation-staff/todo-changement-de-titulaire-de-la-racine.md).
> État : 📐 plan, rien n'est codé. Frontière de sécurité et migrations :
> **deuxième version**, réécrite après une première contradiction de `vitruve`
> qui a cassé son mécanisme central (§8).

## 0. Résumé

Aujourd'hui une fiche staff est, de fait, une **adresse** : l'e-mail est unique
sur toutes les fiches, et la seule façon de se séparer de quelqu'un est une
**suppression physique**. Si deux personnes se succèdent derrière
`comptabilite@`, il faudrait supprimer la première — et ses faits perdraient
leur auteur.

Ce plan fait de la fiche **une personne** :

1. **On ne supprime plus, on retire de l'équipe** : un état `departed`, daté,
   attribué ; la fiche ne disparaît jamais.
2. **Une identité Auth0 ne sert jamais à deux personnes.** Au départ, l'identité
   du partant est bloquée et son adresse remplacée par une adresse morte ; son
   `sub` reste attaché à sa fiche, pour toujours.
3. **L'adresse de fonction se libère** : un successeur la reprend sur **sa
   propre fiche**, avec **une identité Auth0 neuve**.
4. **« Passer le relais »** fait les deux dans un geste.

Le journal n'a rien à convertir : un `sub` ne désignant jamais qu'une personne,
il reste un identifiant exact de l'auteur.

## 1. Ce qui existe (vérifié le 2026-09-18, revérifié par `vitruve`)

| Fait                                                                                                                                                                        | Où                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `StaffUser.email` est `@unique` sur **toutes** les fiches ; `auth0Id` est `@unique` et nullable                                                                             | `staff.prisma:97,112`                                                                         |
| États : `pending`, `invited`, `active`, `suspended` ; `PATCH …/status` n'accepte que `active` / `suspended`, et la politique ne garde que la suspension                     | `staffStatusChangeSchema`, `staff-access.policy.ts:106`                                       |
| `DELETE /admin/staff-users/:id` supprime physiquement ; les dérogations partent en cascade ; l'écran a « Supprimer »                                                        | `prisma-staff-user.repository.ts`, `reglages-staff-users-page.html`                           |
| Le résolveur cherche la fiche **par `auth0Id` d'abord** ; s'il la trouve, il n'essaie **pas** l'e-mail ; il refuse une fiche `suspended`                                    | `prisma-staff-access.resolver.ts:86,128-145`                                                  |
| Le rapprochement par e-mail ne vaut que pour une fiche **sans** `auth0Id` et un jeton à adresse **vérifiée**, puis écrit `auth0Id` et `active`                              | `prisma-staff-access.resolver.ts:137-166`                                                     |
| L'invitation (`provision`) crée l'identité Auth0 sur `lfc-staff` ; si l'adresse est déjà prise (409), elle **retrouve l'identité existante par l'e-mail** et rend son `sub` | `auth0-identity.gateway.ts:69-92,227`                                                         |
| `markInvited` écrit `auth0Id` = ce `sub` sur la fiche invitée — soumis à l'unicité de `auth0Id`                                                                             | `prisma-staff-user.repository.ts:161-168`                                                     |
| `OpenStaffAccess.open` ne refuse qu'une fiche `suspended`                                                                                                                   | `open-staff-access.service.ts:65`                                                             |
| La passerelle modifie déjà une identité Auth0 (`PATCH /api/v2/users/{id}`, pour l'adresse) — le blocage passe par la même route et le même droit `update:users`             | `auth0-identity.gateway.ts:147`                                                               |
| La racine est la fiche dont l'e-mail égale `BOOTSTRAP_ADMIN_EMAIL` ; `ensureBootstrapAdmin` la recrée si **aucune** fiche ne porte cette adresse                            | `prisma-staff-user.repository.ts:174,211`                                                     |
| Trois lecteurs résolvent un `sub` en fiche : `PrismaActorNamer`, `PrismaStaffDirectory` (auteurs des notes client, des écarts d'accès), le résolveur d'accès                | `prisma-actor-namer.ts`, `b2b/account/infrastructure/prisma-staff-directory.ts:29`, résolveur |
| Le contrat sert `StaffStatus` au back-office en ligne, qui le range dans des `Record<StaffStatus, …>` ; le JSDoc dit « `suspended` — départ »                               | `packages/contracts/src/staff-user.ts:26,31`, `admin/staff-users/staff-roles.ts:26`           |
| Cinq index uniques **partiels** existent, déclarés dans leur migration et décrits en commentaire dans le schéma (Prisma ne les exprime pas)                                 | `20260903200000_un_seul_detenteur_par_societe`, `accounting.prisma:366`                       |
| L'API tourne sur une instance en production ; le cache d'accès (30 s) est local au processus                                                                                | `ci-cd/architecture-deploiement.md`, résolveur                                                |

## 2. Décisions

**D1 — Une fiche est une personne.** Elle naît avec quelqu'un, garde son nom,
ses droits, son histoire et **son `sub`**, et ne se supprime jamais. Une adresse
de fonction est un attribut de la fiche du moment, pas son identité.

**D2 — `departed` : « a quitté l'équipe ».** Un état terminal, distinct de
`suspended` (temporaire), avec `departed_at` et `departed_by_staff_id` (sans clé
étrangère). Une fiche partie :

- n'entre plus nulle part : trouvée par son `sub`, elle est refusée — et le
  rapprochement par e-mail ne s'essaie même pas ;
- sort de la liste par défaut ; un filtre « Anciens membres » la montre ;
- reste lisible partout : son `sub` lui reste attaché, donc le journal, le
  namer et `StaffDirectory` la retrouvent et la nomment ;
- **ne revient que par le geste « Faire revenir »** (D6) : l'invitation
  (`OpenStaffAccess.open`) et `PATCH status` la refusent explicitement — ces deux
  chemins ne lisent aujourd'hui que `suspended`, ils sont nommés un à un.

Garde-fous du départ : ceux de la suspension — ni la racine (hors passation,
D5), ni le dernier admin présent, ni soi-même (hors passation). « Au moins un
admin » compte les admins ni suspendus ni partis.

**D3 — Une identité Auth0 ne sert jamais à deux personnes.** C'est la décision
qui remplace tout le mécanisme de la première version. Un jeton d'accès émis ne
se révoque pas : si un successeur était relié au `sub` du partant, tout jeton
encore valide du partant ouvrirait la fiche du successeur. Donc :

- **la fiche partie garde son `auth0_id`** — et l'unicité de `auth0_id` en base
  interdit alors, **structurellement**, de relier ce `sub` à une autre fiche ;
- **au départ, l'identité Auth0 du partant est retirée** : bloquée
  (`blocked: true`) et son adresse remplacée par une adresse morte, unique et
  non routable (`departed+<id de fiche>@invalid.lafoliedouce.eu`), adresse
  **non vérifiée**. L'adresse de fonction redevient libre sur la connexion
  `lfc-staff` ;
- **l'invitation du successeur crée donc une identité neuve** : `provision` ne
  trouve plus l'ancienne par l'adresse, `createUser` rend un `sub` neuf.

**D4 — Si le retrait Auth0 échoue, rien ne peut se relier à l'ancien `sub`.**
Le départ est un geste local : il s'écrit, et la porte locale est fermée (fiche
partie ⇒ refusée). Le retrait Auth0 vient **après** le commit. S'il échoue :

- une colonne `identity_retired_at` reste nulle sur la fiche partie ; l'écran
  affiche « Identité de connexion à retirer — Relancer » ; le bulletin de
  démarrage le compte ;
- si quelqu'un invite un successeur à la même adresse avant la relance,
  `provision` retrouve l'**ancien** `sub` par l'adresse, et `markInvited` échoue
  sur l'unicité de `auth0_id` : la base refuse, sans qu'aucun code ait à y
  penser. Le refus est traduit en un message qui dit quoi faire (« l'identité de
  Cécile Martin n'est pas encore retirée : relancer depuis sa fiche »).

**D5 — « Passer le relais ».** Sur une fiche présente : saisir le prénom, le nom
et la fonction du successeur. **Dans une transaction** : la fiche actuelle part
(D2), la fiche du successeur est créée **à la même adresse**, avec le **même
rôle** et les **mêmes dérogations** — recopiées, auteur = celui qui passe le
relais, date du jour —, et les faits s'écrivent. **Après le commit**, dans cet
ordre : retrait de l'identité du partant (D3), **puis** invitation du successeur.
Si le retrait échoue, l'invitation n'est pas tentée (elle échouerait, D4) et
l'écran propose de relancer les deux.

La **racine** ne part que par une passation, et son titulaire peut la passer
lui-même (c'est le cas `dev@`). Il y a ainsi toujours une fiche **présente** à
`BOOTSTRAP_ADMIN_EMAIL` : `ensureBootstrapAdmin` et `isRoot` ne regardent que
les fiches présentes, et ne recréent pas de racine dans l'intervalle — la
transaction ne laisse pas d'intervalle.

**D6 — « Faire revenir ».** Refusé si une fiche présente porte l'adresse (le
message la nomme). Sinon : la fiche redevient `active` ; son identité Auth0 est
débloquée et reprend l'adresse de fonction ; un lien de mot de passe part. Le
`sub` est le sien — il n'a servi à personne d'autre.

**D7 — L'adresse n'est unique que parmi les fiches présentes.** Un index unique
partiel `WHERE status <> 'departed'` remplace `staff_users_email_key`, déclaré
dans sa migration et décrit en commentaire dans `staff.prisma`, selon la
convention des cinq précédents. Le schéma perd son `@unique` sur `email` : le
client généré perd `findUnique({ email })`, et **tout** le code qui cherche une
fiche par adresse passe à `findFirst` sur les fiches présentes — dans le même
déploiement (il ne compilerait pas autrement). Quinze lectures dans `test/` sont
à reprendre ; aucune dans `src/dev/` ni les seeds.

**D8 — La suppression disparaît.** « Supprimer » devient « Retirer de
l'équipe » ; `DELETE /admin/staff-users/:id` répond `409` en nommant le nouveau
geste, puis la route est retirée.

**D9 — La boîte de fonction est un facteur d'authentification.** Le lien
d'invitation du successeur part à `comptabilite@` : quiconque lit cette boîte
peut le suivre. **Couper l'accès du partant à la boîte avant de passer le
relais** est un geste d'exploitation, écrit dans le runbook et rappelé par
l'écran de passation. Le code ne peut pas le faire à notre place.

## 3. Le journal

| Type                          | Sujet            | Charge utile                                     | Phrase                                                                          |
| ----------------------------- | ---------------- | ------------------------------------------------ | ------------------------------------------------------------------------------- |
| `staff_user.departed`         | la fiche partie  | `{ person, roleLabel }`                          | Hugo Heynard a retiré Cécile Martin de l'équipe                                 |
| `staff_user.returned`         | la fiche revenue | `{ person, roleLabel }`                          | Hugo Heynard a fait revenir Cécile Martin dans l'équipe                         |
| `staff_user.handed_over`      | le successeur    | `{ person, previous: Person, email, roleLabel }` | Hugo Heynard a passé le relais de comptabilite@… de Cécile Martin à Paul Durand |
| `staff_user.identity_retired` | la fiche partie  | `{ person }`                                     | L'identité de connexion de Cécile Martin a été retirée                          |

Chaque fait s'écrit dans la transaction de son geste (porte `journal-tracked`).
`identity_retired` s'écrit dans la transaction qui pose `identity_retired_at`,
après l'appel Auth0 réussi.

## 4. L'ordre des déploiements

1. **Le contrat et l'écran connaissent `departed`** — libellé, variante, filtre,
   JSDoc corrigé — **avant** que l'API ne puisse le renvoyer. Rien d'autre.
2. **Étendre** : la valeur `departed` (seule dans sa migration), les colonnes
   `departed_at`, `departed_by_staff_id`, `identity_retired_at`. Le résolveur,
   l'invitation, `PATCH status`, les compteurs d'admins savent refuser ou
   exclure `departed`.
3. **Le geste, avec son index** : l'index partiel remplace l'unicité globale
   (D7) **dans le même déploiement** que « Retirer de l'équipe », « Passer le
   relais », « Faire revenir », le retrait Auth0, le `409` sur `DELETE`, et le
   runbook (D9).
4. **Retirer** la route `DELETE`.

Chaque étape laisse la production cohérente si la suivante tarde : 1 n'est que
de l'affichage ; 2 n'écrit jamais `departed` ; 3 livre le geste et ce qui le
rend possible ensemble.

## 5. Tests

- **Politique** : départ refusé pour la racine hors passation, pour le dernier
  admin, pour soi-même hors passation ; retour refusé si l'adresse est reprise ;
  `PATCH status: active` et l'invitation refusés sur une fiche partie.
- **Résolveur** : le jeton d'une fiche partie est refusé **même avec une adresse
  vérifiée égale à celle d'une fiche présente non liée** — le cas qui cassait la
  première version.
- **Passation** (e2e, double d'Auth0) : le successeur est créé à la même
  adresse, avec le même rôle et les mêmes dérogations ; le partant est parti et
  **garde son `sub`** ; le double enregistre le blocage et l'adresse morte ; le
  successeur reçoit un `sub` neuf ; **l'ancien jeton ne rend rien**, avant comme
  après l'entrée du successeur ; le journal nomme chacun pour ses faits.
- **Retrait échoué** : le départ est écrit ; l'invitation du successeur échoue
  sur l'unicité de `auth0_id` et rend le message de D4 ; la relance réussit.
- **Index** : deux fiches présentes à la même adresse sont refusées par la base ;
  une partie et une présente sont acceptées.

## 6. Ce que ce plan ne fait pas

- **Convertir l'auteur du journal** ou les autres colonnes d'auteur : le `sub`
  reste un identifiant exact (D3). Le
  [TODO du `sub`](journalisation-staff/todo-le-sub-comme-auteur.md) ne reste
  ouvert que pour la fuite de donnée.
- Les rôles éditables à l'écran, non lus par l'accès
  ([`architecture-acces-staff.md`](architecture-acces-staff.md) §13.1).

## 7. À vérifier chez Auth0, avant de bâtir

- Qu'un utilisateur **bloqué** ne peut plus obtenir de jeton, ni par mot de
  passe ni par rafraîchissement, et que ses jetons déjà émis restent refusés par
  **nous** (fiche partie) — le second point ne dépend pas d'Auth0.
- Que changer l'adresse d'un utilisateur d'une connexion base de données libère
  bien l'ancienne adresse pour un `createUser`.
- Les droits réels de l'application M2M (`update:users` suffit-il pour
  `blocked` ?).
- Si « mot de passe oublié » est ouvert sur `lfc-staff` — sans incidence sur un
  utilisateur bloqué, à confirmer.

## 8. Ce que `vitruve` a changé (première contradiction, 2026-09-18)

| Objection                                                                                                           | Ce qui a changé                                                                  |
| ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| BLOQUANT — le successeur héritait du `sub` du partant ; un jeton d'accès ne se révoque pas                          | D3 : une identité ne sert jamais à deux personnes ; le partant garde son `sub`   |
| BLOQUANT — le rapprochement par e-mail reliait le jeton du partant à la fiche du successeur                         | La fiche partie garde son `sub` : trouvée par lui, refusée, pas de rapprochement |
| BLOQUANT — l'index partiel arrivait après le geste qui en a besoin, et le retrait de `@unique` casse la compilation | D7 et §4 : index, code et geste dans le même déploiement                         |
| BLOQUANT — « refuser la reprise tant que l'identité n'est pas retirée » sans mécanisme                              | D4 : `identity_retired_at`, et l'unicité de `auth0_id` refuse en base            |
| SÉRIEUX — l'invitation et `PATCH active` font revenir une fiche partie sans contrôle                                | D2 : nommés et refusés                                                           |
| SÉRIEUX — la boîte de fonction est elle-même un facteur                                                             | D9, runbook                                                                      |
| SÉRIEUX — la conversion de l'historique du journal était irréversible et effaçait des auteurs                       | Plus de conversion : inutile avec D3                                             |
| SÉRIEUX — « lisible partout » faux pour les lecteurs qui résolvent un `sub`                                         | Vrai désormais : le `sub` reste sur la fiche partie                              |
| SÉRIEUX — contrat servi au front en ligne                                                                           | §4, étape 1                                                                      |
| SÉRIEUX — passation de la racine par son titulaire                                                                  | D5 : permise, sans intervalle                                                    |
| MINEUR — « aucun index partiel dans le dépôt » était faux                                                           | Corrigé : cinq précédents, convention suivie                                     |
