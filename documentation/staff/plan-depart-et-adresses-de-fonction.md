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
> **troisième version**. La première contradiction de `vitruve` a cassé le
> mécanisme central ; la seconde a montré que « l'identité du partant » n'est
> pas toujours celle que la fiche nomme, et que deux écritures existantes font
> revenir une fiche partie (§8).

## 0. Résumé

Aujourd'hui une fiche staff est, de fait, une **adresse** : l'e-mail est unique
sur toutes les fiches, et la seule façon de se séparer de quelqu'un est une
**suppression physique**. Si deux personnes se succèdent derrière
`comptabilite@`, il faudrait supprimer la première — et ses faits perdraient
leur auteur.

Ce plan fait de la fiche **une personne** :

1. **On ne supprime plus, on retire de l'équipe** : un état `departed`, daté,
   attribué ; la fiche ne disparaît jamais.
2. **Une identité Auth0 ne sert jamais à deux personnes.** Au départ, **toute**
   identité qui porte l'adresse est bloquée et reçoit une adresse morte ; le
   `sub` du partant reste attaché à sa fiche, pour toujours. Le successeur n'est
   jamais relié à une identité qui existait avant lui.
3. **L'adresse de fonction se libère** : un successeur la reprend sur **sa
   propre fiche**, avec **une identité Auth0 neuve**.
4. **« Passer le relais »** fait les deux dans un geste.

Le journal n'a rien à convertir : un `sub` ne désignant jamais qu'une personne,
il reste un identifiant exact de l'auteur.

## 1. Ce qui existe (vérifié le 2026-09-18, revérifié par `vitruve`)

