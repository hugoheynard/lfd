# « Supprimer mon compte » — l'anonymisation d'une personne

> Hugo, 2026-10-05 : « le texte n'est pas juste, ce n'est pas en écrivant, ça
> serait en supprimant le compte » ; puis « ajoute le plan supprimer mon compte
> avec anonymisation ». État : **doc-first**, rien de bâti. **`vitruve`
> d'office** : données réelles, mur tenant, frontière d'identité (Auth0).
> Suite du §6 de [`plan-page-confidentialite.md`](plan-page-confidentialite.md).

## 1. Ce qui existe (relu le 2026-10-05)

- **Aucun geste** ne supprime ni n'anonymise un client : ni bouton dans la
  boutique, ni route, ni geste au back-office. Le texte publié décrit la voie
  par courriel, qui ne se tient aujourd'hui qu'en SQL.
- `public.users` : `email` (sans contrainte d'unicité), `auth0_sub`
  **unique** et nullable — le lien avec le fournisseur d'identité.
- Le port `CustomerIdentity` (`b2b/account/domain/ports/customer-identity.port.ts`)
  sait délier une méthode de connexion ; il ne sait **pas** supprimer un
  utilisateur chez Auth0.
- Une purge des preuves de retrait par ancienneté existe déjà
  (`purge-handover-proofs-older-than`) : les photos et signatures ont leur
  propre durée de vie.
- Le dépôt refuse le DELETE physique sur un agrégat métier (CLAUDE.md §3) :
  d'où **anonymiser**, pas supprimer, pour tout ce qui porte une histoire.

## 2. Le principe

**La personne disparaît, l'histoire reste.** On efface ce qui identifie la
personne ; on garde, détaché d'elle, ce que la loi impose de garder (factures
et pièces comptables, 10 ans ; preuve d'un mandat SEPA). Une commande reste
une commande, rattachée à « Client supprimé ».

**Une personne n'est pas une société.** Supprimer son compte retire la
personne ; la société cliente (raison sociale, SIRET, KBIS, mandat, factures)
reste tant qu'elle est cliente. Ce que la personne portait **pour** la société
(contact, détention) se règle à part (§4).

## 3. Ce que devient chaque donnée

Relevé par un agent `Explore` le 2026-10-05, à partir des tables ; **à
revérifier table par table au bâti** (marqué ✔ quand rouvert à la main).

| Donnée                                                       | Geste                                                                                     | Pourquoi                                           |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `users` : prénom, nom, téléphone, préférences                | **anonymiser** (« Client supprimé », vides)                                               | identité                                           |
| `users.email`                                                | **anonymiser** (`supprime+<id>@invalid`)                                                  | identité ; une adresse vide casserait les lectures |
| `users.auth0_sub` ✔ (unique)                                 | **effacer** (null) après suppression chez Auth0                                           | plus aucune connexion possible                     |
| Méthodes de connexion (Google, Facebook)                     | **délier** puis supprimer l'utilisateur chez Auth0                                        | le fournisseur garde sinon l'identité              |
| Paniers, clés d'idempotence                                  | **effacer**                                                                               | éphémères, sans valeur                             |
| Demandes de support, rendez-vous, lead lié                   | **effacer** ou **anonymiser**                                                             | CRM, sans obligation                               |
| Carnet d'adresses d'un particulier                           | **anonymiser** les adresses non utilisées par une commande à conserver                    | identité                                           |
| Commandes : snapshot d'adresse, nom                          | **conserver**, détachées du compte                                                        | facture et pièce comptable, 10 ans                 |
| Factures, avoirs                                             | **conserver**                                                                             | obligation comptable                               |
| Fidélité (écritures, bons)                                   | **conserver** les montants ; le solde est perdu                                           | comptabilité des bons émis                         |
| Mandat SEPA, compte bancaire                                 | **conserver** RUM, preuve, IBAN scellé ; **anonymiser** le titulaire si c'est la personne | preuve de mandat (contestations)                   |
| Journal (`growth.activity_events`)                           | **conserver** ; le nom figé de la personne dans un fait est **à trancher** (§5, Q2)       | journal opposable                                  |
| Courriels envoyés (`ops.mail_send`)                          | **anonymiser** le destinataire                                                            | trace d'envoi, sans l'adresse                      |
| Preuves de retrait (nom du réceptionnaire, photo, signature) | **conserver** jusqu'à leur purge existante ; **anonymiser** le nom                        | preuve de remise                                   |
| Exécution de tournée, incidents (contact, adresse recopiés)  | **anonymiser** le contact ; l'adresse suit la commande                                    | preuve de livraison                                |

## 4. Les cas qui refusent

- **Le détenteur d'un compte pro** (`membership.role = owner`) ne peut pas
  supprimer son compte tant que la société a d'autres membres ou reste
  cliente : refus nommé, « transférez la détention, ou demandez la clôture du
  compte de la société ». Le contact de la société qu'il incarnait est
  remplacé par le nouveau détenteur, pas effacé en silence.
- **Une commande en cours** (ni remise, ni annulée) : refus, « votre commande
  du … est en cours ; la suppression sera possible après sa remise ».
- **Un solde dû** (prélèvement en attente, facture impayée) : refus nommé.

## 5. Les gestes

1. **La boutique : « Supprimer mon compte »** dans l'espace client — explique
   ce qui est supprimé et ce qui est gardé, demande de retaper son adresse,
   puis exécute. L'utilisateur est déconnecté.
2. **Le back-office** : le même geste sur la fiche d'une personne, pour une
   demande reçue par courriel, sous un droit neuf (ressource ajoutée par
   migration ; le droit s'accorde **à l'écran**).
3. **Un seul agrégat, une seule transaction** pour la base ; la suppression
   chez Auth0 passe par un **fait durable** (`user.erased`) dont l'abonné appelle
   le fournisseur, rejoué jusqu'au succès (boîte d'envoi). Le fait ne porte
   **aucune** donnée personnelle : l'identifiant et l'instant.
