import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Conrad Dashboard",
  description: "Conrad, Chief of Staff. One place that holds all of it.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Conrad Dashboard",
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
        {/*
          Self-heal for a stale cached shell. A service worker cache that
          outlived its deploy can serve HTML pointing at /_next/static chunks
          that now 404, and the result is a blank page with no visible error.
          This listens for a script that failed to load, then throws the cache
          and the worker away and reloads once. The sessionStorage guard means
          a genuinely broken deploy cannot become a reload loop: it gets one
          attempt per tab session, then the failure is allowed to stand where
          it can be seen.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var K='cb-selfheal';window.addEventListener('error',function(e){var t=e&&e.target;if(!t||t.tagName!=='SCRIPT')return;var s=String(t.src||'');if(s.indexOf('/_next/static/')===-1)return;try{if(sessionStorage.getItem(K))return;sessionStorage.setItem(K,'1')}catch(x){return}var done=function(){location.reload()};var jobs=[];try{if(window.caches&&caches.keys){jobs.push(caches.keys().then(function(k){return Promise.all(k.map(function(n){return caches.delete(n)}))}))}}catch(x){}try{if(navigator.serviceWorker&&navigator.serviceWorker.getRegistrations){jobs.push(navigator.serviceWorker.getRegistrations().then(function(r){return Promise.all(r.map(function(x){return x.unregister()}))}))}}catch(x){}Promise.all(jobs).then(done,done)},true)})()`,
          }}
        />
      </body>
    </html>
  );
}
