# Commander sans compte obligatoire

**Statut** : ✅ **bâti le 2026-09-17, et fermé** — les trois lots existent, la
route publique n'est pas joignable. **L'état à jour est au [§12](#12-létat--ce-qui-est-fait-ce-qui-reste)** :
ce qui est fait, ce qui reste, et ce qu'ouvrir demandera.
**Portée** : la **passation** d'un client public. Ni l'inscription, ni le tarif
public, ni l'audience — ils ont leurs documents.

⚠️ **Les sections 1 à 11 sont l'archive de conception.** Elles disent POURQUOI
cette voie plutôt qu'une autre, et ce qui a été vérifié pour le décider. Elles
ne décrivent plus le travail restant — on n'y revient que pour contester une
décision. Écrites le 2026-09-17, **contredites par `vitruve` le même jour**
(cinq BLOQUANTS, six SÉRIEUX), puis refondues ; le sort de chaque objection est
au §8.

> 🔴 **Ce plan ne s'ouvre pas quand il est bâti.** La route peut être écrite et
> éprouvée ; sa mise en service dépend d'un arbitrage de prix qui n'est pas
> technique. Voir §6 — c'est la seule objection de la contradiction que la
> refonte **ne fait pas disparaître**, mais sa nature a changé le 2026-09-17.

## 0. La demande

> « dans la page nouvelle-commande-panier, si client non connecté, il faut soit
> entrer prénom mail téléphone pour un client public jamais enregistré, soit
> proposer la connexion, tant qu'on a pas ces infos on ne peut pas faire régler
> ma commande » — Hugo, 2026-09-17.
>
> « **il faut qu'on puisse commander sans compte obligatoire** » — après un
> premier exposé qui présentait l'inscription en trois champs comme la seule voie
> réalisable. Elle ne l'était pas ; l'exposé était incomplet.
>
> « je pense qu'il nous faut donc **une route complète** pour répondre à ce cas
> de figure et **ne pas polluer notre travail qui marchait bien pour les porteurs
> d'identité** » — la décision qui a refondu ce plan.

## 1. Ce qui existe (ouvert et vérifié le 2026-09-17)

### 1.1 Les verrous

| Fait                                                                  | Où                                                          |
| --------------------------------------------------------------------- | ----------------------------------------------------------- |
| `placedByUserId String` **non nullable**, FK vers `User`              | `prisma/schema/public/orders.prisma`                        |
| `auth0Sub String @unique` **non nullable**                            | `prisma/schema/public/account.prisma`                       |
| `email` **sans aucune unicité** — ni `@unique`, ni `@@unique`         | `prisma/schema/public/account.prisma`                       |
| `OrderIdempotency.userId` non nullable, FK, `@@unique([userId, key])` | `prisma/schema/public/orders.prisma`                        |
| `MemberToCreate.invitedBy: string` **obligatoire**                    | `b2b/account/domain/ports/company-member.repository.ts`     |
| Le compte naît **du JWT**                                             | `b2b/account/infrastructure/customer-principal.resolver.ts` |
| `POST /orders` : `@CurrentUser()` **et** `@RequiresShop("order")`     | `b2b/orders/http/orders.controller.ts`                      |

### 1.2 Les appuis

| Fait                                                                          | Où                                                                                  | Ce qu'il permet                                                                   |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `companyId String?`                                                           | `prisma/schema/public/orders.prisma`                                                | Une commande sans société — déjà le cas                                           |
| `PersonName.optional()`                                                       | `b2b/account/domain/value-objects/person-name.ts`                                   | Une personne sans nom : le domaine sait déjà                                      |
| `CreateIntentParams { amountCents, currency, companyId \| null }`             | `b2b/payments/domain/payment-gateway.ts`                                            | Payer par carte sans compte                                                       |
| `markPaid` filtre sur l'intention, **ne touche jamais `User`**                | `b2b/orders/infrastructure/prisma-order.repository.ts`                              | Le règlement d'une commande sans porteur fonctionne                               |
| `ThrottlerGuard` global, `@Throttle` par route, `getTracker` = **IP cliente** | `platform/security/security.module.ts`                                              | Borner une route publique sans rien inventer                                      |
| `/me` **inatteignable sans jeton** (aucun `@Public()`)                        | `b2b/account/http/me.controller.ts`                                                 | `ProfileView.subject` n'est jamais servi à un invité                              |
| Le mailer prend une **adresse libre** — `readonly to: string`                 | `packages/mailer/src/types.ts:118`                                                  | L'obstacle n'a jamais été le mailer, mais le **port** qui cherche le destinataire |
| `handoverToken` est émis pour **toute** commande, sans condition              | `b2b/orders/infrastructure/prisma-order.repository.ts:53` (`issuesHandoverToken()`) | Le secret de retrait existe déjà, inutile d'en inventer un second                 |

**La précision de débit** compte : `@Throttle({ default: { limit: 60, ttl: 60_000 } })`
sur `b2b/pickup-addresses/http/pickup-addresses.controller.ts:28` est le
précédent du dépôt pour une route publique de **lecture**. Une route qui
**écrit** doit être bien plus serrée — d'où les 5/60 s du §5, qui restent à
éprouver (§10).

### 1.3 Ce qui n'existe pas

⚠️ **Aucune route publique du dépôt n'écrit au nom d'un client.** `POST /shop/quote`
est `@Public()` mais ne fait que **lire un prix**. Les routes publiques qui
écrivent — `payments-webhook`, `resend-webhook`, `media-sweep` — sont toutes
machine-à-machine, protégées par **signature** ou par un garde dédié. La route de
ce plan n'aurait ni l'une ni l'autre : c'est la première de son espèce, et c'est
ce qui justifie sa contradiction.

## 2. La décision

**Une surface complète et séparée**, et un porteur **sans identité de connexion**.

- Sa route, son handler, son contrat, sa table d'idempotence. Le chemin
  authentifié n'est pas touché : `PlaceOrderHandler`, `placeOrderPayloadSchema`
  et `OrderIdempotency` restent exactement ce qu'ils sont.
- La commande reste un **`Order`**, sans une colonne de plus. C'est non
  négociable : la file du comptoir, le prévisionnel du fournil et le colisage
  lisent tous `Order`, et une commande publique qui ne serait pas un `Order`
  obligerait à dupliquer le fournil entier.
- Le porteur est un **`User` sans `auth0Sub`** : une personne connue par son
  adresse, jamais connectable. `auth0Sub` devient nullable.

## 3. Pourquoi pas les deux autres voies

> _Archive._ Les deux voies écartées et leur chiffrage. À rouvrir seulement si
> quelqu'un propose de revenir dessus — la §3.2 en particulier, qui est une
> raison de **sécurité** et non de coût.

### 3.1 Porteur de commande nullable — écartée, chiffrée

`placedByUserId` nullable touche **29 fichiers** de `src/` hors tests : les
lecteurs de commande, la file de retrait, le prévisionnel, **un contrat de canal
publié** (`handover/channels/commerce/handover-subject.reader.ts`) et **trois
événements de domaine** (`order-placed`, `order-ready`, `order-handed-over`).
S'y ajoutent **trois abonnés de croissance** qui écrivent
`subjectType: "user", subjectId: event.placedByUserId` — `ActivityEvent.subjectId`
est `String` **non nullable** (`prisma/schema/growth.prisma:36`) :

- `b2b/growth/application/handlers/on-order-placed.handler.ts:48`
- `b2b/growth/application/handlers/on-order-ready.handler.ts:36`
- `b2b/growth/application/handlers/on-order-handed-over.handler.ts:60`

et `b2b/growth/infrastructure/prisma-order-metrics.reader.ts:55`, qui construit
`user:${order.placedByUserId}` : toutes les commandes publiques s'effondreraient
sur **un seul acheteur fictif** dans le calcul de concentration. Un chiffre faux,
pas une erreur de compilation — donc rien ne l'aurait signalé.

Les sites exacts qui déréférencent sans garde, pour mémoire si la voie devait
être rouverte : `prisma-order.reader.ts` (interfaces l. 87-90, 456, 496, 523 ;
`customerLabelOf` l. 539-540 ; quatre `select` l. 130, 213, 263, 327),
`handover-order.query.ts` (l. 47-52, 63-64, 153, 170),
`prisma-day-orders.reader.ts` (l. 65, 98-105),
`handover/channels/commerce/handover-subject.reader.ts:22`,
`order-placed.event.ts:13`, `order-ready.event.ts:14`,
`order-handed-over.event.ts:17`, `domain/services/order-access.ts:40`.

C'est exactement la pollution que la décision du §0 refuse.

### 3.2 Provisionner une identité Auth0 au vol — écartée, de sécurité

`CustomerIdentityPort.provision()` est **idempotent sur l'e-mail** : « si une
identité existe déjà pour cette adresse, elle est réutilisée ». Une route
publique qui l'appelle laisserait n'importe qui commander **sous le compte d'un
autre** en tapant son adresse. Le dépôt a déjà refusé ce raisonnement une fois —
`AccountEmailUnverifiedError` : « actif sans preuve = inscription libre :
n'importe qui a pu taper cette adresse ».

## 4. Ce que la voie retenue coûte, exactement

`auth0Sub` nullable est lu dans **6 fichiers**, dont le semis de dev — donc
**5 en production**, tous dans `b2b/account/infrastructure/`. Une couche, un
dossier, aucun contrat de canal, aucun événement de domaine.

| Site                                  | Ce qu'il en fait               | Ce qu'il devient                                            |
| ------------------------------------- | ------------------------------ | ----------------------------------------------------------- |
| `prisma-company-member.repository.ts` | `subject: user.auth0Sub`       | `string \| null` dans `KnownAccount`                        |
| `prisma-account.reader.ts`            | `subject: row.auth0Sub`        | Repli `?? ''` — jamais servi à un invité                    |
| `prisma-pending-access.reader.ts`     | `user?.auth0Sub ?? null`       | **Rien** : absorbe déjà le nul                              |
| `prisma-impersonation-subjects.ts`    | Recherche par sujet            | **Rien** : un sujet non nul ne matche jamais un invité      |
| `customer-principal.resolver.ts`      | `where: { auth0Sub: subject }` | **Rien**, et c'est souhaitable : un invité ne se résout pas |

**Trois points à traiter, et ils sont le vrai travail :**

1. 🔴 **La récupération de compte.** `grant-account-access` appelle
   `issuePasswordLink(known.subject)` : face à un invité sans sujet, il doit
   **provisionner** l'identité plutôt que d'émettre un lien pour un sujet nul.
   C'est le chemin « le commercial ouvre un accès à quelqu'un qui a déjà
   commandé en public » — il existera.
2. **Les doublons d'adresse.** `email` n'a aucune unicité : un visiteur qui tape
   l'adresse d'un autre crée une seconde ligne, sans collision de base. À
   assumer (deux lignes, deux histoires) ou à réconcilier (D2, §7).
3. **Distinguer les invités.** `UserStatus` vaut `invited | active | disabled`,
   et `invited` désigne déjà « provisionné par nous, jamais connecté ». Un
   `User` sans `auth0Sub` n'est pas la même chose : il n'a **rien** à quoi se
   connecter. Le distinguer par l'absence de sujet, ou par une valeur de plus
   (D1, §7).

## 5. La surface

`POST /shop/orders`, `@Public()`, `@Throttle({ default: { limit: 5, ttl: 60_000 } })`.

- **Son contrat**, pas celui de `POST /orders` : les lignes, l'acheminement,
  l'identité publique (prénom, e-mail, téléphone). Pas de `settlement` — c'est
  la carte, toujours. Pas de société.
- **Son idempotence.** La table existante est murée par `userId` avec FK et
  `@@unique([userId, key])` ; on n'y touche pas. La surface publique a la
  sienne, murée par la **commande créée**, jamais par un couple devinable.
  🔴 Le couple (clé, e-mail) est écarté : `PrismaOrderIdempotencyStore.decideOnExisting`
  rend `{kind:"replayed", orderId}` dès que l'empreinte concorde, et
  `PlaceOrderHandler.replay()` re-demande alors le `clientSecret` à
  `retrieveIntent` — détenir le couple rendrait donc **une commande et un secret
  de paiement vivant**. La clé est choisie par le client
  (`packages/contracts/src/order.ts:366`, un UUID) et l'adresse se tape : ce
  serait la voie 3.2 déguisée.
- **La relecture** passe par le `User` invité, qui existe : les courriels, le QR
  et la fiche de commande fonctionnent **sans une ligne de changement**.
  `OrderRecipientReader.findById(userId)`
  (`b2b/orders/infrastructure/prisma-order-recipient.reader.ts:16`) lit
  `prisma.user.findUnique` et trouve son adresse ; les deux envois —
  `send-order-placed-mail.handler.ts` et
  `application/services/order-ready-mail.service.ts` — sortaient **en silence**
  sans destinataire. C'est le gain décisif de cette voie sur la précédente : sans
  `User`, le client public n'aurait eu **ni confirmation, ni QR**.
- ⚠️ Le QR reste une **surface staff** : `HandoverController` est
  `@AdminSurface("b2b_orders")` (`handover/http/handover.controller.ts:63-64`) et
  ses routes prennent `AuthenticatedStaffRequest`. Le client l'**affiche**, le
  comptoir le **scanne**.

## 6. 🔴 La précondition : le tarif public

**Ce plan peut être bâti ; il ne peut pas être ouvert.**

⚠️ **Ce paragraphe affirmait « un prix résolu sans société est le prix pro »
et en faisait un verrou technique. C'est inexact, vérifié dans le code le
2026-09-17** (détail et diagrammes :
[`flux-de-commande.md`](flux-de-commande.md) §6.1) :

- `matchesAudience` (`b2b/pricing/domain/specificity.ts`) n'applique une règle
  `segment` ou `company` que sur correspondance — `companyId: null` n'en
  déclenche **aucune** ;
- sans société, **aucune mercuriale** n'entre dans la chaîne
  (`b2b/pricing/domain/resolve-price.ts`) ;
- et `GET /shop/catalogue` **sert déjà** ce prix-là à des prospects depuis le
  2026-09-09, en l'assumant par écrit.

Ce qu'un visiteur paierait est donc le **tarif de liste du catalogue**, moins
les seules promotions ouvertes à tous — pas un tarif négocié.

**Ce qui reste entier, et qui n'est pas technique :** ce tarif de liste est-il
destiné au public ? Et à quel **taux de TVA** —
[`analyse-boutique-publique.md`](analyse-boutique-publique.md) §2.3 pose « au
taux de TVA B2B », et ce point-là n'a **pas** été revérifié ici. La précondition
survit donc, mais comme **arbitrage de prix et de fiscalité**, pas comme verrou
de code : elle n'empêche plus d'écrire ni d'éprouver la route.

Et il n'y a pas de porte pour la lancer éteinte : `@RequiresShop("order")` sur
une route publique donne `featureSubjectOf(undefined) = null`
(`b2b/feature-access/http/feature-subject.ts`), donc la route suit le niveau
**global** — `feature-access.guard.ts` l. 16-20 le dit explicitement. Le même
flag `shop=order` qui ouvre la boutique pro ouvrirait celle-ci. Le flag **par
audience** est le D6 de l'analyse, et il n'est pas bâti.

[`analyse-boutique-publique.md`](analyse-boutique-publique.md) §7 l'avait déjà
posé : « **Aucune ouverture au public avant la fin du lot 5** », le tarif public
et les totaux TTC étant son lot 3, marqué « argent ». Ce plan s'insère **avant**
son lot 4, et ne se met en service qu'après son lot 5.

## 7. Les décisions (tranchées par Hugo le 2026-09-17)

- **D1 — un invité se reconnaît à l'ABSENCE d'`auth0Sub`.** ✅ Tranché. Pas de
  valeur de `UserStatus` en plus. La raison est celle de
  `interdiction-plutot-que-verification` : sans identité de connexion, se
  connecter est **inexprimable**, là où un statut déclaratif peut diverger du
  fait qu'il prétend décrire. Le `WHERE` s'écrit `auth0Sub IS NULL`.
  ⚠️ Conséquence à tenir : `UserStatus` d'un invité vaut `active` — il ne faut
  donc **jamais** déduire « peut se connecter » d'un statut.
- **D2 — deux lignes pour une adresse : on ASSUME.** ✅ Tranché par défaut, et
  c'est cohérent avec l'existant — `email` n'a aucune unicité aujourd'hui. Deux
  lignes, deux histoires. La réconciliation n'est pas dans ce plan.

  🔴 **Sa conséquence n'avait pas été chiffrée** (trouvée le 2026-09-17, en
  relisant le lot bâti). `findAccountByEmail`
  (`b2b/account/infrastructure/prisma-company-member.repository.ts`) **refuse**
  dès que plusieurs comptes portent l'adresse — `AccountEmailAmbiguousError`, et
  ce refus est juste : il ne veut pas choisir au hasard. Mais deux gestes
  commerciaux en dépendent — ouvrir un accès
  (`grant-account-access.service.ts`) et le carnet de contacts
  (`company-contact-book.service.ts`). Un inconnu qui tape l'adresse d'un vrai
  client au panier public les **bloquerait donc tous les deux**, sans compte,
  depuis une route anonyme. D2 disait « deux lignes, deux histoires » ; il ne
  disait pas « deux lignes, un geste commercial mort ».

