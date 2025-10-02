/**
 * Country detection module with priority logic:
 * 1. Contacts/About addresses (HIGH confidence)
 * 2. Phone dial code E.164 (HIGH confidence)
 * 3. ccTLD weak match (WEAK confidence, except .com/.net)
 * 4. LLM fallback (LLM confidence)
 */

export type CountryConfidence = "HIGH" | "WEAK" | "LLM";

export type CountryResult = {
  countryISO2: string;
  countryName: string;
  confidence: CountryConfidence;
};

// Map of country names to ISO-2 codes
const COUNTRY_NAMES: Record<string, string> = {
  "afghanistan": "AF", "albania": "AL", "algeria": "DZ", "andorra": "AD",
  "angola": "AO", "argentina": "AR", "armenia": "AM", "australia": "AU",
  "austria": "AT", "azerbaijan": "AZ", "bahrain": "BH", "bangladesh": "BD",
  "belarus": "BY", "belgium": "BE", "bolivia": "BO", "bosnia": "BA",
  "botswana": "BW", "brazil": "BR", "brunei": "BN", "bulgaria": "BG",
  "cambodia": "KH", "cameroon": "CM", "canada": "CA", "chile": "CL",
  "china": "CN", "colombia": "CO", "congo": "CG", "costa rica": "CR",
  "croatia": "HR", "cuba": "CU", "cyprus": "CY", "czech republic": "CZ",
  "czechia": "CZ", "denmark": "DK", "dominican republic": "DO",
  "ecuador": "EC", "egypt": "EG", "estonia": "EE", "ethiopia": "ET",
  "finland": "FI", "france": "FR", "georgia": "GE", "germany": "DE",
  "ghana": "GH", "greece": "GR", "guatemala": "GT", "honduras": "HN",
  "hong kong": "HK", "hungary": "HU", "iceland": "IS", "india": "IN",
  "indonesia": "ID", "iran": "IR", "iraq": "IQ", "ireland": "IE",
  "israel": "IL", "italy": "IT", "jamaica": "JM", "japan": "JP",
  "jordan": "JO", "kazakhstan": "KZ", "kenya": "KE", "korea": "KR",
  "south korea": "KR", "kuwait": "KW", "latvia": "LV", "lebanon": "LB",
  "libya": "LY", "lithuania": "LT", "luxembourg": "LU", "malaysia": "MY",
  "malta": "MT", "mexico": "MX", "moldova": "MD", "monaco": "MC",
  "mongolia": "MN", "morocco": "MA", "mozambique": "MZ", "myanmar": "MM",
  "nepal": "NP", "netherlands": "NL", "new zealand": "NZ", "nicaragua": "NI",
  "nigeria": "NG", "norway": "NO", "oman": "OM", "pakistan": "PK",
  "panama": "PA", "paraguay": "PY", "peru": "PE", "philippines": "PH",
  "poland": "PL", "portugal": "PT", "qatar": "QA", "romania": "RO",
  "russia": "RU", "russian federation": "RU", "saudi arabia": "SA",
  "senegal": "SN", "serbia": "RS", "singapore": "SG", "slovakia": "SK",
  "slovenia": "SI", "south africa": "ZA", "spain": "ES", "sri lanka": "LK",
  "sweden": "SE", "switzerland": "CH", "syria": "SY", "taiwan": "TW",
  "tanzania": "TZ", "thailand": "TH", "tunisia": "TN", "turkey": "TR",
  "uganda": "UG", "ukraine": "UA", "united arab emirates": "AE", "uae": "AE",
  "united kingdom": "GB", "uk": "GB", "great britain": "GB",
  "united states": "US", "usa": "US", "us": "US", "america": "US",
  "uruguay": "UY", "uzbekistan": "UZ", "venezuela": "VE", "vietnam": "VN",
  "yemen": "YE", "zambia": "ZM", "zimbabwe": "ZW",
};

