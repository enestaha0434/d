// ══════════════════════════════════════════════════════════════════════════════
// SAFETY ENGINE — Katman 1 (kural tabanlı) + Katman 2 (URLhaus) + Katman 3 (GSB)
// ══════════════════════════════════════════════════════════════════════════════

const https = require("https");

// ── Risk seviyeleri ───────────────────────────────────────────────────────────
// safe | info | warning | danger | blocked
// safe    → normal kilit, yeşil
// info    → mavi bilgi (http ama normal site)
// warning → sarı ünlem (şüpheli pattern)
// danger  → turuncu/kırmızı ünlem (yüksek risk)
// blocked → tam ekran uyarı (URLhaus/GSB hit)

// ── Katman 1: Kural tabanlı analiz ───────────────────────────────────────────
const FREE_TLDS = new Set([
  "tk","ml","ga","cf","gq","pw","xyz","top","click","link","win","review",
  "science","party","racing","loan","download","faith","bid","trade","cricket",
  "accountant","webcam","date","men","work","kim","country"
]);

// Büyük markaların canonical domain'leri
const BRAND_DOMAINS = {
  "paypal":    ["paypal.com","paypal.com.tr"],
  "google":    ["google.com","google.com.tr","googleapis.com","googlevideo.com"],
  "microsoft": ["microsoft.com","microsoftonline.com","live.com","outlook.com","bing.com","azure.com"],
  "apple":     ["apple.com","icloud.com","appleid.apple.com"],
  "amazon":    ["amazon.com","amazon.com.tr","aws.amazon.com"],
  "facebook":  ["facebook.com","fb.com","instagram.com","whatsapp.com"],
  "netflix":   ["netflix.com"],
  "twitter":   ["twitter.com","x.com","t.co"],
  "linkedin":  ["linkedin.com"],
  "github":    ["github.com","githubusercontent.com"],
  "youtube":   ["youtube.com","youtu.be"],
  "dropbox":   ["dropbox.com"],
  "ebay":      ["ebay.com"],
  "steam":     ["steampowered.com","steamcommunity.com"],
};

// İzin verilen güvenilir TLD'ler (bunlarda katman1 kuralları gevşer)
const TRUSTED_TLDS = new Set([
  "gov","edu","gov.tr","edu.tr","mil","ac.uk","gov.uk"
]);

function homographCheck(hostname) {
  // Görsel benzer karakter tespiti (basit versiyon)
  const subs = { "0":"o","1":"l","3":"e","4":"a","5":"s","6":"g","8":"b","@":"a","vv":"w","rn":"m" };
  let modified = hostname.toLowerCase();
  for (const [k,v] of Object.entries(subs)) modified = modified.replaceAll(k, v);
  return modified !== hostname.toLowerCase();
}

function hasSuspiciousKeywords(hostname) {
  const keywords = [
    "login","signin","secure","account","verify","update","confirm","banking",
    "paypal","microsoft","apple","google","amazon","facebook","netflix",
    "wallet","crypto","password","credential","auth","oauth","token",
    "support","helpdesk","recovery","suspended","locked","unusual"
  ];
  const lower = hostname.toLowerCase();
  return keywords.some(k => lower.includes(k));
}

function getRegistrableDomain(hostname) {
  // Simple: take last two parts (e.g. google.com from mail.google.com)
  const parts = hostname.split(".");
  if (parts.length <= 2) return hostname;
  // Handle country code SLDs like .co.uk, .com.tr
  const last2 = parts.slice(-2).join(".");
  const knownSLDs = ["co.uk","com.tr","org.tr","net.tr","com.au","co.nz","co.jp"];
  if (knownSLDs.includes(last2)) return parts.slice(-3).join(".");
  return last2;
}

