# TODO — tableau de bord commercial

> **État au 2026-08-09** : la page est refaite — en-tête à chiffres, comptes
> **épinglés**, file des coups du jour, et un rail « aujourd'hui » qui porte le
> **calendrier du jour** et la file **à rappeler** (avec son bouton de clôture).

## 1. Choisir les éléments à afficher

Demandé, **pas fait**. Le tableau de bord montre aujourd'hui la même chose à
tout le monde, dans un ordre fixe.

Trois questions à trancher **avant** d'écrire quoi que ce soit — elles décident
du modèle, pas de l'écran :

- **Que choisit-on ?** Afficher/masquer un bloc suffit-il, ou faut-il aussi
  l'**ordre** (glisser-déposer) ? Le second coûte trois fois le premier et ne
  sert que si les blocs deviennent nombreux. Commencer par afficher/masquer.
- **Pour qui ?** Une préférence par **personne** suppose une personne — voir §2.
  À défaut, un réglage d'équipe dans Réglages → Commercial est honnête, et
  suffit à trois utilisateurs.
- **Où vit la liste des blocs ?** Un tableau de bord composable a besoin d'un
  **registre** de blocs (clé, titre, composant, disponible-si). Sans lui, chaque
  ajout retouche la page — et c'est exactement le genre de `switch` que les
  conventions interdisent de laisser grossir.

## 2. Les épingles vivent dans le navigateur, pas sur le serveur

`PinnedAccountsStore` écrit dans `localStorage`. C'était un choix **daté**, pas
un raccourci : une préférence par personne suppose une identité.

⚠️ **Le déclencheur a sonné — vérifié le 2026-09-03.** Ce paragraphe disait
« le login staff n'est pas branché — tout le monde est `dev-staff` derrière le
bypass », et renvoyait au constat P1-3 de l'audit, lui-même refermé. Les deux
étaient faux : `AdminAuthGuard` vérifie un vrai jeton staff contre l'audience
Auth0, `StaffUser.auth0Id` porte l'identité **liée à la première connexion**, et
`dev-staff` n'est que le sujet synthétique du bypass **local**
(`AUTH_ADMIN_DEV_BYPASS`, fail-closed en prod par `AppConfig`). Prendre le
confort du poste de travail pour l'état du produit a gelé cette tranche un mois
de trop.

Ce qui reste vrai, en revanche : **`StaffUser` n'a toujours pas de `prefs`.**
C'est ça, et seulement ça, qui manque — le miroir de `nav_prefs` sur `users`
(`prisma/schema/public/account.prisma`), qui fait déjà ce travail pour les clients.

Conséquence encore subie aujourd'hui : les épingles ne suivent ni le navigateur,
ni la machine.

**La bascule**, désormais débloquée : le magasin devient un adaptateur — **même
API** (`pinned`, `toggle`, `isPinned`), une écriture réseau derrière. La page ne
touche jamais `localStorage` elle-même, exprès.

C'est aussi ce qui rend le §1 réellement faisable **par personne**.

## 3. Deux limites du rail

- Le rail lit les rendez-vous de la **journée seule** (une requête bornée à
  aujourd'hui). Un rendez-vous à 8 h demain n'y apparaît pas — c'est voulu :
  « aujourd'hui » doit vouloir dire aujourd'hui. Le calendrier est à un clic.
- La file « à rappeler » n'a **aucune pagination** : elle affiche tout ce que
  l'API rend d'ouvert. Si elle dépasse la dizaine, ce n'est plus un rail, c'est
  une page — et il faudra alors la sortir dans son propre écran.
