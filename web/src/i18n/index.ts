import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import ptBR from '../locales/pt-BR.json'
import en from '../locales/en.json'

const STORAGE_KEY = 'timoneiro_lang'

function detectLanguage(): string {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'pt-BR' || stored === 'en') return stored
  return 'pt-BR'
}

i18n.use(initReactI18next).init({
  resources: {
    'pt-BR': { translation: ptBR },
    en: { translation: en },
  },
  lng: detectLanguage(),
  fallbackLng: 'pt-BR',
  interpolation: { escapeValue: false },
})

i18n.on('languageChanged', (lng) => {
  localStorage.setItem(STORAGE_KEY, lng)
  document.documentElement.lang = lng
})
document.documentElement.lang = i18n.language

export default i18n
