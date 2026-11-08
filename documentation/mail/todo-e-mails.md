# Les e-mails — ce qui viendra plus tard

> Ouvert le 2026-11-08 à la demande de Hugo : un seul endroit pour ce qui
> n'est **ni fait, ni à faire avant le prochain déploiement**. Ce qui
> presse (les gestes de Hugo, l'avant-déploiement) reste dans
> [`les-e-mails.md`](les-e-mails.md), « Ce qui reste à faire ». Un point pris
> en main quitte cette liste pour son plan ; un point fait n'y reste pas.
>
> « Service » = [`plan-service-e-mails.md`](plan-service-e-mails.md),
> « Éditeur » = [`plan-editeur-par-blocs.md`](plan-editeur-par-blocs.md),
> « Suivi » = [`le-suivi-des-e-mails.md`](le-suivi-des-e-mails.md).

## Décisions à prendre (Hugo)

- **« Voir ma commande » d'un invité** mène à la page d'annulation : la
  garder, ou créer une vraie page de consultation — Éditeur § 26, n° 3.
- **Les pièces jointes par URL signée (S3c)**, « à revoir » ; d'ici là le
  bloc `mail` lit le stockage des pièces client — Service § 22.
- **Le dossier du fournil part encore en octets** : ouvrir son stockage au
  bloc `mail`, ou le laisser — Service, revue cas 7.
- **La durée de conservation des mandats** rangés au stockage — Service,
  revue cas 7.

## Chantiers à bâtir

- **Les 31 autres e-mails à la règle de l'accroche** (le staff n'écrit que
  l'accroche) : 16 faciles et 4 moyens d'abord, puis les 11 « à discuter »
  ligne par ligne — Éditeur § 23 (relevé) et § 26, n° 6.
- **Le Support** (Hugo, 2026-11-07) : traiter dans le back-office les
  e-mails reçus (`support@lfd-backoffice.com`, puis une adresse client sur
  `lafoliecoffee.info`) — les lire, les relier à leur commande ou à leur
  compte, répondre par le bloc `mail` ; dans Email Templates, l'onglet
  « Expéditeur » deviendrait « Réglages », l'adresse de réponse choisie parmi
  celles que le Support reçoit. ⚠️ **Pas vierge** : le plan
  [`../demandes-client/plan-reponses-par-e-mail.md`](../demandes-client/plan-reponses-par-e-mail.md)
  (2026-10-28, contredit par vitruve) couvre la réception, et le webhook
  remet déjà `email.received` à la boîte des demandes (`b2b/contact`). Le
  relire contre le code avant d'écrire quoi que ce soit ; route publique et
  données personnelles : `vitruve` avant Hugo.
- **Les faits `mail.delivered` / `mail.bounced`** publiés aux autres blocs,
  pour afficher « e-mail reçu » ou « adresse rejetée » sur la fiche d'une
  commande. Il faut d'abord qu'une demande d'e-mail connaisse son sujet
  (commande, compte), ce que `mail.mail_request` ne porte pas — Suivi, « Ce
  qui reste » ; Service, revue cas 5.
- **Le filtre « rien reçu du fournisseur »** dans le suivi des envois : l'API
  ne sait pas filtrer un retour nul — Suivi, T3.
- **L'e-mail de vérification d'Auth0** (« Verify your email ») part en
  anglais et hors du suivi du bloc `mail` (constaté le 2026-11-07 sur un
  rebond).

## Architecture, à mesurer avant de décider

- **Les demandes suivies entre blocs** : toute demande d'un bloc à un autre
  rend un identifiant de suivi, et son état se lit plus tard ; une porte qui
  fait déclarer à chaque port de canal sa sorte (lecture, fait, demande). Le
  bloc `mail` le fait déjà depuis le suivi. Première étape : compter, en mode
  rapport, les ports qui seraient en dette —
  [`../todos/todo-demandes-suivies.md`](../todos/todo-demandes-suivies.md).

## Pistes, pas maintenant

- **Colonnes « hybrides »** qui s'empilent sans `@media` (Gmail application,
  certains Outlook) — Hugo : « non pas là » — Éditeur § 24.
- **MJML** : il resterait contenu dans `@lfd/mailer` ; à envisager si on fait
  des colonnes hybrides, si un rendu cassé est constaté dans Outlook ou Gmail
  application, ou pour des blocs complexes — Service § 2, C6.

## À voir en vrai, un jour

- Le glisser-déposer des variables et des blocs, la saisie avec pastilles,
  dans Safari et Firefox — Éditeur § 22.
- Le QR et l'empilement des colonnes en mode sombre de Gmail et d'Outlook —
  Éditeur § 8.