// ISO-2 to country name
const ISO2_TO_NAME: Record<string, string> = {
  "AF": "Afghanistan", "AL": "Albania", "DZ": "Algeria", "AD": "Andorra",
  "AO": "Angola", "AR": "Argentina", "AM": "Armenia", "AU": "Australia",
  "AT": "Austria", "AZ": "Azerbaijan", "BH": "Bahrain", "BD": "Bangladesh",
  "BY": "Belarus", "BE": "Belgium", "BO": "Bolivia", "BA": "Bosnia and Herzegovina",
  "BW": "Botswana", "BR": "Brazil", "BN": "Brunei", "BG": "Bulgaria",
  "KH": "Cambodia", "CM": "Cameroon", "CA": "Canada", "CL": "Chile",
  "CN": "China", "CO": "Colombia", "CG": "Congo", "CR": "Costa Rica",
  "HR": "Croatia", "CU": "Cuba", "CY": "Cyprus", "CZ": "Czech Republic",
  "DK": "Denmark", "DO": "Dominican Republic", "EC": "Ecuador", "EG": "Egypt",
  "EE": "Estonia", "ET": "Ethiopia", "FI": "Finland", "FR": "France",
  "GE": "Georgia", "DE": "Germany", "GH": "Ghana", "GR": "Greece",
  "GT": "Guatemala", "HN": "Honduras", "HK": "Hong Kong", "HU": "Hungary",
  "IS": "Iceland", "IN": "India", "ID": "Indonesia", "IR": "Iran",
  "IQ": "Iraq", "IE": "Ireland", "IL": "Israel", "IT": "Italy",
  "JM": "Jamaica", "JP": "Japan", "JO": "Jordan", "KZ": "Kazakhstan",
  "KE": "Kenya", "KR": "South Korea", "KW": "Kuwait", "LV": "Latvia",
  "LB": "Lebanon", "LY": "Libya", "LT": "Lithuania", "LU": "Luxembourg",
  "MY": "Malaysia", "MT": "Malta", "MX": "Mexico", "MD": "Moldova",
  "MC": "Monaco", "MN": "Mongolia", "MA": "Morocco", "MZ": "Mozambique",
  "MM": "Myanmar", "NP": "Nepal", "NL": "Netherlands", "NZ": "New Zealand",
  "NI": "Nicaragua", "NG": "Nigeria", "NO": "Norway", "OM": "Oman",
  "PK": "Pakistan", "PA": "Panama", "PY": "Paraguay", "PE": "Peru",
  "PH": "Philippines", "PL": "Poland", "PT": "Portugal", "QA": "Qatar",
  "RO": "Romania", "RU": "Russia", "SA": "Saudi Arabia", "SN": "Senegal",
  "RS": "Serbia", "SG": "Singapore", "SK": "Slovakia", "SI": "Slovenia",
  "ZA": "South Africa", "ES": "Spain", "LK": "Sri Lanka", "SE": "Sweden",
  "CH": "Switzerland", "SY": "Syria", "TW": "Taiwan", "TZ": "Tanzania",
  "TH": "Thailand", "TN": "Tunisia", "TR": "Turkey", "UG": "Uganda",
  "UA": "Ukraine", "AE": "United Arab Emirates", "GB": "United Kingdom",
  "US": "United States", "UY": "Uruguay", "UZ": "Uzbekistan",
  "VE": "Venezuela", "VN": "Vietnam", "YE": "Yemen", "ZM": "Zambia", "ZW": "Zimbabwe",
};