4. **Plus tard** : le rappel de suppression de Meta (`signed_request`) appelle
   le même geste.

**Questions pour Hugo**

- **Q1** — Le détenteur seul d'une société sans autre membre : refuser, ou
  clôturer la société avec lui ?
- **Q2** — Les faits du journal qui portent le nom de la personne (un
  `actorName` figé) : les laisser (journal opposable, intérêt légitime) ou les
  réécrire en « Client supprimé » (le journal ne se réécrit jamais
  aujourd'hui) ?
- **Q3** — Un délai de rétractation (compte désactivé 14 jours, puis
  anonymisé) ou immédiat ?

## 6. Le texte publié, une fois bâti

« Vous pouvez supprimer votre compte à tout moment depuis votre espace
client : Mon compte › Supprimer mon compte. Vous pouvez aussi nous écrire à
[adresse dédiée]… » — la suite du texte actuel (ce qui est supprimé, ce qui est
conservé) reste juste. **Ne pas le publier avant le déploiement du geste.**

## 7. Lots

| Lot | Contenu                                                                                |
| --- | -------------------------------------------------------------------------------------- |
| S0  | Contradiction `vitruve`, réponses de Hugo (Q1–Q3), relevé table par table ✔            |
| S1  | Domaine et serveur : l'anonymisation, les refus, le fait `user.erased`, l'abonné Auth0 |
| S2  | Le bouton de la boutique, le geste du back-office                                      |
| S3  | Le texte publié en trois langues                                                       |
| S4  | (plus tard) Le rappel de suppression de Meta                                           |

## 8. Contradiction de `vitruve` (2026-10-05), et la v2

**BLOQUANTS, levés :**

1. **Le jeton recréerait le compte** (`CustomerPrincipalResolver` :
   `findBySub(sub) ?? provision(token)`). → Dans la transaction, la personne
   passe `disabled` (le résolveur refuse déjà un compte désactivé) et **garde
   son `auth0_sub`** jusqu'à ce que l'abonné confirme la suppression chez Auth0.
   Ensuite, une **pierre tombale** : l'empreinte du `sub` dans une table que
   `provision` consulte avant de créer, pour qu'un jeton encore valide ne
   recrée rien. Le `sub` en clair disparaît alors.
2. **L'abonné Auth0 n'aurait plus le `sub`** → réglé par 1 : il le lit sur la
   ligne désactivée (lecteur à inscrire dans `lint:auth0-id-readers`). Le fait
   ne porte toujours que l'identifiant de la personne.
3. **« Rejoué jusqu'au succès » était faux** (dix essais, puis lettre morte).
   → L'ordre est écrit : base d'abord, Auth0 ensuite, on ne réactive jamais.
   Un 404 d'Auth0 compte comme un succès (idempotent). La lettre morte de
   `user.erased` est un état surveillé (carte de santé, rejeu
   `POST /admin/outbox/replay`). Le port `CustomerIdentity` gagne `deleteUser` ;
   `DELETE /api/v2/users/{id}` emporte les identités liées, donc « délier
   d'abord » disparaît.
4. **Les factures ne sont pas en base** : la facturation vit chez des tiers.
   → Une section par **système tiers**, à relever au bâti : Stripe (le
   Customer d'un particulier, `stripe_customer_id`, liens de paiement),
   l'émetteur de factures, Resend (liste de suppression, appariement des
   rebonds). Chacun a son geste, ou la raison de ne rien faire.
5. **Tables oubliées** : `production.production_order.customer_label`,
   `packing.packing_order.customer_label` (noms recopiés dans d'autres blocs),
   `feature_access_exemptions.email`, `company_contacts` et les contacts de
   `companies` pour **tout** membre (pas seulement le détenteur),
   `client_notes`, `growth.leads` / `appointments`,
   `subscriptions.delivery_address_snapshot`, `delivery_stop_execution`. →
   **Pas une seule transaction** : la base du commerce s'anonymise dans la
   sienne, et le fait `user.erased` est écouté par chaque bloc qui a recopié
   un nom (production, colisage, livraison), chacun anonymisant chez lui —
   c'est exactement ce que la boîte d'envoi permet sans franchir la matrice.
6. **Les abonnements continueraient** → l'anonymisation **clôt** les
   abonnements actifs de la personne par l'agrégat `Subscription`.

**SÉRIEUX, tranchés ou ouverts :**

- **Le journal** porte des données personnelles dans ses `payload`
  (`user.registered` porte l'e-mail). Q2 s'élargit : relever tous les types de
  fait qui en portent. Ne pas réécrire demande une base écrite
  (RGPD art. 17.3 b ou e), pas seulement « journal opposable ».
- **Le détenteur** : un refus sans issue n'a pas de base RGPD. → Pas de refus
  définitif : le staff transfère la détention, ou la personne est anonymisée
  et la société garde un contact « à ressaisir » signalé sur sa fiche.
  « Commande en cours » et « solde dû » **diffèrent** la suppression (au plus
  un mois, art. 12.3), ils ne la refusent pas.
- **Le nom sur la pièce comptable** : une commande ne fige pas le nom, il vient
  de `users`. → Figer le nom du client sur les commandes facturées **avant**
  d'anonymiser, ou décider qu'une pièce interne peut dire « Client supprimé »
  (à trancher, Q4).
- **Les invités** (sans `auth0_sub`) n'ont que le geste du back-office ;
  l'identité du demandeur se vérifie par l'adresse de la commande.
- `supprime+<id>@invalid` ne doit pas déclencher `refuseSecondAccount` : à
  vérifier au bâti.

**Q4 pour Hugo** — sur les commandes conservées, le nom du client doit-il
rester (figé avant anonymisation) ou devenir « Client supprimé » ?