- **D6 — un compte connectable GAGNE, toujours.** ✅ Tranché par Hugo le
  2026-09-17. La résolution par adresse cesse de compter les invités comme des
  candidats : **un compte connectable gagne ; à défaut, un invité unique ;
  sinon seulement, on refuse.**

  La raison tient en une phrase : **un invité n'est pas un compte.** Il n'a pas
  d'identité de connexion, aucun droit, rien à quoi se rattacher — et les deux
  appelants cherchent précisément un compte au sens de l'accès. Aligner le rôle
  d'un invité n'a aucun sens : il n'a pas de droits à aligner.

  Ce n'est pas un contournement du refus : l'ambiguïté entre deux **comptes**
  reste refusée, exactement comme aujourd'hui.

- **D7 — prévenir par courriel, jamais par le web.** ✅ Tranché par Hugo le
  2026-09-17 : « pas de fuite directe web, mais prévenir le client ».

  🔴 **Dire « cette adresse existe » à un anonyme est une fuite** — de
  l'énumération de comptes. En B2B elle est pire qu'ailleurs : elle est
  **commerciale**. Qui teste `contact@restaurant-untel.fr` apprend que ce
  restaurant se fournit chez nous. Aucune route publique ne doit donc répondre
  « existe / n'existe pas », sous aucune forme.

  Ce qui est décidé à la place : quand une commande publique porte une adresse
  qui correspond à un compte existant, un courriel part **à cette adresse** —
  « une commande a été passée avec votre adresse, est-ce vous ? ». Le canal de
  vérité est la boîte, dont seul le propriétaire a la clé.

  **Trois contraintes, et aucune n'est optionnelle :**

  1. **La réponse HTTP ne bouge pas d'un octet** — même statut, même corps, et
     l'envoi part en tâche de fond (`BackgroundWork`), jamais dans le temps de
     réponse. Un écart de durée rouvrirait la fuite par la bande.
  2. **La commande reste rattachée à l'invité neuf**, jamais au compte trouvé.
     La rattacher serait la voie §3.2 : commander sous le compte d'un autre.
  3. 🔴 **L'envoi doit être borné par adresse.** Un courriel déclenché par un
     anonyme est une arme : sans borne, on harcèle un vrai client en enchaînant
     les commandes. ⚠️ `SendMailArgs.idempotencyKey` **ne suffit pas** — elle
     dédoublonne « une reprise du même envoi » chez le fournisseur et est
     « ignorée par les adaptateurs qui ne savent pas dédoublonner »
     (`packages/mailer/src/types.ts`). S'appuyer dessus serait bâtir une
     protection sur une promesse que le port ne tient pas.

     **Le dépôt a déjà la pièce** : `MailJournal.rememberEvent(provider,
externalId)` (`platform/mailer/journal/mail-journal.port.ts`) est un
     registre d'unicité générique, et son commentaire dit lui-même « ce registre
     n'a rien de spécifiquement postal […] on le sortira au SECOND consommateur,
     pas avant ». **Nous sommes ce second.** Une clé par adresse et par jour
     rend `false` au deuxième passage, et l'envoi n'a pas lieu.

     ⚠️ Le registre ne dit pas encore où il vit une fois sorti : le geste de
     l'extraire est à concevoir au moment de bâtir, pas à supposer fait.