function analyzeLayer1(url) {
  let parsed;
  try { parsed = new URL(url); } catch(_) { return { level:"safe", reasons:[] }; }

  const hostname   = parsed.hostname.toLowerCase();
  const tld        = hostname.split(".").pop();
  const registrable = getRegistrableDomain(hostname);
  const subdepth   = hostname.split(".").length - 2;
  const reasons    = [];
  let   maxLevel   = "safe";

  const setLevel = (lvl) => {
    const order = ["safe","info","warning","danger","blocked"];
    if (order.indexOf(lvl) > order.indexOf(maxLevel)) maxLevel = lvl;
  };

  // 1. HTTP (şifresiz)
  if (parsed.protocol === "http:") {
    if (hasSuspiciousKeywords(hostname)) {
      reasons.push("HTTP üzerinden şüpheli anahtar kelimeler içeriyor");
      setLevel("danger");
    } else {
      reasons.push("Bağlantı şifrelenmemiş (HTTP)");
      setLevel("info");
    }
  }

  // 2. IP adresi URL
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(hostname)) {
    reasons.push("IP adresi üzerinden bağlantı — domain yok");
    setLevel("danger");
  }

  // 3. Güvenilir TLD ise katman1'i atla
  const isTrusted = Array.from(TRUSTED_TLDS).some(t => hostname.endsWith("." + t) || hostname === t);
  if (isTrusted) return { level:"safe", reasons:[] };

  // 4. Ücretsiz/spam TLD
  if (FREE_TLDS.has(tld)) {
    reasons.push(`"${tld}" uzantısı genellikle ücretsiz/spam domainlerde kullanılır`);
    setLevel("warning");
  }

  // 5. Çok derin subdomain (login.secure.verify.paypal.xyz gibi)
  if (subdepth >= 3) {
    reasons.push(`Çok derin subdomain zinciri (${subdepth} seviye)`);
    setLevel("warning");
    if (subdepth >= 5) setLevel("danger");
  }

  // 6. Homograph (0 yerine o, 1 yerine l vb.)
  if (homographCheck(hostname)) {
    reasons.push("Alan adında görsel aldatmaca karakterler var");
    setLevel("danger");
  }

  // 7. Marka adı + yanlış domain (paypa1.com, g00gle.net)
  for (const [brand, trustedDomains] of Object.entries(BRAND_DOMAINS)) {
    const isLegit = trustedDomains.some(d => registrable === d || hostname === d || hostname.endsWith("." + d));
    if (!isLegit && hostname.includes(brand)) {
      reasons.push(`"${brand}" marka adını taklit ediyor olabilir`);
      setLevel("danger");
    }
  }

  // 8. Çok uzun hostname (genellikle phishing subdomain)
  if (hostname.length > 50) {
    reasons.push("Alan adı olağandışı şekilde uzun");
    setLevel("warning");
  }

  // 9. Çoklu tire (secure--login--paypal.com tarzı)
  if ((hostname.match(/-/g)||[]).length >= 3) {
    reasons.push("Alan adında çok sayıda tire karakteri");
    setLevel("warning");
  }

  // 10. Sayısal domain (1234567.com phishing aracı)
  if (/^\d+\.\w+$/.test(hostname)) {
    reasons.push("Tamamen sayısal alan adı");
    setLevel("warning");
  }

  return { level: maxLevel, reasons };
}

// ── Katman 2: URLhaus (abuse.ch) — malware URL veritabanı ────────────────────
async function checkURLhaus(url) {
  return new Promise((resolve) => {
    const postData = `url=${encodeURIComponent(url)}`;
    const req = https.request({
      hostname: "urlhaus-api.abuse.ch",
      path: "/v1/url/",
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(postData),
      },
      timeout: 4000,
    }, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          // query_status: "is_host" | "is_domain" | "is_url" = found, "no_results" = clean
          const HIT_STATUSES = new Set(["is_host", "is_domain", "is_url"]);
          if (HIT_STATUSES.has(json.query_status)) {
            // "is_url" = tam URL eşleşmesi (en kesin), diğerleri domain/host seviyesi
            const exact = json.query_status === "is_url";
            resolve({ hit: true, threat: json.threat || "malware", url: json.url, exact });
          } else {
            resolve({ hit: false });
          }
        } catch(_) { resolve({ hit: false }); }
      });
    });
    req.on("error", () => resolve({ hit: false }));
    req.on("timeout", () => { req.destroy(); resolve({ hit: false }); });
    req.write(postData);
    req.end();
  });
}

