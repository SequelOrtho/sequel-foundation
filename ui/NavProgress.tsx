"use client";

import { Suspense, useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  clickStartsNavigation,
  endNavProgress,
  startNavProgress,
  useNavProgress,
} from "./nav-progress";

// Global route-transition indicator: a thin brand-blue bar fixed to the top of
// the viewport that starts on any internal link click (or back/forward) and
// completes when the rendered route changes. Mount ONCE in the root layout,
// anywhere in <body>:
//
//   <NavProgress />
//
// Fetch-then-push flows (create → router.push) can call startNavProgress()
// imperatively next to the fetch; the pathname change completes it the same
// way. The crawl's first ~250ms is transparent (see seq-nav-progress in
// theme.css) so fast transitions never flicker; prefers-reduced-motion swaps
// the crawl for a static bar. The bar is aria-hidden — Next's built-in route
// announcer already reports the navigation to screen readers.

function NavProgressBinding() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();

  // The rendered route, kept in a ref so the listeners below can read it
  // without being torn down and re-registered on every navigation.
  const routeRef = useRef("");

  // The rendered route changed — the navigation the bar was tracking landed.
  useEffect(() => {
    routeRef.current = pathname + (search ? `?${search}` : "");
    endNavProgress();
  }, [pathname, search]);

  // Registered once for the lifetime of the app. Neither handler closes over
  // the render scope: onClick reads window.location at click time, and onPop
  // reads the route through routeRef. Keying this on [pathname, search] meant
  // a document-level click listener was removed and re-added on every single
  // navigation, in a component mounted once in the root layout.
  useEffect(() => {
    // Bubble phase (not capture) so a handler that preventDefault()s — menus,
    // in-page toggles wrapped in <a> — has already run.
    const onClick = (e: MouseEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      const anchor = target?.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const starts = clickStartsNavigation({
        href: anchor.getAttribute("href"),
        targetAttr: anchor.getAttribute("target"),
        hasDownload: anchor.hasAttribute("download"),
        button: e.button,
        metaKey: e.metaKey,
        ctrlKey: e.ctrlKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        defaultPrevented: e.defaultPrevented,
        currentHref: window.location.href,
      });
      if (starts) startNavProgress();
    };
    // Back/forward: location has already moved when popstate fires — only
    // track it when the URL actually differs from the rendered route (a
    // hash-only popstate never re-renders, so the bar would hang).
    const onPop = () => {
      const moved =
        window.location.pathname + window.location.search !== routeRef.current;
      if (moved) startNavProgress();
    };
    document.addEventListener("click", onClick);
    window.addEventListener("popstate", onPop);
    return () => {
      document.removeEventListener("click", onClick);
      window.removeEventListener("popstate", onPop);
    };
  }, []);

  const { phase, generation } = useNavProgress();
  if (phase === "idle") return null;
  return (
    <div
      aria-hidden
      // Key on the generation so a second navigation restarts the crawl.
      key={generation}
      className={`fixed inset-x-0 top-0 z-[80] h-[3px] origin-left bg-brand ${
        phase === "active" ? "animate-seq-nav-progress" : "animate-seq-nav-progress-done"
      }`}
    />
  );
}

export function NavProgress() {
  // useSearchParams requires a Suspense boundary in prerendered layouts.
  return (
    <Suspense fallback={null}>
      <NavProgressBinding />
    </Suspense>
  );
}