- **D3 — le rapatriement n'est PAS dans ce plan.** ✅ Il n'existe pas :
  [`../order/plan-nature-du-client-sur-la-commande.md`](../order/plan-nature-du-client-sur-la-commande.md)
  §1 — « aucun code ne rattache une société à une commande existante » — et son
  **D7 décide que le rapatriement ne réécrit pas** ce qui est figé à la
  passation. Un invité qui crée un compte ne reprend donc pas ses commandes sans
  un geste explicite, à concevoir ailleurs.
- **D4 — un règlement interrompu perd le PAIEMENT, pas la COMMANDE.** ✅
  Tranché. Aucune route publique de reprise : le `clientSecret` n'est pas
  persisté, et en rendre un depuis une surface publique serait la passoire que
  le §5 écarte pour l'idempotence, par le même mécanisme (`retrieveIntent` rend
  un secret vivant). La commande existe, elle se règle au comptoir ou sur
  relance. On rouvrira si le cas se produit vraiment.
- **D5 — la clientèle.** `Order.clientele` existe depuis le 2026-09-15. Une
  commande publique l'alimente en conséquence ; **à confirmer contre les valeurs
  réelles de l'énuméré au moment de bâtir** — elles n'ont pas été ouvertes ici.

- **D8 — un invité qui revient est RETROUVÉ, jamais recréé.** ✅ Tranché par
  Hugo le 2026-09-17, après la question « et si ce même client revient ? ».

  L'inscription du porteur créait une ligne neuve à chaque commande. Trois
  conséquences, dont deux que ce plan n'avait pas vues : l'historique d'un
  client fidèle se dispersait ; la croissance le comptait comme **N acheteurs
  distincts** (`on-order-placed.handler` journalise `subjectId: placedByUserId`,
  `prisma-order-metrics.reader` agrège sur `user:<id>`) ; et **D6 ne pouvait
  plus le rattacher** — « à défaut, un invité unique » ne tranche pas entre
  trois.

  🔴 **On réutilise un invité, JAMAIS un compte connectable.** C'est toute la
  différence avec la voie §3.2 : elle réutilisait une identité **Auth0**, donc
  elle donnait le compte d'un autre à qui tapait son adresse. Ici la ligne n'a
  aucun `auth0Sub` — se connecter dessus est inexprimable, et la réutiliser
  n'ouvre d'accès à personne.

