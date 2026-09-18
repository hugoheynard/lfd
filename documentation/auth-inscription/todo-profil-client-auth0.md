# Profil client : l'adresse suit-elle Auth0, et un bouton « Changer mon mot de passe »

> Ouvert le 2026-09-14 à la demande de Hugo, après le déplacement du profil de
> Mon compte vers le menu de l'en-tête (`17953b99`). Deux sujets, tous deux liés
> à l'identité Auth0 : ce qui existe se vérifie sur le vrai tenant, ce qui
> manque se conçoit sans ouvrir de faille.

## 1. Vérifier que le changement d'adresse suit bien Auth0

### Ce que fait le code (lu le 2026-09-14)

- `UpdateMyProfileHandler` (`b2b/account/application/commands/update-my-profile.handler.ts`)
  refuse une adresse déjà prise, **propage d'abord à Auth0**, puis écrit chez nous :
  un échec d'Auth0 ne laisse rien.
- `Auth0IdentityGateway.changeEmail` (`platform/identity/auth0-identity.gateway.ts`)
  fait `PATCH /api/v2/users/:sub` avec `email`, `email_verified: false`,
  `verify_email: true` : Auth0 envoie son e-mail de vérification.
- `PrismaUserProfileRepository.save` écrit la nouvelle adresse et remet
  `email_verified` à `false`.
- `CustomerPrincipalResolver` ne recopie la preuve que si le jeton porte
  `email_verified` **et** la même adresse que la base (`tokenProvesAddress`) : un
  jeton encore valide émis pour l'ancienne adresse ne prouve pas la nouvelle.
- L'adaptateur de développement (`dev-customer-identity.ts`) ne fait rien : **aucun
  test ne traverse le vrai tenant**.

### Ce qui n'est vérifié nulle part — à éprouver sur le tenant

1. Après le changement, la connexion se fait-elle avec la **nouvelle** adresse,
   et l'ancienne est-elle refusée ?
2. L'e-mail de vérification d'Auth0 part-il, et son lien fait-il passer
   `email_verified` à vrai **chez Auth0** ?
3. L'Action `add-email-claim` (`platform/auth/auth0-claims.ts`) pose-t-elle la
   nouvelle adresse et `email_verified` dans le jeton suivant — donc notre base
   passe-t-elle à « prouvée » après la vérification et une reconnexion ?
4. Une identité **sociale ou sans mot de passe** (si le tenant en autorise) :
   le `PATCH` d'adresse échoue-t-il, et que lit alors la personne ?
5. Le jeton courant, qui porte l'ancienne adresse jusqu'à son renouvellement :
   rien ne s'affiche ni ne se décide sur lui entre-temps ?

### Deux défauts déjà visibles

- **La vérification « adresse déjà prise » compare à la casse exacte**
  (`findIdByEmail`, `prisma-user-profile.repository.ts` : `where: { email }`).
  `Jean@x.fr` passe quand `jean@x.fr` existe ; deux comptes portent alors la même
  boîte, et depuis `9f28f00f` toute invitation vers cette adresse est refusée
  comme ambiguë. À comparer sur la forme normalisée, comme `findAccountByEmail`.
- **Aucun fait au journal** n'est écrit quand l'adresse de connexion change —
  le geste qui compte le plus pour la sécurité d'un compte.

## 2. Ajouter « Changer mon mot de passe »

### Ce qui existe

- Aucune route client ne le permet.
- Le port a `issuePasswordLink(subject)`, qui émet un ticket
  `POST /api/v2/tickets/password-change` avec **`mark_email_as_verified: true`**.
  C'est juste pour une invitation — le lien part PAR E-MAIL, donc le suivre prouve
  la boîte.

### 🔴 Le piège

**Rendre ce lien à l'écran du client connecté** marquerait vérifiée une adresse
que personne n'a prouvée : quelqu'un change son adresse pour une boîte qu'il ne
contrôle pas, clique « changer mon mot de passe », suit le lien affiché — et
l'adresse devient « prouvée » chez Auth0, puis chez nous à la connexion suivante.
L'exemption par adresse prouvée et le refus B1 deviennent contournables.

### À concevoir

- **Envoyer le lien par e-mail**, jamais l'afficher : soit
  `POST /dbconnections/change_password` d'Auth0 (le fournisseur l'envoie à
  l'adresse du compte), soit notre ticket émis **avec
  `mark_email_as_verified: false`** et envoyé par notre mailer.
- **Où** : dans le dialogue « Mon profil », sous l'adresse ; peut-être aussi dans
  le menu de l'en-tête.
- **Réponse neutre** et limite de débit sur la route (un envoi toutes les quelques
  minutes par compte).
- **Fait au journal** « lien de changement de mot de passe demandé ».
- **Identités sociales** : pas de mot de passe chez nous — le bouton ne s'affiche
  pas, ou dit pourquoi.

## 3. Quand

Avant d'ouvrir largement l'espace client : le changement d'adresse est en ligne
et sert d'identifiant de connexion.
