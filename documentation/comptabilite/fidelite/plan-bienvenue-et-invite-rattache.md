# Plan — le bonus de bienvenue, et l'invité qui devient un compte

> **Statut : plan ; lots B, A et C bâtis le 2026-10-11 (§7), D reste.** Écrit le 2026-10-11. Touche l'**argent**
> (des points qui valent des bons) et une **frontière de sécurité** (prendre
> possession d'une fiche par son adresse). Contredit par `vitruve` le même jour
> (3 BLOQUANTS, 9 SÉRIEUX) : le sort de chaque objection est au §7, et les
> trois arbitrages qu'elles demandaient ont été rendus par Hugo (R3 à R5).

## 0. La demande

> « les points de cette commande, vérifie le rattachement, bonus de bienvenue à
> mettre dans comptabilité fidélité optionnel » — Hugo, 2026-10-11.

Deux arbitrages pris le même jour, sur question :

- **R1 — l'invité qui crée son compte reprend ses commandes, AVEC leurs
  points** (« Oui, avec les points »).
- **R2 — le bonus de bienvenue est crédité à l'inscription** (« À
  l'inscription »), en connaissance du prix : des adresses jetables en
  accumulent.
- **R3 — les commandes d'un tiers suivent, et c'est accepté.** Toute commande
  anonyme qui porte une adresse est rangée sur la même fiche invité (D8),
  quel que soit son auteur ; le titulaire de la boîte en hérite au
  rattachement, prénom, téléphone et adresses compris. Accepté par Hugo : la
  confirmation et le QR de chacune sont déjà partis à cette boîte.
- **R4 — aucun point sur une commande passée avant l'ouverture du programme
  au public.** Une fiche ancienne ne se crédite pas d'un coup, au barème du
  jour, d'achats faits programme fermé. La règle vaut pour TOUT crédit, pas
  seulement après un rattachement : c'est le même trou chez un compte.
- **R5 — les cas sans retour sont acceptés pour l'instant** : inscription par
  mot de passe (adresse non prouvée) à côté d'une fiche invité, et commande
  anonyme passée plus tard avec l'adresse d'un compte. Ils restent sur leur
  fiche ; un geste staff « fusionner cette fiche invité dans ce compte » est
  noté au §6, hors de ce plan.

## 1. Ce qui existe (ouvert et vérifié le 2026-10-11)

| Fait                                                                                                                                                                  | Où                                                                                                    |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Un invité est un `User` **sans `auth0_sub`** ; D8 le retrouve par adresse au lieu d'en recréer un                                                                     | `orders/infrastructure/prisma-guest-buyer.registrar.ts`                                               |
| Un `sub` inconnu est **provisionné en compte neuf** ; seule exception : la première entrée d'un client invité par le staff (`invited`, `auth0\|…`)                    | `account/infrastructure/customer-principal.resolver.ts` (`provision`), `unknown-subject-admission.ts` |
| Le jeton dit si l'adresse est prouvée : `tokenProvesAddress` = `emailVerified === true` ∧ même adresse normalisée                                                     | `customer-principal.resolver.ts`                                                                      |
| Un invité ne gagne **rien** (`guest_buyer`) ; le gain se décide sur `buyerHasAccount`, lu **au moment du crédit** comme `placedBy.auth0Sub !== null`                  | `loyalty/domain/services/order-earning.ts`, `orders/infrastructure/prisma-completed-order.reader.ts`  |
| Le rattrapage de nuit parcourt **toutes** les commandes définitives sans borne de date, et l'index unique `(order_id) WHERE kind = 'earned'` empêche un double crédit | `credit-pending-order-points.handler.ts`, `points-de-fidelite.md` §4                                  |
| `loyalty_ledger_entries.kind` est un **enum Postgres** (`earned`, `converted`, `adjusted`)                                                                            | `prisma/schema/public/loyalty.prisma`                                                                 |
| `loyalty_settings` : une ligne, son absence = programme fermé                                                                                                         | `points-de-fidelite.md` §3                                                                            |
| Le provisionnement publie `UserRegisteredEvent` quand **cet** appel a créé la personne                                                                                | `customer-principal.resolver.ts`                                                                      |

## 2. R1 — l'invité devient le compte

### La règle

À la première entrée d'un `sub` inconnu, **avant** de créer un compte neuf :

1. aucun compte connectable ne porte l'adresse (sinon : le refus d'aujourd'hui,
   inchangé) ;