- **D9 — le téléphone devient obligatoire, et l'adresse se confirme à
  l'écran.** ✅ Tranché par Hugo le 2026-09-17, après la question « et si la
  personne s'est trompée d'adresse ? ».

  Ce qu'on a établi en cherchant le rattrapage : il n'y en a presque pas. Le QR
  vit dans l'app, donc **l'onglet fermé l'emporte** — sans compte, il n'y a ni
  « mes commandes » ni second envoi. Au comptoir, une commande publique
  s'affiche par son **prénom seul** (`customerLabelOf` : raison sociale, sinon
  prénom + nom, et un invité n'a pas de nom). La sonde de courrier n'agrège que
  des compteurs sur sept jours — « trois rebonds », jamais lesquels — et
  `MailSend` ne porte **aucune référence de commande**.

  D'où les deux gestes, dans cet ordre de valeur :

  1. **Confirmer l'adresse à l'écran avant de régler.** C'est le seul qui
     _empêche_ au lieu de rattraper. ⚠️ Il suppose un formulaire de saisie que
     l'écran n'a pas encore — le panier mène aujourd'hui à l'inscription — donc
     il s'écrit **avec** le branchement de la route publique, pas avant.
  2. **Rendre le téléphone obligatoire** : déjà collecté, jusqu'ici facultatif.
     Il devient le second canal et la clé de recherche au comptoir. Refusé au
     schéma **et** au domaine — tous les appelants n'entrent pas par HTTP.

  Ce qui n'est **pas** retenu pour l'instant : alerter le staff sur le rebond
  d'une commande publique. Plus cher, parce que rien ne relie un envoi à une
  commande.