// E.164 dial codes to ISO-2 (most common ones)
const DIAL_CODE_TO_ISO2: Record<string, string> = {
  "1": "US", // Also CA, but US is more common
  "7": "RU", "20": "EG", "27": "ZA", "30": "GR", "31": "NL", "32": "BE",
  "33": "FR", "34": "ES", "36": "HU", "39": "IT", "40": "RO", "41": "CH",
  "43": "AT", "44": "GB", "45": "DK", "46": "SE", "47": "NO", "48": "PL",
  "49": "DE", "51": "PE", "52": "MX", "53": "CU", "54": "AR", "55": "BR",
  "56": "CL", "57": "CO", "58": "VE", "60": "MY", "61": "AU", "62": "ID",
  "63": "PH", "64": "NZ", "65": "SG", "66": "TH", "81": "JP", "82": "KR",
  "84": "VN", "86": "CN", "90": "TR", "91": "IN", "92": "PK", "93": "AF",
  "94": "LK", "95": "MM", "98": "IR", "212": "MA", "213": "DZ", "216": "TN",
  "218": "LY", "220": "GM", "234": "NG", "351": "PT", "352": "LU",
  "353": "IE", "354": "IS", "355": "AL", "356": "MT", "357": "CY",
  "358": "FI", "359": "BG", "370": "LT", "371": "LV", "372": "EE",
  "373": "MD", "374": "AM", "375": "BY", "376": "AD", "377": "MC",
  "378": "SM", "380": "UA", "381": "RS", "382": "ME", "385": "HR",
  "386": "SI", "387": "BA", "389": "MK", "420": "CZ", "421": "SK",
  "880": "BD", "960": "MV", "961": "LB", "962": "JO", "963": "SY",
  "964": "IQ", "965": "KW", "966": "SA", "967": "YE", "968": "OM",
  "971": "AE", "972": "IL", "973": "BH", "974": "QA", "975": "BT",
  "976": "MN", "977": "NP", "992": "TJ", "993": "TM", "994": "AZ",
  "995": "GE", "996": "KG", "998": "UZ",
};

// ccTLD to ISO-2 (excluding generic ones)
const CCTLD_TO_ISO2: Record<string, string> = {
  ".af": "AF", ".al": "AL", ".dz": "DZ", ".ad": "AD", ".ao": "AO",
  ".ar": "AR", ".am": "AM", ".au": "AU", ".at": "AT", ".az": "AZ",
  ".bh": "BH", ".bd": "BD", ".by": "BY", ".be": "BE", ".bo": "BO",
  ".ba": "BA", ".bw": "BW", ".br": "BR", ".bn": "BN", ".bg": "BG",
  ".kh": "KH", ".cm": "CM", ".ca": "CA", ".cl": "CL", ".cn": "CN",
  ".co": "CO", ".cg": "CG", ".cr": "CR", ".hr": "HR", ".cu": "CU",
  ".cy": "CY", ".cz": "CZ", ".dk": "DK", ".do": "DO", ".ec": "EC",
  ".eg": "EG", ".ee": "EE", ".et": "ET", ".fi": "FI", ".fr": "FR",
  ".ge": "GE", ".de": "DE", ".gh": "GH", ".gr": "GR", ".gt": "GT",
  ".hn": "HN", ".hk": "HK", ".hu": "HU", ".is": "IS", ".in": "IN",
  ".id": "ID", ".ir": "IR", ".iq": "IQ", ".ie": "IE", ".il": "IL",
  ".it": "IT", ".jm": "JM", ".jp": "JP", ".jo": "JO", ".kz": "KZ",
  ".ke": "KE", ".kr": "KR", ".kw": "KW", ".lv": "LV", ".lb": "LB",
  ".ly": "LY", ".lt": "LT", ".lu": "LU", ".my": "MY", ".mt": "MT",
  ".mx": "MX", ".md": "MD", ".mc": "MC", ".mn": "MN", ".ma": "MA",
  ".mz": "MZ", ".mm": "MM", ".np": "NP", ".nl": "NL", ".nz": "NZ",
  ".ni": "NI", ".ng": "NG", ".no": "NO", ".om": "OM", ".pk": "PK",
  ".pa": "PA", ".py": "PY", ".pe": "PE", ".ph": "PH", ".pl": "PL",
  ".pt": "PT", ".qa": "QA", ".ro": "RO", ".ru": "RU", ".sa": "SA",
  ".sn": "SN", ".rs": "RS", ".sg": "SG", ".sk": "SK", ".si": "SI",
  ".za": "ZA", ".es": "ES", ".lk": "LK", ".se": "SE", ".ch": "CH",
  ".sy": "SY", ".tw": "TW", ".tz": "TZ", ".th": "TH", ".tn": "TN",
  ".tr": "TR", ".ug": "UG", ".ua": "UA", ".ae": "AE", ".uk": "GB",
  ".us": "US", ".uy": "UY", ".uz": "UZ", ".ve": "VE", ".vn": "VN",
  ".ye": "YE", ".zm": "ZM", ".zw": "ZW",
};

