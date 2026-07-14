import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Daily Brief",
  description: "Conrad · Chief of Staff — one place that holds all of it.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Daily Brief",
    statusBarStyle: "black-translucent",
  },
  icons: {
    apple: "/icons/icon-180.png",
    icon: "/icons/icon-192.png",
  },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#003349",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html: `if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){})})}`,
          }}
        />
      </body>
    </html>
  );
}