## 8. Le sort des objections de `vitruve`

> _Archive._ Ce que la contradiction a trouvé, et ce que la refonte en a fait.
> Une seule objection reste vivante — **B5**, le prix —, et elle a sa section
> au §6 ainsi que sa ligne au §12.

| #                                                  | Sort                                                                                                                       |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **B1** le `CHECK` n'interdit pas (`FALSE OR NULL`) | **disparue** — plus de colonnes invitées sur `Order`, donc plus de `CHECK`. L'objection reste juste, et elle a tué la voie |
| **B2** 29 fichiers, contrat de canal, 3 événements | **disparue** — `Order` n'est plus touché ; c'est ce qui a fait changer de voie (§3.1)                                      |
| **B3** la table d'idempotence absente des lots     | **disparue** — la surface publique a la sienne, l'existante n'est pas touchée (§5)                                         |
| **B4** le couple (clé, e-mail) est une passoire    | **corrigée** — écarté explicitement, avec la raison : le rejeu rend un `clientSecret` vivant (§5)                          |
| **B5** le prix pro                                 | 🔴 **entière, et assumée** — elle ne dépend pas de la voie. Devient le §6 : bâtir oui, ouvrir non                          |
| **S6** aucun canal pour le secret                  | **disparue** — le `User` invité a une adresse, les courriels marchent sans changement (§5)                                 |
| **S7** la croissance perd son sujet                | **disparue** — `placedByUserId` reste un `User` réel, `subjectId` est alimenté                                             |
| **S8** le rapatriement déjà tranché ailleurs       | **corrigée** — D3 : il n'existe pas, et D7 du plan voisin décide l'inverse de ce que je supposais                          |
| **S9** « réversible » était faux                   | **disparue** — plus de migration sur `Order` ; `auth0Sub` nullable reste irréversible en pratique, et c'est écrit ici      |
| **S10** deux secrets sur la même ligne             | **disparue** — plus de `publicToken` : `handoverToken` reste le seul secret, et il est déjà émis pour toute commande       |
| **S11** le règlement interrompu                    | **ouverte** — devient D4, au lieu du « rien à décider » de la première version                                             |

