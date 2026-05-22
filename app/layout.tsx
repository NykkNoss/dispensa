import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "La mia Dispensa",
  description: "Dispensa condivisa con lista della spesa in tempo reale"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/tabler-icons.min.css"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
