import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "Nixx — sandboxed coding agent",
  description:
    "Nixx runs your coding tasks inside an isolated sandbox and opens a real GitHub pull request you can review and merge.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <span
          aria-hidden="true"
          dangerouslySetInnerHTML={{
            __html:
              "<!-- impeccable-direction-contract 96b1eb7b\nTHESIS: A professional, minimalist AI dev-tool landing that proves the sandbox-to-PR mechanism in the first viewport, refusing the gradient-glow hype default.\nOWN-WORLD: Geist Sans + Geist Mono; monochrome surfaces (near-black ink on white/near-white ground) with one reserved GitHub-merge green used only for state; hairline borders, no gradients, no glass.\nSTORY: A developer sees, in seconds, that Nixx runs their task in an isolated sandbox and returns a reviewable pull request, then signs in with GitHub.\nFIRST VIEWPORT: Nav (wordmark, How it works, Sign in, Open app); left column headline/subhead/CTA, right column a terminal session running `nixx run` to an opened PR #42.\nFORM: the standard AI dev-tool landing (canon), executed at the craft level of Cursor, GitHub Copilot, and Devin.\nFINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance. -->",
          }}
        />
        {children}
      </body>
    </html>
  );
}