Les mineurs sont intégrés : `placeOrderPayloadSchema` ne portait déjà pas de
`companyId` (la société vient de `@ActingCompany()`), `@RequiresShop("order")`
est cité au §1.1, et la distinction machine-à-machine des routes publiques qui
écrivent est au §1.3.

## 8 bis. L'écran du panier (lu le 2026-09-17)

C'est par là que la demande est arrivée, et l'état est établi :

- `client/cart/panier-page/panier-page.ts` — `proceed()` (l. ~117) vérifie
  **deux** choses : panier vide → retour au rayon ; pas de mode de service →
  `/nouvelle-commande`. Il ne vérifie **pas** l'authentification.
- `ClientOrders.place()` (l. 265-274) exige `service`, des lignes **et un
  `workspace` non nul**. `ClientWorkspace.current()` vaut `null` tant que `/me`
  n'a pas répondu — donc pour un visiteur, `place()` rend `null` **en silence**.
  L'écran ne dit rien : c'est le défaut que la demande a fait remonter.
- `.pay:disabled` **existe déjà** dans `panier-page.scss` : le bouton sait se
  griser, il n'a jamais eu de condition pour le faire.
- Le motif d'invite existe aussi : `.ask` / `.ask-title` / `.ask-hint`, utilisé
  par « Où êtes-vous servi ? ». C'est la forme à reprendre pour « Qui
  êtes-vous ? » plutôt que d'en inventer une.
