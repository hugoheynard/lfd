# Revoir la sécurité de la transmission du RIB saisi par le client

> Ouverte le 2026-09-14, à la demande de Hugo, en bâtissant
> [`plan-rib-client.md`](plan-rib-client.md) **sans** passage par
> `vitruve`. Rien de ce qui suit n'est décidé.

## Ce qui est en place

- L'IBAN monte **en clair dans le corps** d'un `PUT` HTTPS, puis il est scellé
  en base (AES-256-GCM). Il ne redescend jamais : `last4`.
- La route client est murée (404 non-membre, 403 hors `owner`/`billing`).

## Ce qui reste à examiner

- **Journaux** : vérifier qu'aucun corps de requête n'est journalisé sur ce
  chemin (passerelle, logs structurés, traçage d'erreur `AppErrorFilter`).
- **Prise de compte** : un jeton volé permet de remplacer le compte débité.
  Confirmation par e-mail, ou délai avant prise d'effet ?
- **Mandat** : un changement de compte côté client casse le prélèvement en
  cours ; faut-il prévenir le staff, ou bloquer tant qu'un mandat est actif ?
- **Trace** : aucun fait au journal pour un dépôt de RIB, ni côté staff ni côté
  client.
- Passage par `vitruve` avant d'ouvrir le geste à tous les clients.
- **Le PDF du mandat rend l'IBAN à qui porte un jeton owner/billing**
  (ajouté le 2026-09-14, plan `plan-mandat-client.md` §6 #3). Assumé :
  un mandat EPC porte l'IBAN du débiteur. Mais un jeton volé permet désormais
  de LIRE le compte, plus seulement de le remplacer — la question « prise de
  compte » ci-dessus s'élargit d'autant.

> ⚠️ Deux des points ci-dessus ont bougé le 2026-09-14 avec le mandat client :
> un changement de RIB client est **refusé en 409 tant qu'un mandat est actif**
> et révoque le brouillon sinon ; et la **révocation d'un brouillon** est
> journalisée. Le dépôt du RIB lui-même n'écrit toujours aucun fait.

## À voir le 2026-09-15 — corriger le RIB sans ressaisir l'IBAN

Relevé par Hugo le 2026-09-14, en passant le RIB de Mon compte en dialogue
(`6a6f1f2f`). Aujourd'hui **toute correction exige l'IBAN entier** : la lecture
n'en rend que les quatre derniers chiffres (`bankAccountDraftFrom` part d'un IBAN
vide), et le formulaire n'est complet qu'avec un IBAN (`isBankAccountComplete`).
Corriger une ligne d'adresse ou le titulaire laisse donc Enregistrer désarmé ; un
spec du dialogue et un spec Jest fixent ce comportement.

À trancher :

- **garder** — toute écriture du RIB repasse par l'IBAN complet ; c'est cohérent
  avec la révocation du mandat en attente à chaque écriture du RIB ;
- **ou permettre** titulaire et adresse sans IBAN — il faut une route qui n'écrit
  que ces champs côté serveur (le `PUT` actuel exige l'IBAN), décider si elle
  révoque aussi le brouillon de mandat (le papier imprime titulaire et adresse),
  et la soumettre à `vitruve` : c'est une écriture sur une coordonnée bancaire.
