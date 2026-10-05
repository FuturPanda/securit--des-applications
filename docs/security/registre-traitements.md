# Registre des traitements — démonstrateur de cotations

État au 2026-10-05 : application locale, quatre instruments simulés, dépôt de code public ; **pas de base de données ni de déploiement public du service**. Un pseudonyme choisi par une personne peut malgré tout la rendre identifiable : le caractère « démo » ne dispense pas de documenter les traitements. Ce registre décrit le code, pas une conformité RGPD certifiée.

- **Responsable du traitement** : à confirmer avec le responsable pédagogique : étudiant opérant la démo ou établissement si celui-ci détermine les finalités et moyens. Aucune décision juridique institutionnelle n'a été fournie.
- **DPO / contact RGPD** : statut et coordonnées à confirmer auprès de l'établissement ; ne pas inventer une personne.
- **Base légale candidate** des deux fiches : **intérêt légitime (art. 6(1)(f) RGPD)** pour opérer et présenter une simulation pédagogique, **à valider** par le responsable avec une mise en balance. Si le responsable est une autorité publique agissant dans sa mission, cette base peut ne pas convenir ; étudier alors la **mission d'intérêt public (art. 6(1)(e))**. Ne pas présenter ces hypothèses comme un avis juridique définitif.

## T-01 — Émettre un jeton et représenter la présence d'un spectateur

| Rubrique | Situation effective |
|---|---|
| Finalité | Donner accès aux commandes de bid du prototype et compter les spectateurs authentifiés par instrument. Il n'y a **aucune vérification de l'identité** derrière le nom choisi. |
| Base légale | Candidate : intérêt légitime art. 6(1)(f), **validation du responsable et de l'établissement requise**. |
| Personnes / données | Visiteurs qui choisissent un pseudonyme ; `username`, claim `sub` du JWT, validité du jeton, instrument regardé, userId dans `socket.data` et ensemble de présence. Aucune adresse, mot de passe ou pièce d'identité collectés par l'app. |
| Source / destinataires | Saisie par le visiteur sur `POST /api/auth/token` ; JWT retourné uniquement au navigateur. Le serveur traite l'identifiant en mémoire ; les autres spectateurs authentifiés voient le **nombre** par room, pas la liste des pseudonymes. |
| Conservation réelle | JWT valable **4 h** après émission, mais un socket déjà ouvert n'est pas coupé à l'expiration. Le navigateur garde le token en `sessionStorage` jusqu'à la fermeture de l'onglet ou le bouton Quitter ; le serveur ne garde pas de table de tokens. L'identifiant de présence reste en mémoire tant que la room est regardée, puis **5 s** de grâce après déconnexion, sauf reconnexion. Aucune conservation après arrêt du processus (sans `JWT_SECRET` fixe, ses anciens tokens ne sont plus vérifiables). |
| Mesures / manques | Signature JWT avec clé aléatoire par processus ou `JWT_SECRET` hors dépôt (≥32 octets), contrôle d'origine navigateur, limite de 10 messages/s par socket. Le pseudonyme libre et le socket actif après expiration restent les risques F1/F4 du [rapport](./rapport-audit.md). |

## T-02 — Recevoir et afficher les bids simulés

| Rubrique | Situation effective |
|---|---|
| Finalité | Afficher les offres d'achat et appliquer leur pression bornée au tick de marché suivant ; démontrer un ack et une déduplication temporaire. Aucun ordre bancaire n'est exécuté. |
| Base légale | Candidate : intérêt légitime art. 6(1)(f) pour la démonstration pédagogique, **à valider** par le responsable et l'établissement. |
| Personnes / données | Pseudonyme `userId`, `requestId` (si fourni), instrument, prix, quantité, source, horodatage `creeA` et ID de bid ; les utilisateurs simulés Ada/Linus/etc. ne sont pas des personnes réelles. |
| Source / destinataires | `bid:place` via Socket.IO authentifié ; événement `bid:new` envoyé à tous les clients Socket.IO, historique des **30 derniers** également accessible à **toute personne** par `GET /api/bids`, sans JWT. Ne pas saisir de vrais noms ni de données confidentielles. Le SSE des cotations ne contient **pas** d'identifiant de bid ni de pseudonyme. |
| Conservation réelle | `bidsRecents` : maximum **100 entrées** en mémoire, avec affichage des 30 derniers ; `bidsParRequete` : maximum **1 000 clés** de déduplication en mémoire ; `bidsEnAttente` vidé à chaque tick de **500 ms**. **Aucune durée en jours/heures ni purge temporelle définie** : si le processus reste actif sans nouveaux bids, ces enregistrements restent jusqu'au redémarrage. Le navigateur affiche au plus 30 bids récents et les perd à la fermeture/recharge sauf rechargement par le serveur. |
| Mesures / manques | Validation de l'instrument, du prix et de la quantité, ack, limite par socket ; `requestId` vide échappe à la déduplication (F5), et aucune écriture durable. `GET /api/bids` et l'événement global rendent les pseudonymes publics / visibles à tous les connectés (STRIDE I1). |

## Flux non personnels et sous-traitance

Les cotations et les carnets SSE par instrument ne portent que des prix/niveaux simulés ; aucune personne n'y est nommée. Les connexions réseau exposent techniquement une adresse IP au poste local/OS ; `Fastify({ logger: false })` n'écrit **pas** de journal applicatif d'IP, mais d'éventuels logs du système, du proxy ou de l'établissement **ne sont pas inventoriés** ici. Aucun prestataire de collecte d'erreurs, d'email, de paiement, de stockage ou d'hébergement applicatif n'est configuré. GitHub héberge le **code public et les rapports de CI**, pas les données runtime de la démo locale ; s'assurer de ne pas y publier de captures avec vrais pseudonymes. Contrats art. 28, transferts hors UE et politique institutionnelle : **non vérifiés**, à documenter si le responsable ou le mode d'hébergement change.

## Points d'attention à lever avant tout usage réel

1. **Minimisation / information** : expliquer au participant que son pseudonyme et ses offres sont affichés, dont les 30 derniers bids via un endpoint public ; pas encore de notice de confidentialité dédiée dans l'UI.
2. **Durées** : définir une durée chiffrée et une purge automatique pour T-02 ; « 100 enregistrements maximum » n'est **pas** une durée de conservation.
3. **Base légale / responsabilité** : faire confirmer le responsable, le DPO éventuel et la base légale candidate par l'établissement ; vérifier les journaux IP éventuels avant un déploiement.
4. **Sous-traitance** : requalifier et vérifier les contrats si l'application quitte le poste local ; ne pas attribuer à GitHub un traitement de données runtime qui n'existe pas dans l'architecture actuelle.
