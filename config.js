"use strict";

const APP_NAME        = "Illumina Browser";
const APP_VERSION     = "4.1.0";
const PARTITION       = "persist:illumina";
const INCOGNITO_PART  = "incognito:illumina";
const STORE_FILENAME  = "store.json";

const FEATURE_FLAGS = {
  enablePip: true,
  enableSplitView: true,
  enableReadingList: false,  // beta
  experimentalFeatures: false
};

const THEMES = [
  { id:"mist",     label:"Mist",         group:"açık"  },
  { id:"paper",    label:"Paper",        group:"açık"  },
  { id:"sand",     label:"Sand",         group:"açık"  },
  { id:"sepia",    label:"Sepia",        group:"açık"  },
  { id:"arctic",   label:"Arctic",       group:"açık"  },
  { id:"rose",     label:"Rose",         group:"açık"  },
  { id:"macos",    label:"macOS",        group:"açık"  },
  { id:"night",    label:"Night",        group:"koyu"  },
  { id:"obsidian", label:"Obsidian",     group:"koyu"  },
  { id:"forest",   label:"Forest",       group:"koyu"  },
  { id:"dusk",     label:"Dusk",         group:"koyu"  },
  { id:"liquid",   label:"Liquid Glass", group:"koyu"  },
];

const UI_FONTS = [
  { id:"",            label:"Sistem (Varsayılan)" },
  { id:"inter",       label:"Inter — Modern sans" },
  { id:"nunito",      label:"Nunito — Yumuşak & rahat" },
  { id:"garamond",    label:"EB Garamond — Kitap serif" },
  { id:"lora",        label:"Lora — Zarif serif" },
  { id:"merriweather",label:"Merriweather — Gazete serif" },
  { id:"playfair",    label:"Playfair Display — Başlık" },
  { id:"jetbrains",   label:"JetBrains Mono — Kod" },
];

const GRAIN_LEVELS = [
  { id:"",       label:"Kapalı" },
  { id:"low",    label:"Az" },
  { id:"medium", label:"Orta" },
  { id:"high",   label:"Yoğun" },
];

const TAB_LAYOUTS = [
  { id:"horizontal", label:"Yatay (Varsayılan)" },
  { id:"vertical",   label:"Dikey (Sol panel)" },
];

const SEARCH_ENGINES = [
  { id:"google",     label:"Google",       template:"https://www.google.com/search?q=%s",      home:"https://www.google.com" },
  { id:"bing",       label:"Bing",          template:"https://www.bing.com/search?q=%s",         home:"https://www.bing.com" },
  { id:"duckduckgo", label:"DuckDuckGo",    template:"https://duckduckgo.com/?q=%s",             home:"https://duckduckgo.com" },
  { id:"yandex",     label:"Yandex",        template:"https://yandex.com/search/?text=%s",       home:"https://yandex.com" },
  { id:"brave",      label:"Brave Search",  template:"https://search.brave.com/search?q=%s",     home:"https://search.brave.com" },
  { id:"ecosia",     label:"Ecosia",        template:"https://www.ecosia.org/search?q=%s",       home:"https://www.ecosia.org" },
];

const TRANSLATE_ENGINES = [
  { id:"google",        label:"Google Translate",   note:"Ücretsiz, hızlı" },
  { id:"deepl",         label:"DeepL",              note:"Yüksek kalite" },
  { id:"libretranslate",label:"LibreTranslate",     note:"Açık kaynak, kendi sunucun" },
];

const SECURITY_MODES = [
  { id:"standard", label:"Standard" },
  { id:"balanced", label:"Dengeli"  },
  { id:"strict",   label:"Sıkı"    },
];

const START_PAGE_MODES = [
  { id:"welcome",       label:"Karşılama ekranı" },
  { id:"search-engine", label:"Varsayılan arama motoru" },
];

const FONT_SIZES = [
  { id:"small",  label:"Küçük (12px)"  },
  { id:"medium", label:"Normal (13px)" },
  { id:"large",  label:"Büyük (15px)"  },
];

const LANGUAGES = [
  { id:"tr", label:"Türkçe" },
  { id:"en", label:"English" },
  { id:"de", label:"Deutsch" },
  { id:"fr", label:"Français" },
  { id:"es", label:"Español" },
  { id:"ru", label:"Русский" },
  { id:"ar", label:"العربية" },
  { id:"ja", label:"日本語" },
  { id:"zh", label:"中文" },
];

const DEFAULT_SETTINGS = {
  theme:              "mist",
  searchEngine:       "google",
  startPageMode:      "welcome",
  restoreTabs:        true,
  openWelcomeOnStart: true,
  securityMode:       "standard",
  allowNotifications: false,
  allowLocation:      false,
  allowCamera:        false,
  allowMicrophone:    false,
  allowPopups:        true,
  httpsOnly:          false,
  extensions:         [],
  tabSleepMinutes:    20,
  showFullUrl:        false,
  fontSize:           "medium",
  showBookmarkStrip:  true,
  customCss:          "",
  safeBrowsingApiKey: "",
  safeCheckEnabled:   true,
  // Gizlilik
  blockWebRTC:        false,
  blockCanvas:        false,
  blockAutoplay:      false,
  spoofUserAgent:     false,
  hideReferrer:       false,
  dohEnabled:         false,
  // Görünüm (eski alanlar — geriye dönük uyumluluk)
  pageSerifFont:      "",
  pageSansFont:       "",
  pageMonoFont:       "",
  useCustomWelcome:   false,
  customWelcomeHtml:  "",
  // Dil
  language:           "tr",
  // Görünüm ek
  uiFont:             "",
  grainLevel:         "",
  tabLayout:          "horizontal",
  bgPhotoPath:        "",
  profilePhoto:       "",
  profileName:        "",
  // Reklam engelleyici
  adBlockEnabled:     true,
  // Çeviri motoru
  translateEngine:       "google",
  translateTargetLang:   "tr",
  libreTranslateUrl:     "https://libretranslate.com",
  // Polish & animasyon
  animSpeed:          "normal",
  warmNightMode:      false,
  soundEnabled:       false,
  magneticButtons:    false,
};

const DEFAULT_SHORTCUTS = [
  { id:"sc-1", title:"Google",    url:"https://www.google.com" },
  { id:"sc-2", title:"YouTube",   url:"https://www.youtube.com" },
  { id:"sc-3", title:"Wikipedia", url:"https://www.wikipedia.org" },
  { id:"sc-4", title:"GitHub",    url:"https://www.github.com" },
];

const DEFAULT_STORE = {
  settings:        DEFAULT_SETTINGS,
  bookmarks:       [],
  bmFolders:       [],
  history:         [],
  downloads:       [],
  shortcuts:       [],
  notes:           "",
  passwords:       [],
  sessions:        [],
  clipboardHistory:[],
  notifications:   [],
  stickyNotes:     {},
  session:         { tabs:[], activeTabId:null },
};

module.exports = {
  APP_NAME, APP_VERSION, PARTITION, INCOGNITO_PART, STORE_FILENAME,
  THEMES, UI_FONTS, GRAIN_LEVELS, TAB_LAYOUTS,
  SEARCH_ENGINES, TRANSLATE_ENGINES, SECURITY_MODES, START_PAGE_MODES, FONT_SIZES, LANGUAGES,
  DEFAULT_SETTINGS, DEFAULT_SHORTCUTS, DEFAULT_STORE, FEATURE_FLAGS
};
