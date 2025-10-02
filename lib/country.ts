// lib/country.ts
// Country inference utilities with priority-based detection

export type CountryConfidence = "HIGH" | "WEAK" | "LLM";

export interface CountryInferenceResult {
  countryISO2: string | null;
  countryName: string | null;
  confidence: CountryConfidence;
  source: "address" | "phone" | "tld" | "llm" | "unknown";
}

// ISO-2 country codes mapping
const COUNTRY_NAME_TO_ISO2: Record<string, string> = {
  // Major countries
  "united states": "US",
  "usa": "US",
  "america": "US",
  "united kingdom": "GB",
  "uk": "GB",
  "great britain": "GB",
  "germany": "DE",
  "deutschland": "DE",
  "france": "FR",
  "italy": "IT",
  "italia": "IT",
  "spain": "ES",
  "españa": "ES",
  "canada": "CA",
  "australia": "AU",
  "japan": "JP",
  "china": "CN",
  "india": "IN",
  "brazil": "BR",
  "brasil": "BR",
  "mexico": "MX",
  "méxico": "MX",
  "russia": "RU",
  "south korea": "KR",
  "korea": "KR",
  "netherlands": "NL",
  "holland": "NL",
  "belgium": "BE",
  "belgië": "BE",
  "belgique": "BE",
  "switzerland": "CH",
  "schweiz": "CH",
  "suisse": "CH",
  "austria": "AT",
  "österreich": "AT",
  "poland": "PL",
  "polska": "PL",
  "sweden": "SE",
  "sverige": "SE",
  "norway": "NO",
  "norge": "NO",
  "denmark": "DK",
  "danmark": "DK",
  "finland": "FI",
  "suomi": "FI",
  "greece": "GR",
  "portugal": "PT",
  "czechia": "CZ",
  "czech republic": "CZ",
  "hungary": "HU",
  "romania": "RO",
  "românia": "RO",
  "ukraine": "UA",
  "україна": "UA",
  "turkey": "TR",
  "türkiye": "TR",
  "israel": "IL",
  "saudi arabia": "SA",
  "uae": "AE",
  "united arab emirates": "AE",
  "south africa": "ZA",
  "argentina": "AR",
  "chile": "CL",
  "colombia": "CO",
  "peru": "PE",
  "perú": "PE",
  "thailand": "TH",
  "vietnam": "VN",
  "indonesia": "ID",
  "malaysia": "MY",
  "philippines": "PH",
  "singapore": "SG",
  "new zealand": "NZ",
  "ireland": "IE",
  "éire": "IE",
};

// Dial code to ISO-2 mapping (E.164 prefixes)
const DIAL_CODE_TO_ISO2: Record<string, string> = {
  "1": "US", // US/CA - ambiguous, default to US
  "7": "RU", // Russia/Kazakhstan - default to Russia
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
  "379": "VA",
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
  "599": "AN",
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

// ccTLD to ISO-2 mapping (only unambiguous ones)
const TLD_TO_ISO2: Record<string, string> = {
  "de": "DE",
  "fr": "FR",
  "it": "IT",
  "es": "ES",
  "nl": "NL",
  "be": "BE",
  "ch": "CH",
  "at": "AT",
  "pl": "PL",
  "se": "SE",
  "no": "NO",
  "dk": "DK",
  "fi": "FI",
  "gr": "GR",
  "pt": "PT",
  "cz": "CZ",
  "hu": "HU",
  "ro": "RO",
  "ua": "UA",
  "tr": "TR",
  "il": "IL",
  "sa": "SA",
  "ae": "AE",
  "za": "ZA",
  "ar": "AR",
  "cl": "CL",
  "co": "CO",
  "pe": "PE",
  "th": "TH",
  "vn": "VN",
  "id": "ID",
  "my": "MY",
  "ph": "PH",
  "sg": "SG",
  "nz": "NZ",
  "ie": "IE",
  "uk": "GB",
  "jp": "JP",
  "cn": "CN",
  "in": "IN",
  "br": "BR",
  "mx": "MX",
  "ru": "RU",
  "kr": "KR",
  "au": "AU",
  "ca": "CA",
};

/**
 * Extract country from addresses/text
 */
export function inferCountryFromAddresses(addresses: string[]): CountryInferenceResult | null {
  for (const addr of addresses) {
    const lower = addr.toLowerCase();
    for (const [name, iso2] of Object.entries(COUNTRY_NAME_TO_ISO2)) {
      if (lower.includes(name)) {
        return {
          countryISO2: iso2,
          countryName: name.charAt(0).toUpperCase() + name.slice(1),
          confidence: "HIGH",
          source: "address",
        };
      }
    }
  }
  return null;
}

/**
 * Extract country from phone numbers (E.164 format)
 */
export function inferCountryFromPhones(phones: string[]): CountryInferenceResult | null {
  for (const phone of phones) {
    // Normalize to E.164: remove spaces, dashes, parens
    const normalized = phone.replace(/[\s\-\(\)]/g, "");
    if (!normalized.startsWith("+")) continue;

    const digits = normalized.slice(1); // remove +
    
    // Try 3-digit codes first, then 2-digit, then 1-digit
    for (let len = 3; len >= 1; len--) {
      const code = digits.slice(0, len);
      if (DIAL_CODE_TO_ISO2[code]) {
        return {
          countryISO2: DIAL_CODE_TO_ISO2[code],
          countryName: null, // we can add a reverse lookup if needed
          confidence: "HIGH",
          source: "phone",
        };
      }
    }
  }
  return null;
}

/**
 * Extract country from TLD (weak signal)
 */
export function inferCountryFromTLD(domain: string): CountryInferenceResult | null {
  // Ignore generic TLDs
  const genericTLDs = ["com", "net", "org", "io", "co", "biz", "info", "edu", "gov", "mil"];
  
  const match = domain.match(/\.([a-z]{2,3})$/i);
  if (!match) return null;
  
  const tld = match[1].toLowerCase();
  if (genericTLDs.includes(tld)) return null;
  
  const iso2 = TLD_TO_ISO2[tld];
  if (iso2) {
    return {
      countryISO2: iso2,
      countryName: null,
      confidence: "WEAK",
      source: "tld",
    };
  }
  return null;
}

/**
 * Main inference function with priority
 */
export function inferCountryISO2(input: {
  addresses?: string[];
  phones?: string[];
  domain?: string;
}): CountryInferenceResult {
  // Priority 1: Addresses
  if (input.addresses && input.addresses.length > 0) {
    const result = inferCountryFromAddresses(input.addresses);
    if (result) return result;
  }

  // Priority 2: Phones
  if (input.phones && input.phones.length > 0) {
    const result = inferCountryFromPhones(input.phones);
    if (result) return result;
  }

  // Priority 3: TLD (weak)
  if (input.domain) {
    const result = inferCountryFromTLD(input.domain);
    if (result) return result;
  }

  // No inference possible
  return {
    countryISO2: null,
    countryName: null,
    confidence: "LLM",
    source: "unknown",
  };
}

/**
 * Get country name from ISO-2 code
 */
export function getCountryName(iso2: string): string | null {
  const upper = iso2.toUpperCase();
  for (const [name, code] of Object.entries(COUNTRY_NAME_TO_ISO2)) {
    if (code === upper) {
      return name.charAt(0).toUpperCase() + name.slice(1);
    }
  }
  return null;
}
