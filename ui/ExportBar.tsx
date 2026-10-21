"use client";

import { buttonClasses } from "./Button";

// Export controls for read-only views: print/save-as-PDF (the shared
// @media print stylesheet in brand/theme.css hides the chrome) and an optional
// .xlsx download. Tagged data-no-print so it never appears in printed output.

export function ExportBar({ xlsxHref, xlsxLabel }: { xlsxHref?: string; xlsxLabel?: string }) {
  return (
    <div data-no-print className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={() => window.print()}
        className={buttonClasses({ variant: "outline", size: "sm" })}
      >
        <span aria-hidden>🖨</span> Print / Save as PDF
      </button>
      {xlsxHref && (
        <a
          href={xlsxHref}
          download
          className={buttonClasses({ variant: "outline", size: "sm" })}
        >
          <span aria-hidden>⬇</span> {xlsxLabel ?? "Download .xlsx"}
        </a>
      )}
    </div>
  );
}