- Côté façade, `AuthFacade.register(target, profile)` accepte déjà un
  `PendingProfile { firstName, email, phone }` — **exactement les trois champs**.
  C'est la porte de qui **veut** un compte ; elle reste, à côté de la commande
  sans compte, et non à sa place.

Le lot d'écran doit donc : bloquer le règlement tant qu'on ne sait pas qui
commande, offrir les deux portes (les trois champs, ou la connexion), et n'écrire
le choix qu'une fois l'un des deux obtenu.

## 9. Ce que ce plan ne fait pas

- Le tarif public et les totaux TTC — §6, et ce sont eux qui commandent la date.
- L'inscription : elle marche, elle reste la voie de qui veut un compte.
- Mon compte, Mes commandes, Mes factures pour un client public.
- Le badge pro/public au comptoir : `Order.clientele` existe déjà (D5).

## 10. Ce qui n'a pas été vérifié

Ce que **je** n'ai pas ouvert :

- **La passerelle.** Un `POST /shop/orders` non authentifié est-il routé sans
  configuration supplémentaire ? Aucune liste blanche de chemins n'a été trouvée
  dans `gateway/src`, mais l'absence n'a pas été établie.
- **La production** : combien de commandes existent, quelle volumétrie publique
  est attendue. C'est le lot 0 de l'analyse (« compter en production »), et il
  n'a pas été fait.
- **Le débit** : 5 appels/60 s par **IP** (`getTracker`) borne-t-il réellement
  l'abus, sachant qu'une IP peut être partagée et qu'un attaquant en change ?
- **`@lfd/money` et le plancher public** : ce que coûte le TTC-d'abord n'est
  connu qu'à travers l'analyse, pas lu dans le code.
- **Le juridique et le fiscal** : CGV consommateur, taux applicable — hors de
  portée, comme l'analyse le note en §5.5.

Ce que la **contradiction** a signalé ne pas avoir ouvert : aucun fichier du
front (`apps/lfc-B2B-platform-frontend`) — le §8 bis ci-dessus comble ce trou,
par des lectures faites après son passage.

## 11. Les précédents du dépôt, pour qui bâtira

> _Archive._ Les pièges du dépôt relevés avant de bâtir. Le lot est fait ; ce
> qui reste utile ici est la **fenêtre de réversibilité** de la migration, plus
> bas — à lire si l'on doit revenir en arrière sous pression.

- **Une contrainte `CHECK` insensible au `NULL`** :
  `prisma/migrations/20260904160000_derogation_d_heure_limite/migration.sql:58`
  compare `("used_by_order_id" IS NULL) = ("used_at" IS NULL)` ;
  `20260915140000_mandat_actif_signe/migration.sql:30` compare avec `IS NOT NULL`,
  jamais avec `<> ''`. La première version de ce plan avait écrit
  `guestEmail <> ''`, qui laissait passer la ligne interdite (`FALSE OR NULL` =
  `NULL`) — l'erreur est morte avec la voie, la leçon reste.
