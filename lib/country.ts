// lib/country.ts
// Country detection with confidence levels

export type CountryConfidence = "HIGH" | "WEAK";

export interface CountryDetection {
  iso2: string; // ISO-2 country code (e.g., "DE", "CN", "LU")
  confidence: CountryConfidence;
  confidenceScore: number; // 0.0 - 1.0
  source: "WORD" | "PHONE" | "TLD";
}

// Phone prefix to ISO-2 mapping (E.164)
const PHONE_PREFIXES: Record<string, string> = {
  "1": "US",
  "7": "RU",
  "20": "EG",
  "27": "ZA",
  "30": "GR",
  "31": "NL",
  "32": "BE",
  "33": "FR",
  "34": "ES",
  "36": "HU",
  "39": "IT",
  "40": "RO",
  "41": "CH",
  "43": "AT",
  "44": "GB",
  "45": "DK",
  "46": "SE",
  "47": "NO",
  "48": "PL",
  "49": "DE",
  "51": "PE",
  "52": "MX",
  "53": "CU",
  "54": "AR",
  "55": "BR",
  "56": "CL",
  "57": "CO",
  "58": "VE",
  "60": "MY",
  "61": "AU",
  "62": "ID",
  "63": "PH",
  "64": "NZ",
  "65": "SG",
  "66": "TH",
  "81": "JP",
  "82": "KR",
  "84": "VN",
  "86": "CN",
  "90": "TR",
  "91": "IN",
  "92": "PK",
  "93": "AF",
  "94": "LK",
  "95": "MM",
  "98": "IR",
  "212": "MA",
  "213": "DZ",
  "216": "TN",
  "218": "LY",
  "220": "GM",
  "221": "SN",
  "222": "MR",
  "223": "ML",
  "224": "GN",
  "225": "CI",
  "226": "BF",
  "227": "NE",
  "228": "TG",
  "229": "BJ",
  "230": "MU",
  "231": "LR",
  "232": "SL",
  "233": "GH",
  "234": "NG",
  "235": "TD",
  "236": "CF",
  "237": "CM",
  "238": "CV",
  "239": "ST",
  "240": "GQ",
  "241": "GA",
  "242": "CG",
  "243": "CD",
  "244": "AO",
  "245": "GW",
  "246": "IO",
  "248": "SC",
  "249": "SD",
  "250": "RW",
  "251": "ET",
  "252": "SO",
  "253": "DJ",
  "254": "KE",
  "255": "TZ",
  "256": "UG",
  "257": "BI",
  "258": "MZ",
  "260": "ZM",
  "261": "MG",
  "262": "RE",
  "263": "ZW",
  "264": "NA",
  "265": "MW",
  "266": "LS",
  "267": "BW",
  "268": "SZ",
  "269": "KM",
  "290": "SH",
  "291": "ER",
  "297": "AW",
  "298": "FO",
  "299": "GL",
  "350": "GI",
  "351": "PT",
  "352": "LU",
  "353": "IE",
  "354": "IS",
  "355": "AL",
  "356": "MT",
  "357": "CY",
  "358": "FI",
  "359": "BG",
  "370": "LT",
  "371": "LV",
  "372": "EE",
  "373": "MD",
  "374": "AM",
  "375": "BY",
  "376": "AD",
  "377": "MC",
  "378": "SM",
  "380": "UA",
  "381": "RS",
  "382": "ME",
  "383": "XK",
  "385": "HR",
  "386": "SI",
  "387": "BA",
  "389": "MK",
  "420": "CZ",
  "421": "SK",
  "423": "LI",
  "500": "FK",
  "501": "BZ",
  "502": "GT",
  "503": "SV",
  "504": "HN",
  "505": "NI",
  "506": "CR",
  "507": "PA",
  "508": "PM",
  "509": "HT",
  "590": "GP",
  "591": "BO",
  "592": "GY",
  "593": "EC",
  "594": "GF",
  "595": "PY",
  "596": "MQ",
  "597": "SR",
  "598": "UY",
  "599": "CW",
  "670": "TL",
  "672": "NF",
  "673": "BN",
  "674": "NR",
  "675": "PG",
  "676": "TO",
  "677": "SB",
  "678": "VU",
  "679": "FJ",
  "680": "PW",
  "681": "WF",
  "682": "CK",
  "683": "NU",
  "685": "WS",
  "686": "KI",
  "687": "NC",
  "688": "TV",
  "689": "PF",
  "690": "TK",
  "691": "FM",
  "692": "MH",
  "850": "KP",
  "852": "HK",
  "853": "MO",
  "855": "KH",
  "856": "LA",
  "880": "BD",
  "886": "TW",
  "960": "MV",
  "961": "LB",
  "962": "JO",
  "963": "SY",
  "964": "IQ",
  "965": "KW",
  "966": "SA",
  "967": "YE",
  "968": "OM",
  "970": "PS",
  "971": "AE",
  "972": "IL",
  "973": "BH",
  "974": "QA",
  "975": "BT",
  "976": "MN",
  "977": "NP",
  "992": "TJ",
  "993": "TM",
  "994": "AZ",
  "995": "GE",
  "996": "KG",
  "998": "UZ",
};

