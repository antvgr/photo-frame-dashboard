# Home Screen : un tableau de bord Home Assistant pour cadre photo Android

Un dashboard plein écran pour un cadre photo Android verrouillé (testé sur un PF1007L, Allwinner A33, Android 6.0.1, WebView 106), piloté par Home Assistant. Tout est en JavaScript sans framework, avec Vite pour la construction. L'interface est en français.

Le dashboard tient dans une scène fixe de 1280×800 (paysage) ou 800×1280 (portrait), mise à l'échelle de l'écran.

## Ce que ça affiche

- **Accueil** : horloge dont le fond suit le soleil et la météo, météo avec chances de pluie, agenda des 24 h par personne, Vélib', qualité de l'air, carte « Maison » (température moyenne, chauffage, clim, lumières, aspirateur), carte musique avec pochette, et une bande de pastilles pour les appareils en route.
- **Électroménager** : four, lave-linge, lave-vaisselle et machine à café sur une page plein écran, avec une animation par étape (prélavage, lavage, rinçage, essorage, séchage, préchauffage, cuisson…), le temps restant et l'étape en cours. Plusieurs appareils s'affichent côte à côte (en lignes en portrait).
- **Lecteur** plein écran, **agenda** (jour, 3 jours, semaine, mois), **domotique** (pièces, chauffage, clim), **écran de veille** avec les appareils en cours.
- **Réglages** par appui long sur l'heure : thème, luminosité (capteur de lumière avec courbe réglable), orientation, Wi-Fi.

## Essayer sans Home Assistant

```bash
cd photo-frame-dashboard/dashboard
npm install
npm run dev
```

Puis ouvrez par exemple :

- `http://localhost:5173/?view=home&m=linge:rinse,vaisselle:done,four:cook`
- `http://localhost:5173/?view=machines&m=linge:spin&sel=linge`
- `http://localhost:5173/?view=ambient&m=linge:wash`

Sans jeton, `js/demo-scenes.js` charge une maison fictive. Les étapes possibles pour `m=` : `pre`, `wash`, `rinse`, `spin`, `dry`, `cook`, `brew`, `heat`, `done`.

## Brancher votre Home Assistant

1. Modifiez `js/config.js` : adresse de Home Assistant, personnes, pièces, lumières, capteurs, appareils. Les identifiants d'exemple n'existent pas chez vous. Une carte sans entité se masque.
2. Créez un utilisateur non administrateur dans Home Assistant et un **jeton longue durée** (Profil → Sécurité). Le jeton n'est jamais dans le code : donnez-le une fois avec `?ha_token=…` dans l'adresse, il est gardé dans le navigateur puis retiré de l'adresse. Sur le cadre, `../tools/set-ha-token.ps1` le transmet au kiosque sans le laisser sur le PC.
3. Construisez et publiez : `../tools/deploy-to-ha.ps1` copie le dashboard dans `www/cadre` de Home Assistant (partage Samba), il est alors servi sur `http://<home-assistant>:8123/local/cadre/index.html`.

Appareils pris en charge par défaut : four et lave-linge Samsung via l'intégration LocalThings, lave-vaisselle et machine à café Bosch via Home Connect. D'autres marques demandent d'adapter `syncMachines()` dans `js/ha.js`.

## Le kiosque Android

`kiosk` est une petite application Android (WebView plein écran, luminosité, orientation, Wi-Fi). `../tools/build-kiosk.ps1` la compile sans Gradle (aapt2, javac, d8, apksigner) avec un dossier `android-build/` contenant un SDK, un JDK et une clé de debug. Installation : `adb install -r android-build/kiosk-build/homehq.apk`. Adaptez `DEFAULT_URL` dans `MainActivity.java`.

Pour obtenir ADB et remplacer l’application d’origine du cadre, suivez les guides à la racine de ce dépôt (`docs/`).

## Vie privée

- Le dashboard ne parle qu'à Home Assistant. Les polices et les icônes sont dans le dépôt, rien n'est chargé depuis Internet.
- Le jeton est stocké dans le navigateur ou le kiosque, jamais dans un fichier du dépôt.
- `?anon` masque une personne et le nom de la station Vélib' (mode capture d'écran, réglé dans `config.js`).

## Crédits

Fork de [wesbos/photo-frame-dashboard](https://github.com/wesbos/photo-frame-dashboard) (recherche sur les cadres Android, kiosque de base). Icônes Font Awesome Free (voir `public/FONTAWESOME-LICENSE.txt`), météo animée Meteocons, police DM Sans (licence OFL).


