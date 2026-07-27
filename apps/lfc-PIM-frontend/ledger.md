# Ledger — questions ouvertes & décisions (LFC PIM)

Journal léger des arbitrages non tranchés. Une entrée = un doute qu'on assume
en attendant d'avoir le vrai besoin. On ne construit pas sur une hypothèse tant
qu'elle n'est pas confirmée par un usage réel.

---

## 2026-07-27 — Le « Regénérer » d'un QR de table sert-il à quelque chose ?

**Contexte.** Un QR est un encodage déterministe : pour une URL donnée, un seul
QR canonique. Pour rendre « Regénérer » réel, on a ajouté un **token rotatif**
par table (`…?table=N&k=token`) — regen = nouveau token → nouveau QR → l'ancien
imprimé devient caduc.

**Le doute.** Une table a une URL **stable** ; elle n'a pas vocation à changer.
La rotation ne se justifie que si on a un vrai besoin d'**invalidation**
(QR fuité, réimpression contrôlée, campagne datée). Pour un simple « scanner la
table pour commander », c'est probablement **du bruit**.

**Décision provisoire.** On **retire le bouton Regénérer** de l'UI, remplacé par
un **export vectoriel nommé** (`qr-{boutique}-table-N.svg`) — bien plus utile au
quotidien (impression). On **garde** le champ `token` sur `EmplacementTable`
(déjà en v6, inerte sans regen) pour ne pas re-migrer si le besoin réapparaît.
Le ✕ (retirer le QR) reste.

**À rouvrir si.** Un besoin concret d'invalidation/rotation émerge (sécurité,
réimpression, table temporairement fermée). Sinon, prochaine étape : supprimer
aussi `token` et simplifier `tableUrl` en `?table=N`.