| Fait                                                                                                                                                                                                                                      | Où                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `StaffUser.email` est `@unique` sur **toutes** les fiches ; `auth0Id` est `@unique` et nullable                                                                                                                                           | `staff.prisma:97,112`                                                                     |
| États : `pending`, `invited`, `active`, `suspended` ; `PATCH …/status` n'accepte que `active` / `suspended`, et la politique ne garde que la suspension                                                                                   | `staffStatusChangeSchema`, `staff-access.policy.ts:106`                                   |
| `DELETE /admin/staff-users/:id` supprime physiquement ; les dérogations partent en cascade ; l'écran a « Supprimer »                                                                                                                      | `prisma-staff-user.repository.ts`, `reglages-staff-users-page.html`                       |
| Le résolveur cherche la fiche **par `auth0Id` d'abord** ; s'il la trouve, il n'essaie **pas** l'e-mail ; il refuse une fiche `suspended`                                                                                                  | `prisma-staff-access.resolver.ts:86,128-145`                                              |
| Le rapprochement par e-mail ne vaut que pour une fiche **sans** `auth0Id` et un jeton à adresse **vérifiée**, puis écrit `auth0Id` et `active`                                                                                            | `prisma-staff-access.resolver.ts:137-166`                                                 |
| L'invitation (`provision`) crée l'identité Auth0 sur `lfc-staff` ; si l'adresse est déjà prise (409), elle **retrouve l'identité existante par l'e-mail** et rend son `sub`                                                               | `platform/identity/auth0-identity.gateway.ts:69-92,227`                                   |
| L'identité à une adresse n'est **pas toujours** `fiche.auth0Id` : fiches liées à un `sub` Google par l'ancien rapprochement, `sub` morts ou `dev\|`, identités orphelines laissées par chaque `DELETE` passé (qui n'appelle jamais Auth0) | résolveur (commentaire l. 44-48), `remove-staff-user.handler.ts:26-31`                    |
| `changeEmail` ne teste que `NOT_FOUND` : un `409` (adresse prise) **passe pour un succès**, et la base locale diverge d'Auth0 en silence — bug présent aujourd'hui                                                                        | `auth0-identity.gateway.ts:147-158`                                                       |
| `markInvited` écrit `status: invited` sur toute fiche non `active` ; `recordEntry` écrit `active` par `where { id }` — **aucune des deux ne conditionne le statut en base**                                                               | `prisma-staff-user.repository.ts:153-170`, résolveur `:169-173`                           |
| `countOtherLivingAdmins` compte tout admin non `suspended` — un `pending` qui ne peut pas encore entrer compte comme présent                                                                                                              | `prisma-staff-user.repository.ts:254-257`                                                 |
| `markInvited` écrit `auth0Id` = ce `sub` sur la fiche invitée — soumis à l'unicité de `auth0Id`                                                                                                                                           | `prisma-staff-user.repository.ts:161-168`                                                 |
| `OpenStaffAccess.open` ne refuse qu'une fiche `suspended`                                                                                                                                                                                 | `open-staff-access.service.ts:65`                                                         |
| La passerelle modifie déjà une identité Auth0 (`PATCH /api/v2/users/{id}`, pour l'adresse) — le blocage passe par la même route et le même droit `update:users`                                                                           | `auth0-identity.gateway.ts:147`                                                           |
| La racine est la fiche dont l'e-mail égale `BOOTSTRAP_ADMIN_EMAIL` ; `ensureBootstrapAdmin` la recrée si **aucune** fiche ne porte cette adresse                                                                                          | `prisma-staff-user.repository.ts:174,211`                                                 |
| Trois lecteurs résolvent un `sub` en fiche : `PrismaActorNamer`, `StaffBlockDirectory` (auteurs des notes client, des écarts d'accès), le résolveur d'accès                                                                               | `prisma-actor-namer.ts`, `b2b/account/infrastructure/staff-block-directory.ts`, résolveur |
| Le contrat sert `StaffStatus` au back-office en ligne, qui le range dans des `Record<StaffStatus, …>` ; le JSDoc dit « `suspended` — départ »                                                                                             | `packages/contracts/src/staff-user.ts:26,31`, `admin/staff-users/staff-roles.ts:26`       |
| Cinq index uniques **partiels** existent, déclarés dans leur migration et décrits en commentaire dans le schéma (Prisma ne les exprime pas)                                                                                               | `20260903200000_un_seul_detenteur_par_societe`, `accounting.prisma:366`                   |
| L'API tourne sur une instance en production ; le cache d'accès (30 s) est local au processus                                                                                                                                              | `ci-cd/architecture-deploiement.md`, résolveur                                            |

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
- **ne revient que par le geste « Faire revenir »** (D6). Quatre chemins
  savent aujourd'hui écrire sur elle, ils sont nommés un à un :
  - l'invitation (`OpenStaffAccess.open`) et `PATCH status` la refusent
    explicitement — ils ne lisent aujourd'hui que `suspended` ;
  - l'édition (`UpdateStaffUserHandler`) la refuse : une fiche partie est en
    lecture seule. Sans ça, changer son adresse réoccuperait l'adresse chez
    Auth0 par `changeEmail` sur l'identité bloquée ;
  - **`markInvited` et `recordEntry` deviennent des écritures conditionnées en
    base** (`updateMany … where status <> 'departed'`, zéro ligne ⇒ refus). Un
    contrôle en lecture ne suffit pas : l'invitation lit le statut, fait un
    appel réseau, puis écrit — un départ pendant l'appel serait annulé ; et le
    partant, qui choisit le moment de sa requête, pourrait remettre `active`
    une fiche `invited` juste après son départ.

Garde-fous du départ : ceux de la suspension — ni la racine (hors passation,
D5), ni le dernier admin présent, ni soi-même (hors passation). « Au moins un
admin » compte désormais les admins **`active`** seulement : ni suspendus, ni
partis, ni `pending`/`invited` — un admin qui n'est pas encore entré ne peut
rattraper personne.

Au départ, les **abonnements push** de la fiche sont retirés : aujourd'hui
tout abonnement reçoit toute notification (`prisma-staff-push-subscriptions.ts`,
`all()`), et l'appareil d'une personne partie continuerait de les recevoir
(relevé par la contradiction de [`../journalisation/architecture-journalisation.md`](../journalisation/architecture-journalisation.md) §12, D9).

Après chaque geste (départ, passation, retour), le cache d'accès est vidé
(`forgetAll`), comme le font déjà les handlers de statut.

**D3 — Une identité Auth0 ne sert jamais à deux personnes.** C'est la décision
qui remplace tout le mécanisme de la première version. Un jeton d'accès émis ne
se révoque pas : si un successeur était relié au `sub` du partant, tout jeton
encore valide du partant ouvrirait la fiche du successeur. Donc :

- **la fiche partie garde son `auth0_id`** — et l'unicité de `auth0_id` en base
  interdit alors, **structurellement**, de relier ce `sub` à une autre fiche ;
- **au départ, on retire l'adresse, pas seulement une fiche.** Le retrait
  bloque le `sub` de la fiche **et toute identité de `lfc-staff` qui porte
  l'adresse** (recherche par l'e-mail) : une fiche liée à un `sub` Google ou
  mort, ou une orpheline laissée par un ancien `DELETE`, porte l'adresse sans
  que la fiche la nomme. Chacune est bloquée (`blocked: true`) et reçoit une
  adresse morte `departed+<id>@staff.invalid` — TLD `.invalid`, non routable
  par construction —, **par un appel dédié** qui pose `verify_email: false`
  (pas `changeEmail`, qui enverrait un e-mail de vérification). Le retrait n'est
  réputé fait que lorsqu'une nouvelle recherche par l'adresse ne rend plus rien ;
- **le successeur reçoit toujours une identité neuve.** Son invitation passe par
  un `provision` **sans adoption** : si `createUser` répond « adresse déjà
  prise », on refuse, au lieu de retrouver l'identité existante. C'est ce qui
  rend la règle indépendante de l'état d'Auth0 : même une identité que personne
  n'a vue ne peut pas être adoptée par un successeur ;
- **le rapprochement par e-mail est fermé à une adresse qui a eu un titulaire.**
  Le résolveur ne relie plus un jeton inconnu à une fiche présente sans `sub`
  si une fiche partie porte la même adresse. Sans ça, entre le commit de la
  passation et l'invitation, le partant se connecterait avec une identité non
  retirée à adresse vérifiée, et serait relié à la fiche du successeur — sans
  aucune invitation. Le successeur n'est relié que par `markInvited`, avec le
  `sub` que `createUser` vient de rendre.

**D4 — Si le retrait Auth0 échoue, rien ne peut se relier à l'ancien `sub`.**
Le départ est un geste local : il s'écrit, et la porte locale est fermée (fiche
partie ⇒ refusée). Le retrait Auth0 vient **après** le commit. S'il échoue :

