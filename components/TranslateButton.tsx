"use client";

import { useEffect } from "react";

export default function TranslateButton() {
  // підвантажуємо скрипт один раз
  useEffect(() => {
    if (document.getElementById("google-translate-script")) return;

    (window as any).__googleTranslateInit = () => {
      // створюємо прихований елемент (інакше скрипт не активується)
      new (window as any).google.translate.TranslateElement(
        {
          pageLanguage: "en",
          includedLanguages: "ru",
          autoDisplay: false,
          layout: (window as any).google.translate.TranslateElement.InlineLayout.SIMPLE,
        },
        "google_translate_element"
      );
    };

    const s = document.createElement("script");
    s.id = "google-translate-script";
    s.src = "https://translate.google.com/translate_a/element.js?cb=__googleTranslateInit";
    document.body.appendChild(s);
  }, []);

  const setLang = (lang: "ru" | "en") => {
    // керуємо кукою googtrans і перезавантажуємо
    const host = location.hostname;
    const val = lang === "en" ? "" : `/auto/${lang}`;

    const del = () => {
      document.cookie = `googtrans=;max-age=0;path=/`;
      document.cookie = `googtrans=;max-age=0;domain=.${host};path=/`;
    };

    if (!val) {
      del();
    } else {
      document.cookie = `googtrans=${val};path=/;max-age=31536000`;
      document.cookie = `googtrans=${val};domain=.${host};path=/;max-age=31536000`;
    }
    location.reload();
  };

  return (
    <div className="flex items-center gap-2">
      {/* прихований контейнер для ініціалізації скрипта */}
      <div id="google_translate_element" className="hidden" />
      <button
        type="button"
        onClick={() => setLang("ru")}
        className="rounded-md border border-zinc-700/60 px-2 py-1 text-xs hover:bg-zinc-800"
        title="Перекласти російською"
      >
        RU
      </button>
      <button
        type="button"
        onClick={() => setLang("en")}
        className="rounded-md border border-zinc-700/60 px-2 py-1 text-xs hover:bg-zinc-800"
        title="Повернути англійську"
      >
        EN
      </button>
    </div>
  );
}
