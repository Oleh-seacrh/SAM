import "./globals.css";
import type { ReactNode } from "react";
import { Sidebar } from "@/components/layout/Sidebar";

export const metadata = {
  title: "SAM",
  description: "Search & Analysis Machine"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="uk">
      <body>
        <div className="h-screen flex overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-y-auto">
            <div className="p-6">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