// ── Katman 3: Google Safe Browsing ───────────────────────────────────────────
async function checkGoogleSafeBrowsing(url, apiKey) {
  if (!apiKey || !apiKey.trim()) return { hit: false };
  return new Promise((resolve) => {
    const body = JSON.stringify({
      client: { clientId: "illumina-browser", clientVersion: "2.0.0" },
      threatInfo: {
        threatTypes: ["MALWARE","SOCIAL_ENGINEERING","UNWANTED_SOFTWARE","POTENTIALLY_HARMFUL_APPLICATION"],
        platformTypes: ["ANY_PLATFORM"],
        threatEntryTypes: ["URL"],
        threatEntries: [{ url }],
      },
    });
    const req = https.request({
      hostname: "safebrowsing.googleapis.com",
      path: `/v4/threatMatches:find?key=${apiKey.trim()}`,
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
      timeout: 5000,
    }, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          if (json.matches && json.matches.length > 0) {
            const type = json.matches[0].threatType;
            resolve({ hit: true, type });
          } else {
            resolve({ hit: false });
          }
        } catch(_) { resolve({ hit: false }); }
      });
    });
    req.on("error", () => resolve({ hit: false }));
    req.on("timeout", () => { req.destroy(); resolve({ hit: false }); });
    req.write(body);
    req.end();
  });
}

// ── Ana kontrol fonksiyonu ────────────────────────────────────────────────────
// Döndürür: { level, reasons, source }
// level: "safe" | "info" | "warning" | "danger" | "blocked"
async function checkUrl(url, settings) {
  if (!settings.safeCheckEnabled) return { level:"safe", reasons:[], source:"disabled" };

  // İç sayfaları atla
  if (url.startsWith("file://") || url.startsWith("about:") || url.startsWith("data:")) {
    return { level:"safe", reasons:[], source:"internal" };
  }

  // Katman 1 — hızlı kural analizi (senkron)
  const layer1 = analyzeLayer1(url);

  // Katman 2 (URLhaus) + Katman 3 (GSB) paralel çalıştır
  const [urlhaus, gsb] = await Promise.all([
    checkURLhaus(url),
    checkGoogleSafeBrowsing(url, settings.safeBrowsingApiKey || ""),
  ]);

  // GSB hit → her zaman blocked
  if (gsb.hit) {
    const typeLabels = {
      MALWARE:                     "Zararlı yazılım (Google tespiti)",
      SOCIAL_ENGINEERING:          "Phishing / dolandırıcılık (Google tespiti)",
      UNWANTED_SOFTWARE:           "İstenmeyen yazılım (Google tespiti)",
      POTENTIALLY_HARMFUL_APPLICATION:"Zararlı uygulama (Google tespiti)",
    };
    return {
      level:   "blocked",
      reasons: [typeLabels[gsb.type] || "Google Safe Browsing tarafından tehlikeli olarak işaretlendi"],
      source:  "google_safe_browsing",
    };
  }

  // URLhaus hit → blocked
  if (urlhaus.hit) {
    const precision = urlhaus.exact
      ? "Bu tam URL zararlı yazılım olarak işaretlenmiş (URLhaus / abuse.ch)"
      : "Bu domain zararlı yazılım dağıtımıyla ilişkilendirilmiş (URLhaus / abuse.ch)";
    return {
      level:   "blocked",
      reasons: [precision, urlhaus.threat ? `Tehdit türü: ${urlhaus.threat}` : ""].filter(Boolean),
      source:  "urlhaus",
    };
  }

  // Katman 1 sonucu
  return { ...layer1, source: "layer1" };
}

module.exports = { checkUrl, analyzeLayer1 };