- une colonne `identity_retired_at` reste nulle sur la fiche partie ; l'écran
  affiche « Identité de connexion à retirer — Relancer » sur la fiche, et le
  filtre « Anciens membres » les signale ;
- si quelqu'un invite un successeur à la même adresse avant la relance, le
  `provision` sans adoption (D3) reçoit « adresse déjà prise » et refuse, avec
  un message qui dit quoi faire (« l'adresse comptabilite@… porte encore une
  identité de connexion : relancer le retrait depuis la fiche de Cécile
  Martin »). Filet en dessous : si un `sub` déjà inscrit arrivait quand même
  jusqu'à `markInvited`, l'unicité de `auth0_id` refuse en base ;
  `markInvited` traduit ce `P2002` **selon la contrainte** (`auth0_id` ou
  l'index de l'e-mail) en un refus nommé, au lieu du `DuplicateResourceError`
  générique d'aujourd'hui.

**D5 — « Passer le relais ».** Sur une fiche présente : saisir le prénom, le nom
et la fonction du successeur. **Dans une transaction** : la fiche actuelle part
(D2) **d'abord** — l'index partiel n'est pas différable, le départ doit être
écrit avant l'insertion —, puis la fiche du successeur est créée **à la même
adresse**, avec le **même rôle** et les **mêmes dérogations** — recopiées,
auteur = celui qui passe le relais, date du jour —, et les faits s'écrivent. **Après le commit**, dans cet
ordre : retrait de l'identité du partant (D3), **puis** invitation du successeur.
Si le retrait échoue, l'invitation n'est pas tentée (elle échouerait, D4) et
l'écran propose de relancer les deux.

La **racine** ne part que par une passation, et son titulaire peut la passer
lui-même (c'est le cas `dev@`). Il y a ainsi toujours une fiche **présente** à
`BOOTSTRAP_ADMIN_EMAIL` : `ensureBootstrapAdmin` et `isRoot` ne regardent que
les fiches présentes, et ne recréent pas de racine dans l'intervalle — la
transaction ne laisse pas d'intervalle.

**Mais une passation faite par le partant lui-même le fait sortir au commit.**
Si ensuite le retrait échoue ou si l'e-mail d'invitation ne part pas
(`mailSent: false`), il faut un admin présent pour relancer — et le successeur
ne l'est pas encore. D'où la règle : **passer le relais de sa propre fiche
exige un autre admin `active`**. Sans lui, le geste est refusé (« invitez
d'abord un second admin : si l'invitation ne partait pas, personne ne pourrait
la relancer »). Passer le relais d'un autre n'a pas cette condition : l'auteur
reste présent.

**D6 — « Faire revenir ».** Refusé si une fiche présente porte l'adresse (le
message la nomme), **ou si une identité de `lfc-staff` porte encore
l'adresse** (un successeur parti dont le retrait a échoué, une orpheline) : le
message dit de relancer ce retrait d'abord. Refusé aussi si le `sub` de la fiche
n'existe plus chez Auth0 (`404`) : un retour sur une identité morte n'a pas de
sens, et lui en donner une neuve changerait le `sub` de la personne — cas rare,
traité à la main, écrit dans le runbook. Sinon : la fiche redevient `active` ;
son identité est débloquée et reprend l'adresse ; un lien de mot de passe part.
Le `sub` est le sien — il n'a servi à personne d'autre.