2. **le jeton prouve l'adresse** (`tokenProvesAddress`) — c'est toute la
   sécurité du geste : le code e-mail, ou un fournisseur qui atteste l'adresse,
   prouve qu'on détient la boîte, donc les commandes passées sous elle ;
3. il existe **exactement une** fiche invité (`auth0_sub IS NULL`) à cette
   adresse, normalisée.

Alors on **pose le `sub` sur cette fiche** au lieu d'en créer une, par une
écriture conditionnelle (`WHERE id = … AND auth0_sub IS NULL`) : deux premières
requêtes concurrentes ne peuvent pas la prendre deux fois, et la perdante
relit, comme le cas `lost` d'aujourd'hui.

Une inscription **par mot de passe** (`auth0|…`, adresse non encore prouvée)
**ne rattache pas** : elle crée un compte neuf, comme aujourd'hui. Le
rattachement n'aura lieu à aucune entrée ultérieure — la fiche invité reste à
part. C'est volontaire : rattacher sur une adresse non prouvée donnerait les
commandes d'un autre à qui tape son adresse (la voie §3.2 du plan sans compte).

Plusieurs fiches invité à la même adresse (créées avant D8, le 2026-09-17) :
**aucun** rattachement, compte neuf. À mesurer en production avant de bâtir ;
si le nombre n'est pas nul, un lot de fusion se conçoit à part.

### Les points suivent tout seuls

Rien à écrire côté fidélité : dès que la fiche porte un `sub`,
`buyerHasAccount` devient vrai pour ses commandes, et **le rattrapage de nuit
crédite** celles qui sont définitives et n'ont pas encore leur ligne `earned`.
L'index unique interdit le double crédit.

⚠️ À trancher en bâtissant : créditer **tout de suite** (lancer le rattrapage
du titulaire au rattachement) ou attendre la nuit. Le premier est plus juste à
l'écran (« vos points sont là »), le second ne demande rien. Proposé : tout de
suite, par le même service que le rattrapage, borné à ce titulaire.

### Ce que l'écran dit

La confirmation d'un invité dit aujourd'hui « Avec un compte, cette commande
vous **aurait** rapporté N points » (bâti le 2026-10-11). Après R1, la phrase
devient vraie au futur : « Créez votre compte avec cette adresse : cette
commande vous rapportera N points une fois retirée. » Elle ne doit le dire que
si la création se fera **par code** (la porte de la confirmation y mène déjà :
`continueWithEmailCode`).

## 3. R2 — le bonus de bienvenue

### Le réglage

`loyalty_settings.welcome_bonus_points INTEGER NULL` — `NULL` = pas de bonus
(défaut), sinon un entier > 0 (`CHECK`). Réglé dans **Comptabilité ›
Fidélité › Réglage**, champ facultatif « Points offerts à la création d'un
compte ». Il n'a d'effet que si le programme est ouvert au public.

### L'écriture

Nouvelle valeur d'enum **`welcome`** : signe > 0, porte `user_id`, **unique
par `user_id`** (index partiel `WHERE kind = 'welcome'`). Une personne ne la
reçoit qu'une fois, quel que soit le nombre de passages — la base refuse le
second.

**Quand** : au **provisionnement** d'un compte public — création neuve **ou**
rattachement d'une fiche invité (R1 : devenir un compte, c'est s'inscrire). Le
montant est celui du réglage **à cet instant** ; changer le réglage ensuite ne
touche pas les bonus déjà crédités. Activer le bonus **ne crédite pas** les
comptes existants.

**Par où** : `account` publie (`UserRegisteredEvent`, et un fait pour le
rattachement) ; `loyalty` s'abonne. Les deux sont dans `b2b` : abonné en
mémoire admis par `lint:durable-cross-block`, mais un redémarrage au mauvais
moment perd le bonus. Le rattrapage de nuit gagne donc une passe : les comptes
publics **créés depuis l'activation** du bonus (`welcome_bonus_enabled_at`,
posé quand on passe de `NULL` à un nombre) qui n'ont pas leur ligne `welcome`.

