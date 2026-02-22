import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { Cormorant_Garamond, JetBrains_Mono, Manrope } from "next/font/google";
import "./globals.css";

const siteName = "Stashify";
const siteUrl = "http://stashify.polluxstudio.in";
const repoUrl = "https://github.com/Pollux-Studio/stashify";
const productHuntUrl = "https://www.producthunt.com/products/stashify";
const downloadUrl =
  "https://github.com/Pollux-Studio/stashify/releases/download/v0.1.0/Stashify_0.1.0_x64-setup.exe";
const ogImageUrl = siteUrl ? `${siteUrl}/stashify_logo.svg` : undefined;
const description =
  "Stashify is a desktop GUI for git stash workflows. Add repository or folder paths, open saved stashes, compare original vs modified code in Monaco diff view, preview image changes, and locate projects faster with drive search.";
const keywords = [
  "git stash gui",
  "git stash viewer",
  "monaco diff viewer",
  "stash manager app",
  "developer desktop tools",
  "code diff desktop app",
  "repo and folder stash workflow",
  "image diff preview",
  "drive search developer tool",
  "stashify",
];

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: siteUrl ? new URL(siteUrl) : undefined,
  title: {
    default: "Stashify | GUI for Git Stash and Monaco Diff Review",
    template: "%s | Stashify",
  },
  description,
  applicationName: siteName,
  keywords,
  category: "Developer Tools",
  authors: [{ name: "Pollux Studio", url: repoUrl }],
  creator: "Pollux Studio",
  publisher: "Pollux Studio",
  alternates: siteUrl
    ? {
        canonical: "/",
      }
    : undefined,
  openGraph: {
    type: "website",
    siteName,
    title: "Stashify | GUI for Git Stash and Monaco Diff Review",
    description,
    url: siteUrl ? "/" : undefined,
    images: ogImageUrl
      ? [
          {
            url: ogImageUrl,
            width: 1200,
            height: 630,
            alt: "Stashify logo",
          },
        ]
      : undefined,
  },
  twitter: {
    card: "summary_large_image",
    title: "Stashify | GUI for Git Stash and Monaco Diff Review",
    description,
    images: ogImageUrl ? [ogImageUrl] : undefined,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  referrer: "origin-when-cross-origin",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  icons: {
    icon: "/stashify_logo.svg",
    shortcut: "/stashify_logo.svg",
    apple: "/app_icon.svg",
  },
};

const softwareApplicationSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: siteName,
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Windows",
  softwareVersion: "0.1.0",
  description,
  url: siteUrl,
  downloadUrl,
  sameAs: [repoUrl, productHuntUrl],
  author: {
    "@type": "Organization",
    name: "Pollux Studio",
    url: repoUrl,
  },
  featureList: [
    "Add repository and folder paths once and reopen instantly",
    "Open saved stash entries with clear status context",
    "Compare original vs modified code using Monaco diff view",
    "Preview image-based stash changes",
    "Search drives to locate project folders faster",
  ],
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
    availability: "https://schema.org/InStock",
  },
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "Can I compare original and modified code before restore?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. Clicking a stash opens Monaco diff view so you can review original vs modified content clearly.",
      },
    },
    {
      "@type": "Question",
      name: "Can I add both repositories and plain folders?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. Stashify supports adding repo/folder paths, saving them, and switching quickly from the sidebar.",
      },
    },
    {
      "@type": "Question",
      name: "Does Stashify include image preview and drive search?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. You can preview image-based stash changes and use drive search to locate project folders faster.",
      },
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${manrope.variable} ${cormorant.variable} ${jetbrainsMono.variable} antialiased`}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(softwareApplicationSchema),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(faqSchema),
          }}
        />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