- **Un plan voisin qui a vécu la même contradiction** :
  [`../order/plan-nature-du-client-sur-la-commande.md`](../order/plan-nature-du-client-sur-la-commande.md)
  — un BLOQUANT y a renversé une décision, et le sort de chaque objection est
  consigné à son §5. C'est la forme suivie ici au §8.
- **Une migration irréversible assumée par écrit** : son D4 — « il n'y en a pas :
  nullable pour toujours ». `auth0Sub` nullable est dans le même cas, et il faut
  le dire plutôt que d'invoquer la réversibilité du §0 du `CLAUDE.md`.

  🔴 **La fenêtre exacte, pour qui lirait ceci pendant un déploiement**
  (relecture des deux migrations, 2026-09-17) : le retour arrière est possible
  **jusqu'au premier invité écrit**, impossible ensuite. `ALTER COLUMN
auth0_sub SET NOT NULL` échoue dès qu'une ligne est nulle, et il n'y a **rien
  à inventer** pour la réparer — un `auth0Sub` est une identité réelle chez
  Auth0, pas un remplissage. Le seul « rollback » restant serait de supprimer
  des clients réels, ce que le §0 du `CLAUDE.md` interdit. L'irréversibilité
  est donc **conditionnelle au trafic**, pas absolue au déploiement.

  Ce que la relecture confirme par ailleurs : `DROP NOT NULL` sur une colonne
  `@unique` ne demande **aucune** recréation d'index — un index unique Postgres
  admet autant de `NULL` qu'on veut, et continue d'interdire deux valeurs non
  nulles identiques. Et aucun contrat n'expose `auth0Sub` : vérifié à zéro
  occurrence dans `packages/` et dans les deux fronts.

## 12. L'état : ce qui est fait, ce qui reste

Découpage arrêté le 2026-09-17, bâti le même jour. **Les sections 1 à 11 sont
désormais l'archive de conception** — elles expliquent POURQUOI, et on n'y
revient que pour contester une décision. Ce qui suit est le seul état à jour.

### ✅ Fait

| Lot   | Ce qui a été bâti                                                                    | Commit     |
| ----- | ------------------------------------------------------------------------------------ | ---------- |
| **A** | Le panier retient le règlement tant qu'il ignore qui commande, et le dit             | `9fddf8d9` |
| **B** | `auth0Sub` nullable : un client existe sans identité de connexion                    | `3c8f20f3` |
| **C** | `POST /shop/orders` — écrite, éprouvée, **pas ouverte**                              | `d83da52e` |
| **D** | Rien à faire : courriels, QR et fiche marchent dès que le porteur est un `User` réel |            |

**Ce que le lot A fait déjà, et qu'il ne faut pas défaire** : il offre les deux
portes **ensemble**, sans jamais regarder l'adresse saisie. C'est D7 appliqué —
une surface publique ne répond jamais « ce compte existe ».

🔴 **Le lot C est fermé par l'absence de son contrôleur dans `orders.module.ts`.**
La route n'existe pas à l'exécution ; tout ce qu'elle appellerait est monté et
éprouvé. C'est le seul « fermé » qui ne mente pas — aucune porte du dépôt ne
sait livrer une route publique éteinte (§6).

### ⬜ Reste à faire

1. **D6 — un compte connectable gagne.** Dans `findAccountByEmail`
   (`b2b/account/infrastructure/prisma-company-member.repository.ts`) : un
   compte connectable gagne ; à défaut, un invité unique ; sinon on refuse.
   ⚠️ `AccountEmailAmbiguousError` n'est couverte par **aucun test** du dépôt —
   la règle ne sera donc garantie que par ceux qu'on écrira.
2. **D7 — le courriel « est-ce vous ? ».** Un gabarit de plus dans
   `platform/mailer/mail-templates.ts`, parti par `work.track(...)` hors du temps
   de réponse, et **borné par adresse** via `MailJournal.rememberEvent` — dont le
   commentaire prévoit exactement ce second consommateur.
3. **L'ouverture**, et elle ne dépend pas du code : l'arbitrage de prix du §6.
   Le jour venu, trois gestes — enregistrer `ShopOrdersController`, faire pointer
   la porte « première commande » du panier vers la route publique au lieu de
   l'inscription, et trancher le tarif public.

### Ce qui n'a toujours pas été ouvert

Le §10 reste vrai sur deux points : la **passerelle** (un `POST /shop/orders`
non authentifié y est-il routé ?) et le **débit** (5 appels/60 s par IP
borne-t-il réellement l'abus ?). Les deux se vérifient avant l'ouverture, pas
avant le code.