// Country name to ISO-2 mapping
const COUNTRY_NAMES: Record<string, string> = {
  "afghanistan": "AF",
  "albania": "AL",
  "algeria": "DZ",
  "andorra": "AD",
  "angola": "AO",
  "argentina": "AR",
  "armenia": "AM",
  "australia": "AU",
  "austria": "AT",
  "azerbaijan": "AZ",
  "bahrain": "BH",
  "bangladesh": "BD",
  "belarus": "BY",
  "belgium": "BE",
  "bolivia": "BO",
  "bosnia": "BA",
  "botswana": "BW",
  "brazil": "BR",
  "bulgaria": "BG",
  "cambodia": "KH",
  "cameroon": "CM",
  "canada": "CA",
  "chile": "CL",
  "china": "CN",
  "colombia": "CO",
  "costa rica": "CR",
  "croatia": "HR",
  "cuba": "CU",
  "cyprus": "CY",
  "czech republic": "CZ",
  "denmark": "DK",
  "dominican republic": "DO",
  "ecuador": "EC",
  "egypt": "EG",
  "estonia": "EE",
  "ethiopia": "ET",
  "finland": "FI",
  "france": "FR",
  "georgia": "GE",
  "germany": "DE",
  "ghana": "GH",
  "greece": "GR",
  "guatemala": "GT",
  "honduras": "HN",
  "hong kong": "HK",
  "hungary": "HU",
  "iceland": "IS",
  "india": "IN",
  "indonesia": "ID",
  "iran": "IR",
  "iraq": "IQ",
  "ireland": "IE",
  "israel": "IL",
  "italy": "IT",
  "jamaica": "JM",
  "japan": "JP",
  "jordan": "JO",
  "kazakhstan": "KZ",
  "kenya": "KE",
  "korea": "KR",
  "kuwait": "KW",
  "kyrgyzstan": "KG",
  "laos": "LA",
  "latvia": "LV",
  "lebanon": "LB",
  "libya": "LY",
  "lithuania": "LT",
  "luxembourg": "LU",
  "malaysia": "MY",
  "malta": "MT",
  "mexico": "MX",
  "moldova": "MD",
  "monaco": "MC",
  "mongolia": "MN",
  "montenegro": "ME",
  "morocco": "MA",
  "myanmar": "MM",
  "nepal": "NP",
  "netherlands": "NL",
  "new zealand": "NZ",
  "nicaragua": "NI",
  "nigeria": "NG",
  "norway": "NO",
  "oman": "OM",
  "pakistan": "PK",
  "palestine": "PS",
  "panama": "PA",
  "paraguay": "PY",
  "peru": "PE",
  "philippines": "PH",
  "poland": "PL",
  "portugal": "PT",
  "qatar": "QA",
  "romania": "RO",
  "russia": "RU",
  "saudi arabia": "SA",
  "serbia": "RS",
  "singapore": "SG",
  "slovakia": "SK",
  "slovenia": "SI",
  "south africa": "ZA",
  "spain": "ES",
  "sri lanka": "LK",
  "sweden": "SE",
  "switzerland": "CH",
  "syria": "SY",
  "taiwan": "TW",
  "thailand": "TH",
  "tunisia": "TN",
  "turkey": "TR",
  "ukraine": "UA",
  "united arab emirates": "AE",
  "united kingdom": "GB",
  "united states": "US",
  "uruguay": "UY",
  "uzbekistan": "UZ",
  "venezuela": "VE",
  "vietnam": "VN",
  "yemen": "YE",
  "zimbabwe": "ZW",
  // City names that strongly indicate country
  "beijing": "CN",
  "shanghai": "CN",
  "shenzhen": "CN",
  "guangzhou": "CN",
  "dubai": "AE",
  "abu dhabi": "AE",
  "london": "GB",
  "paris": "FR",
  "berlin": "DE",
  "munich": "DE",
  "hamburg": "DE",
  "rome": "IT",
  "milan": "IT",
  "madrid": "ES",
  "barcelona": "ES",
  "moscow": "RU",
  "tokyo": "JP",
  "osaka": "JP",
  "seoul": "KR",
  "sydney": "AU",
  "melbourne": "AU",
  "toronto": "CA",
  "vancouver": "CA",
  "montreal": "CA",
};

