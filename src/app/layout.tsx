import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "./round3.css";
import "./round3-secondary.css";
const sans = localFont({
  src: "../../public/fonts/IBMPlexSans-Variable.ttf",
  variable: "--font-sans",
  display: "swap",
  weight: "100 700",
});
const serif = localFont({
  src: [
    {
      path: "../../public/fonts/BodoniModa-Variable.ttf",
      style: "normal",
      weight: "400 900",
    },
    {
      path: "../../public/fonts/BodoniModa-Italic.ttf",
      style: "italic",
      weight: "400 900",
    },
  ],
  variable: "--font-serif",
  display: "swap",
});
const mono = localFont({
  src: "../../public/fonts/IBMPlexMono-Regular.ttf",
  variable: "--font-mono",
  display: "swap",
  weight: "400",
});
export const metadata: Metadata = {
  title: {
    default: "STAGECRAFT — A story in every look",
    template: "%s · STAGECRAFT",
  },
  description:
    "From the first script cue to the last costume change. Connect your cast, approved looks, physical wardrobe, and crew in one production workspace.",
  applicationName: "STAGECRAFT",
  robots: { index: true, follow: true },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body className={`${sans.variable} ${serif.variable} ${mono.variable}`}>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