**Qui** : la personne, titulaire `user`. Un compte pro (membre d'une société)
reçoit-il le bonus ? Le titulaire pro est la **société**, et la clientèle pro
est fermée (§7 de l'état) : **non**, tant que le pro est fermé. Une personne
qui crée d'abord un compte particulier puis rejoint une société garde son
bonus de particulier.

### Le prix assumé (R2)

Une adresse jetable vaut un bonus. La borne est le montant du réglage, que
l'admin pose en le sachant ; l'écran le rappelle sous le champ. Les bons
issus d'une conversion restent soumis au palier minimal : un bonus inférieur
à un palier ne se convertit pas seul.

### La TVA

Un point n'est pas une recette ; le bon issu d'une conversion suit la règle
encore ouverte du §8 de l'état (« La TVA du bon »). Le bonus n'y change rien :
c'est un point comme un autre au moment de convertir. **À confirmer** avec la
question au cabinet (`question-cabinet-fidelite-et-cartes-cadeaux.md`) : un
point **offert** sans achat est-il traité comme un point gagné ?

## 4. La migration (une, additive)

- `ALTER TYPE "LoyaltyEntryKind" ADD VALUE 'welcome'` — ⚠️ hors transaction
  sous Postgres < 12, et une valeur ajoutée ne s'utilise pas dans la même
  transaction : la migration ne fait **que** l'ajout de valeur, et l'index
  partiel vit dans une seconde migration.
- `loyalty_settings.welcome_bonus_points INTEGER NULL CHECK (> 0)`,
  `welcome_bonus_enabled_at TIMESTAMPTZ NULL`.
- Index unique partiel `(user_id) WHERE kind = 'welcome'` ; adapter le `CHECK`
  de forme des lignes (`welcome` : `user_id` non nul, `company_id` nul,
  `points > 0`, ni commande, ni bon, ni auteur staff).
- Aucun droit accordé, aucune donnée réécrite.

## 5. Les lots

| Lot | Contenu                                                                  | Dépend de |
| --- | ------------------------------------------------------------------------ | --------- |
| A   | R1 : rattachement par adresse prouvée, crédit immédiat, e2e de la course | —         |
| B   | Migration + domaine + réglage du bonus (API et écran)                    | —         |
| C   | Crédit du bonus au provisionnement et au rattachement, passe de nuit     | A, B      |
| D   | La confirmation invité au futur, et la mention du bonus                  | A, C      |

## 6. Questions ouvertes

1. Créditer les points d'un invité rattaché tout de suite, ou la nuit (§2) ?
2. Le nombre de fiches invité en double en production (§2) — mesure à faire.
3. Le bonus et la TVA d'un bon (§3) — question au cabinet.

## 7. La contradiction de `vitruve` (2026-10-11) et ce qu'elle a changé

Ces corrections **l'emportent** sur les sections 2 à 5 quand elles divergent.

| Objection                                                                                                               | Sort                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **B1** — prouver la boîte ne prouve pas les commandes (D8 range celles d'un tiers)                                      | **Assumé** par Hugo (R3).                                                                                                                                                                                                                                                                                                                                                                                                        |
| **B2** — la passe de nuit du bonus ne voit pas un rattaché (son `created_at` est celui de l'invité)                     | **Corrigé** : `users.became_account_at TIMESTAMPTZ NULL`, posé à CHAQUE passage d'une fiche à un compte (création, R1, ouverture d'accès staff). La passe lit cette colonne, plus `created_at`.                                                                                                                                                                                                                                  |
| **B3** — « pas de bonus au pro » sans mécanisme : `users` n'a pas de clientèle                                          | **Corrigé** : le bonus va à TOUTE personne qui devient un compte, titulaire `user`. Il ne sert qu'à ses commandes de particulier — une commande pro crédite et débite la société. Plus de distinction pro/public à l'inscription.                                                                                                                                                                                                |
| **S1** — l'ouverture d'accès staff (`grant-account-access.service.ts`, `rebindSubject`) fait déjà d'un invité un compte | **Intégré** : c'est un troisième chemin « devient un compte » ; il pose `became_account_at` et reçoit le bonus. Une fiche passée `auth0\|…` `active` par ce chemin est refusée à une entrée par code (`AccountExistsUnderAnotherSignInError`) : comportement existant, inchangé, noté.                                                                                                                                           |
| **S2** — crédit rétroactif au barème du jour                                                                            | **Tranché** (R4) : `loyalty_settings.public_opened_at TIMESTAMPTZ NULL`, posé quand `open_to_public` passe à vrai pour la première fois et jamais effacé ; `earningFor` refuse (`before_program`) une commande placée avant. Les commandes déjà créditées ne sont pas touchées.                                                                                                                                                  |
| **S3** — le contrat `myLoyaltyEntryKindSchema` et l'entité casseraient sur `welcome`                                    | **Intégré au lot B** : contrat, `LoyaltyEntryKind`, mappeur, relevé client (libellé « Bienvenue »), écran admin des soldes.                                                                                                                                                                                                                                                                                                      |
| **S4** — commande anonyme en vol pendant le rattachement → fiche orpheline                                              | **Assumé** (R5).                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **S5** — inscription par mot de passe : irréversible                                                                    | **Assumé** (R5) ; fusion staff au §6.                                                                                                                                                                                                                                                                                                                                                                                            |
| **S6** — la preuve dépend de la connexion                                                                               | **Corrigé** : R1 et le bonus n'acceptent que les connexions dont la preuve est établie — code e-mail et Google. Facebook et mot de passe : ni rattachement, ni preuve. La liste est une constante nommée, éprouvée.                                                                                                                                                                                                              |
| **S7** — migration contradictoire                                                                                       | **Corrigé** : DEUX migrations. 1) `ALTER TYPE … ADD VALUE 'welcome'` seul. 2) le reste : colonnes, index partiel `(user_id) WHERE kind = 'welcome'`, et le `CHECK` de forme remplacé (`DROP` + `ADD`, même transaction) avec, pour `welcome`, `user_id` non nul et `points > 0` — pas plus strict que les autres sortes.                                                                                                         |
| **S8** — transitions de `welcome_bonus_enabled_at`                                                                      | **Corrigé** : le réglage porte `welcome_bonus_points` seul ; il n'y a PAS de rattrapage rétroactif. La passe de nuit ne rattrape que les comptes dont `became_account_at` est postérieur à `welcome_bonus_since`, posé chaque fois que le bonus passe de nul à un nombre ; un compte créé bonus éteint n'en reçoit pas plus tard. Programme fermé ou fermé au public : rien n'est crédité, rien n'est rattrapé à la réouverture. |
| **S9** — bonus sans adresse prouvée                                                                                     | **Corrigé** : le bonus exige la preuve de l'adresse, comme R1 (même liste de connexions).                                                                                                                                                                                                                                                                                                                                        |
| Mineurs                                                                                                                 | Chemin du rattrapage : `loyalty/application/commands/credit-pending-order-points.handler.ts`. Crédit **immédiat** des commandes d'un rattaché : décidé (borné au titulaire). Le rattachement publie `GuestAccountClaimedEvent` ; la croissance le compte comme une inscription. R1 refuse une adresse vide.                                                                                                                      |

### Les lots, révisés

| Lot       | Contenu                                                                                                                                                                                                                          |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~**B**~~ | ~~Les deux migrations ; `public_opened_at` et R4 dans `earningFor` ; le réglage du bonus (API, écran) ; `welcome` dans contrat, domaine, relevés.~~ — **bâti le 2026-10-11** (non commité à l'écriture).                         |
| ~~**A**~~ | ~~`became_account_at` posé par les trois chemins ; R1 (connexions admises, écriture conditionnelle, course, adresse vide) ; crédit immédiat ; `GuestAccountClaimedEvent`.~~ — **bâti le 2026-10-11** (non commité à l'écriture). |
| ~~**C**~~ | ~~Crédit du bonus aux trois chemins, passe de nuit, unicité.~~ — **bâti le 2026-10-11** (non commité à l'écriture) ; l'ouverture d'accès staff n'émet aucun fait, son bonus vient de la nuit une fois l'adresse prouvée.         |
| **D**     | La confirmation invité au futur, avec le bonus.                                                                                                                                                                                  |
