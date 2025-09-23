// components/EnrichButton.tsx
"use client";

import * as React from "react";

/**
 * Deprecated: use "Find info" flow instead.
 * Залишено як no-op, щоб не ламати існуючі імпорти.
 */

export type EnrichButtonProps = {
  input?: string; // зберігаємо підпис пропсів для сумісності
  className?: string;
  disabled?: boolean;
  children?: React.ReactNode;
};

export function EnrichButton(_props: EnrichButtonProps) {
  React.useEffect(() => {
    // Один раз попереджаємо в консолі, якщо компонент все ще змонтовано десь у UI
    // (допомагає знайти забуті використання)
    // eslint-disable-next-line no-console
    console.warn("EnrichButton is deprecated; use 'Find info' instead.");
  }, []);

  // Повний no-op: нічого не рендеримо і ніяких запитів не робимо
  return null;
}

// Опційно лишаємо default export для максимальної сумісності.
// Якщо десь імпортували як default — теж не зламається.
export default EnrichButton;