/**
 * Extract country from text content (addresses, explicit country mentions)
 */
export function detectCountryFromText(text: string): CountryResult | null {
  if (!text) return null;
  
  const lower = text.toLowerCase();
  
  // Look for country names with word boundaries
  for (const [name, iso2] of Object.entries(COUNTRY_NAMES)) {
    // Use word boundaries to avoid partial matches
    const regex = new RegExp(`\\b${name}\\b`, "i");
    if (regex.test(lower)) {
      return {
        countryISO2: iso2,
        countryName: ISO2_TO_NAME[iso2] || name,
        confidence: "HIGH",
      };
    }
  }
  
  return null;
}

/**
 * Extract country from phone numbers (E.164 dial codes)
 */
export function detectCountryFromPhone(phone: string): CountryResult | null {
  if (!phone) return null;
  
  // Extract digits from phone
  const digits = phone.replace(/\D/g, "");
  
  // Try to match dial codes (longest first)
  const codes = Object.keys(DIAL_CODE_TO_ISO2).sort((a, b) => b.length - a.length);
  for (const code of codes) {
    if (digits.startsWith(code)) {
      const iso2 = DIAL_CODE_TO_ISO2[code];
      return {
        countryISO2: iso2,
        countryName: ISO2_TO_NAME[iso2] || iso2,
        confidence: "HIGH",
      };
    }
  }
  
  return null;
}

/**
 * Extract country from domain (ccTLD)
 */
export function detectCountryFromDomain(domain: string): CountryResult | null {
  if (!domain) return null;
  
  const lower = domain.toLowerCase();
  
  // Extract TLD
  const parts = lower.split(".");
  if (parts.length < 2) return null;
  
  const tld = "." + parts[parts.length - 1];
  
  // Skip generic TLDs
  if ([".com", ".net", ".org", ".biz", ".info", ".io"].includes(tld)) {
    return null;
  }
  
  const iso2 = CCTLD_TO_ISO2[tld];
  if (iso2) {
    return {
      countryISO2: iso2,
      countryName: ISO2_TO_NAME[iso2] || iso2,
      confidence: "WEAK",
    };
  }
  
  return null;
}

/**
 * Comprehensive country detection with priority logic
 */
export function detectCountry(data: {
  text?: string;
  phones?: string[];
  domain?: string;
  llmCountryISO2?: string | null;
  llmCountryName?: string | null;
}): CountryResult {
  // 1. Try text (addresses, explicit mentions)
  if (data.text) {
    const fromText = detectCountryFromText(data.text);
    if (fromText) return fromText;
  }
  
  // 2. Try phone numbers
  if (data.phones && data.phones.length > 0) {
    for (const phone of data.phones) {
      const fromPhone = detectCountryFromPhone(phone);
      if (fromPhone) return fromPhone;
    }
  }
  
  // 3. Try domain (weak)
  if (data.domain) {
    const fromDomain = detectCountryFromDomain(data.domain);
    if (fromDomain) return fromDomain;
  }
  
  // 4. Use LLM result if available
  if (data.llmCountryISO2 && /^[A-Z]{2}$/i.test(data.llmCountryISO2)) {
    const iso2 = data.llmCountryISO2.toUpperCase();
    return {
      countryISO2: iso2,
      countryName: data.llmCountryName || ISO2_TO_NAME[iso2] || iso2,
      confidence: "LLM",
    };
  }
  
  // 5. Default fallback (use a neutral default or mark as unknown)
  return {
    countryISO2: "XX",
    countryName: "Unknown",
    confidence: "WEAK",
  };
}