// ccTLD to ISO-2 mapping (excluding generic TLDs)
const CCTLD_MAP: Record<string, string> = {
  "de": "DE",
  "fr": "FR",
  "it": "IT",
  "es": "ES",
  "uk": "GB",
  "co.uk": "GB",
  "nl": "NL",
  "be": "BE",
  "ch": "CH",
  "at": "AT",
  "se": "SE",
  "no": "NO",
  "dk": "DK",
  "fi": "FI",
  "pl": "PL",
  "cz": "CZ",
  "sk": "SK",
  "hu": "HU",
  "ro": "RO",
  "bg": "BG",
  "gr": "GR",
  "pt": "PT",
  "ie": "IE",
  "lu": "LU",
  "hr": "HR",
  "si": "SI",
  "ee": "EE",
  "lv": "LV",
  "lt": "LT",
  "ru": "RU",
  "ua": "UA",
  "cn": "CN",
  "jp": "JP",
  "kr": "KR",
  "in": "IN",
  "au": "AU",
  "nz": "NZ",
  "ca": "CA",
  "mx": "MX",
  "br": "BR",
  "ar": "AR",
  "cl": "CL",
  "co": "CO",
  "za": "ZA",
  "ae": "AE",
  "sa": "SA",
  "tr": "TR",
  "il": "IL",
  "sg": "SG",
  "my": "MY",
  "th": "TH",
  "vn": "VN",
  "ph": "PH",
  "id": "ID",
  "tw": "TW",
  "hk": "HK",
};

/**
 * Detect country from text (contact/about pages)
 * Looks for country names and city names
 */
export function detectCountryFromText(text: string): CountryDetection | null {
  const lower = text.toLowerCase();
  
  for (const [name, iso2] of Object.entries(COUNTRY_NAMES)) {
    // Word boundary check
    const regex = new RegExp(`\\b${name}\\b`, "i");
    if (regex.test(lower)) {
      return {
        iso2,
        confidence: "HIGH",
        confidenceScore: 1.0,
        source: "WORD",
      };
    }
  }
  
  return null;
}

/**
 * Detect country from phone number
 * Extracts E.164 prefix and maps to country
 */
export function detectCountryFromPhone(phone: string): CountryDetection | null {
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, "");
  
  // Try to match phone prefixes (longest first)
  const prefixes = Object.keys(PHONE_PREFIXES).sort((a, b) => b.length - a.length);
  
  for (const prefix of prefixes) {
    if (digits.startsWith(prefix)) {
      const iso2 = PHONE_PREFIXES[prefix];
      return {
        iso2,
        confidence: "HIGH",
        confidenceScore: 0.9,
        source: "PHONE",
      };
    }
  }
  
  return null;
}

/**
 * Detect country from domain TLD
 * Only ccTLDs, not generic TLDs like .com, .net, .org
 */
export function detectCountryFromDomain(domain: string): CountryDetection | null {
  const lower = domain.toLowerCase();
  
  // Extract TLD
  const parts = lower.split(".");
  if (parts.length < 2) return null;
  
  // Check for co.uk style
  if (parts.length >= 3) {
    const twoPartTld = parts.slice(-2).join(".");
    if (CCTLD_MAP[twoPartTld]) {
      return {
        iso2: CCTLD_MAP[twoPartTld],
        confidence: "WEAK",
        confidenceScore: 0.6,
        source: "TLD",
      };
    }
  }
  
  // Check single TLD
  const tld = parts[parts.length - 1];
  if (CCTLD_MAP[tld]) {
    return {
      iso2: CCTLD_MAP[tld],
      confidence: "WEAK",
      confidenceScore: 0.6,
      source: "TLD",
    };
  }
  
  return null;
}

/**
 * Combine multiple country detections and return the best one
 * Priority: WORD/PHONE (HIGH) > TLD (WEAK)
 */
export function combineCountryDetections(detections: CountryDetection[]): CountryDetection | null {
  if (detections.length === 0) return null;
  
  // Sort by confidence score (highest first)
  const sorted = [...detections].sort((a, b) => b.confidenceScore - a.confidenceScore);
  
  // Return the highest confidence detection
  return sorted[0];
}

/**
 * Main function to detect country from all available signals
 */
export function detectCountry(params: {
  text?: string;
  phones?: string[];
  domain?: string;
}): CountryDetection | null {
  const detections: CountryDetection[] = [];
  
  // Check text (contacts/about)
  if (params.text) {
    const textDetection = detectCountryFromText(params.text);
    if (textDetection) detections.push(textDetection);
  }
  
  // Check phones
  if (params.phones && params.phones.length > 0) {
    for (const phone of params.phones) {
      const phoneDetection = detectCountryFromPhone(phone);
      if (phoneDetection) detections.push(phoneDetection);
    }
  }
  
  // Check domain (only if no HIGH confidence signals)
  if (params.domain && detections.every(d => d.confidence === "WEAK")) {
    const domainDetection = detectCountryFromDomain(params.domain);
    if (domainDetection) detections.push(domainDetection);
  }
  
  return combineCountryDetections(detections);
}
