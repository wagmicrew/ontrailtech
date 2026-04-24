import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  en: {
    translation: {
      'app.title': 'OnTrail',
      'nav.explore': 'Explore',
      'nav.trailLab': 'Trail Lab',
      'nav.tokens': 'Tokens',
      'nav.profile': 'Profile',
      'auth.connect': 'Connect Wallet',
      'poi.mint': 'Mint POI',
      'poi.nearby': 'Nearby POIs',
    },
  },
};

i18n.use(initReactI18next).init({
  resources,
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;