**D7 — L'adresse n'est unique que parmi les fiches présentes.** Un index unique
partiel `WHERE status <> 'departed'` remplace `staff_users_email_key`, déclaré
dans sa migration et décrit en commentaire dans `staff.prisma`, selon la
convention des cinq précédents. Le schéma perd son `@unique` sur `email` : le
client généré perd `findUnique({ email })`, et **tout** le code qui cherche une
fiche par adresse passe à `findFirst` sur les fiches présentes — dans le même
déploiement (il ne compilerait pas autrement) : **trois sites dans `src`**
(résolveur, et deux dans le dépôt de fiches), **quatorze dans `test/`** (dont
quatre écritures `update`/`delete` par e-mail ; un `deleteMany` compile sans
l'unicité). Aucun dans `src/dev/` ni les seeds.

**D8 — La suppression disparaît.** « Supprimer » devient « Retirer de
l'équipe » ; `DELETE /admin/staff-users/:id` répond `409` en nommant le nouveau
geste, puis la route est retirée.

**D10 — `changeEmail` cesse d'avaler le conflit.** Un `409` devient un refus
nommé (« cette adresse est déjà utilisée par une autre identité de
connexion »). C'est un **bug d'aujourd'hui**, indépendant du départ : il se
corrige en tête, dans son propre commit, avec son test de non-régression.

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

0. **D10** seul : `changeEmail` refuse le conflit.
1. **Le contrat et l'écran connaissent `departed`** — libellé, variante, filtre,
   JSDoc corrigé — **avant** que l'API ne puisse le renvoyer. Rien d'autre.
2. **Étendre** : la valeur `departed` (seule dans sa migration), les colonnes
   `departed_at`, `departed_by_staff_id`, `identity_retired_at`. Le résolveur,
   l'invitation, l'édition, `PATCH status`, les compteurs d'admins savent
   refuser ou exclure `departed` ; `markInvited` et `recordEntry` deviennent
   conditionnels.
3. **Le geste, avec son index** : l'index partiel remplace l'unicité globale
   (D7) **dans le même déploiement** que « Retirer de l'équipe », « Passer le
   relais », « Faire revenir », le retrait Auth0, le `409` sur `DELETE`, et le
   runbook (D9).
4. **Retirer** la route `DELETE`.

Chaque étape laisse la production cohérente si la suivante tarde : 1 n'est que
de l'affichage ; 2 n'écrit jamais `departed` ; 3 livre le geste et ce qui le
rend possible ensemble.

**Deux allers simples, à savoir avant de commencer :**

- `ALTER TYPE … ADD VALUE 'departed'` (étape 2) ne se défait pas en Postgres.
  Un retour arrière laisse la valeur dans l'enum, inutilisée — sans danger ;
- **dès la première passation**, deux fiches partagent une adresse :
  l'unicité globale de l'e-mail ne peut plus être rétablie. L'étape 3 se défait
  tant que personne n'a passé de relais, plus après.

## 5. Tests

- **Politique** : départ refusé pour la racine hors passation, pour le dernier
  admin, pour soi-même hors passation ; retour refusé si l'adresse est reprise ;
  `PATCH status: active` et l'invitation refusés sur une fiche partie.
- **Résolveur** : le jeton d'une fiche partie est refusé **même avec une adresse
  vérifiée égale à celle d'une fiche présente non liée** — le cas qui cassait la
  première version ; **un jeton inconnu** (identité non retirée, jamais inscrite)
  à l'adresse d'une fiche partie **n'est pas relié** à la fiche du successeur —
  le cas qui cassait la deuxième.
- **Écritures conditionnées** : `markInvited` et `recordEntry` sur une fiche
  partie n'écrivent rien et refusent (e2e, départ intercalé entre la lecture et
  l'écriture).
- **Racine** : passer le relais de sa propre fiche est refusé sans autre admin
  `active` ; un admin `pending` ne compte pas.
- **Passation** (e2e, double d'Auth0) : le successeur est créé à la même
  adresse, avec le même rôle et les mêmes dérogations ; le partant est parti et
  **garde son `sub`** ; le double enregistre le blocage et l'adresse morte ; le
  successeur reçoit un `sub` neuf ; **l'ancien jeton ne rend rien**, avant comme
  après l'entrée du successeur ; le journal nomme chacun pour ses faits.
- **Retrait par l'adresse** : une identité orpheline à l'adresse, que la fiche
  ne nomme pas, est bloquée aussi.
- **Retrait échoué** : le départ est écrit ; l'invitation du successeur est
  refusée (adresse encore prise, pas d'adoption) avec le message de D4 ; la
  relance réussit.
- **`changeEmail`** : un `409` d'Auth0 est un refus, pas un succès (D10).
- **Index** : deux fiches présentes à la même adresse sont refusées par la base ;
  une partie et une présente sont acceptées.

## 6. Ce que ce plan ne fait pas

- **Convertir l'auteur du journal** ou les autres colonnes d'auteur : c'est fait
  à part, et livré le 2026-09-18 —
  [`../journalisation/architecture-journalisation.md`](../journalisation/architecture-journalisation.md) §12. Tout auteur
  est l'id d'une fiche ; le D3 de ce plan garde sa seule raison de sécurité
  (un jeton d'accès ne se révoque pas).
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
- Qu'Auth0 accepte une adresse en `.invalid`, et que `users-by-email` reflète
  un PATCH d'adresse immédiatement (le « plus rien à l'adresse » de D3 en
  dépend).
- Le code rendu par un PATCH d'adresse en conflit (D10 suppose `409`).
- **L'inventaire de production, qui dit la gravité réelle du trou que D3
  ferme** : combien de fiches portent un `sub` Google, `dev|` ou mort, et
  combien d'identités orphelines vivent sur `lfc-staff`. `describeEmail`
  permet de le faire fiche par fiche. À faire avant l'étape 3.

## 7 bis. Ce qui reste connu et assumé

- **Le contournement de développement** (`admin-auth.guard.ts:40-50`) relie
  `dev-staff` à la fiche racine. Après une passation locale de la racine, le
  poste local trouve la fiche partie par son `sub` et se ferme : il faut
  réinitialiser la base locale. Sans effet en production.

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

**Seconde contradiction, 2026-09-18** — chaque affirmation de code revérifiée à
la réception :

| Objection                                                                                                                        | Ce qui a changé                                                                         |
| -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| BLOQUANT — l'identité à l'adresse n'est pas toujours `fiche.auth0Id` (Google, `sub` mort, orphelines) : le successeur l'adoptait | D3 : retrait **par l'adresse**, `provision` **sans adoption** pour un successeur        |
| BLOQUANT — le partant, identité non retirée, se reliait à la fiche du successeur par le rapprochement e-mail                     | D3 : rapprochement fermé à une adresse qui a eu un titulaire                            |
| BLOQUANT — `markInvited` et `recordEntry` écrivent sans condition et font revenir une fiche partie                               | D2 : écritures conditionnées en base                                                    |
| SÉRIEUX — l'édition d'une fiche partie réoccupe l'adresse chez Auth0 ; `changeEmail` avale le `409`                              | D2 : fiche partie en lecture seule ; D10 : bug corrigé en tête                          |
| SÉRIEUX — « Faire revenir » ignore une identité tierce à l'adresse et un `sub` mort                                              | D6 : deux refus nommés                                                                  |
| SÉRIEUX — le message de D4 n'avait pas de mécanisme                                                                              | D4 : refus avant `markInvited` ; `P2002` traduit selon la contrainte                    |
| SÉRIEUX — la passation de la racine par son titulaire peut fermer le back-office ; un `pending` compte comme admin               | D5 : autre admin `active` exigé ; D2 : seuls les `active` comptent                      |
| SÉRIEUX — deux allers simples non signalés                                                                                       | §4                                                                                      |
| MINEUR — comptes de D7, adresse morte en `.eu`, cache, ordre dans la transaction, contournement dev                              | D7 corrigé ; `.invalid` par appel dédié ; `forgetAll` ; départ avant insertion ; §7 bis |
| NON VÉRIFIÉ — inventaire de production, comportements Auth0                                                                      | §7, avant l'étape 3                                                                     |
