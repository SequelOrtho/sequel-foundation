// Shared Sequel UI primitives. Import from "@sequel/foundation/ui" rather than
// the individual files so adoption sites have one stable path.
export { Button, buttonClasses, BUTTON_DISABLED_CLASS, BUTTON_BUSY_CLASS } from "./Button";
export type { ButtonProps, ButtonVariant, ButtonSize } from "./Button";
export { Callout } from "./Callout";
export type { CalloutTone } from "./Callout";
// Required-field convention (DESIGN-CONVENTIONS §3): Field + RequiredMark +
// RequiredLegend + FieldError, and checkRequired for the save-time check.
export { Field, RequiredMark, RequiredLegend, FieldError, fieldErrorId, fieldHintId, REQUIRED_LEGEND_TEXT, ALL_REQUIRED_LEGEND_TEXT } from "./Field";
export { checkRequired, requiredMessage, requiredSummary, EMAIL_EXAMPLE } from "./required-fields";
export type { RequiredRule, RequiredCheck } from "./required-fields";
export { CheckCircle, ApprovedBadge } from "./StatusBadges";
export { SaveStateIndicator } from "./SaveState";
export { useSaveRunner, useFormDirty, useDraftSave, SectionSaveBar } from "./SectionSave";
export type { SaveRunner, DraftSave } from "./SectionSave";
// Tab-close guard for any surface holding unsaved draft state. useDraftSave
// wires it automatically; call it directly for hand-rolled dirty state.
export { useUnsavedGuard, hasUnsavedChanges } from "./unsaved-guard";
// Glyph-only control with a real hit area, a focus ring, and a required label.
export { IconButton, iconButtonClasses } from "./IconButton";
export type { IconButtonTone } from "./IconButton";
// Brand palette for chart/SVG code, which cannot take a Tailwind class and so
// cannot follow data-theme / data-entity on its own.
export { useBrandColors, useEntityKey, useSeriesColors, useThemeName } from "./brand-colors";
export { formSnapshot, snapshotEqual, snapshotChangedKeys, shallowDirty } from "./form-dirty";
export type { FormSnapshot } from "./form-dirty";
export { Toast } from "./Toast";
export type { ToastTone } from "./Toast";
export { ToastViewport } from "./toast/ToastViewport";
export {
  pushToast,
  dismissToast,
  toastSaved,
  toastError,
  toastUndo,
  UNDO_TOAST_TTL,
  clearAllToasts,
  getToasts,
  useToasts,
} from "./toast/store";
export type { ToastItem, ToastAction, ToastLinkAction, ToastCallbackAction } from "./toast/store";
// Undo for deletes (DESIGN-CONVENTIONS §3): the Undo toast + the inline strip
// that keeps it on screen for the 30-minute window.
export { offerUndo, undoDelete, dismissUndo, clearUndoOffer, useUndoOffer, UndoStrip, postUndo, UNDO_RESTORE_PATH } from "./UndoDelete";
export type { UndoOffer, UndoOfferOptions } from "./UndoDelete";
export { useShowMore, ShowMoreControls, ShowMoreTbody, ShowMoreList } from "./ShowMore";
export { NavProgress } from "./NavProgress";
export {
  startNavProgress,
  endNavProgress,
  resetNavProgress,
  getNavProgress,
  useNavProgress,
  clickStartsNavigation,
} from "./nav-progress";
export type { NavProgressPhase, NavProgressSnapshot, NavClickInfo } from "./nav-progress";
export { LinkPendingHint } from "./LinkPendingHint";
// Header brand link (logo + title → Home) with the standard departure toast.
export { HomeLink, toastHomeNav, HOME_TOAST_MESSAGE } from "./HomeLink";
export { BackToTop } from "./BackToTop";
export { nextBackToTopState } from "./back-to-top-state";
export type { BackToTopState } from "./back-to-top-state";
export { Breadcrumbs } from "./Breadcrumbs";
// Tile iconography (DESIGN-CONVENTIONS §5): the shared line-glyph set every
// hub tile carries beside its title, and the area tile + grid for hub pages.
export { TileIcon, TILE_ICON_NAMES, TILE_ICON_CLASS, TILE_ICON_MUTED_CLASS, isTileIconName } from "./TileIcon";
export type { TileIconName } from "./TileIcon";
export { AreaTile, AreaTileGrid, areaTileClasses, AREA_TILE_GRID_CLASS } from "./AreaTile";
export type { Crumb } from "./Breadcrumbs";
// URL-backed tabs (DESIGN-CONVENTIONS §5): the page resolves ?tab= through
// pickTab (a plain module, safe to import from a server page) and renders the
// Tabs bar; tabHref/tabClasses serve bespoke links that must match it.
export { Tabs } from "./Tabs";
export { pickTab, tabHref, tabClasses, TAB_COUNT_CLASS } from "./tabs";
export type { TabDef } from "./tabs";
export { ExportBar } from "./ExportBar";
// Page structure and patterns from the UX audit (2026-10-21): skip link + title
// template (DESIGN-CONVENTIONS §5), modal Dialog on native <dialog>, the
// arm-then-confirm focus helper, the RYG stoplight with glyph + word, and
// readable chart chrome.
export { SkipLink, MAIN_CONTENT_ID, SKIP_LINK_TEXT, titleTemplate } from "./SkipLink";
export { Dialog } from "./Dialog";
export { useConfirmStep } from "./useConfirmStep";
export { RygStatus, RYG_LABEL } from "./RygStatus";
export type { RygLevel } from "./RygStatus";
export { useChartTheme } from "./chart-theme-hook";
export { chartTheme } from "../brand/chart-theme";
export type { ChartTheme } from "../brand/chart-theme";
// Dropdowns (DESIGN-CONVENTIONS §3): AdaptiveSelect renders a native <select>
// up to 12 options and the fuzzy SearchCombobox beyond that; use it for every
// select whose list can grow. comboScore/rankComboOptions expose the matcher.
// Text inputs (DESIGN-CONVENTIONS §3): INPUT_CLASS is the pickers' own box
// (white ground in light mode), so hand-rolled <input>/<textarea> match them.
export { INPUT_CLASS, inputClasses } from "./input-class";
// File pickers (DESIGN-CONVENTIONS §3): the native <input type="file"> with its
// button styled as the outline Button, so it reads as a control.
export { FILE_INPUT_CLASS, fileInputClasses } from "./file-input-class";
export { AdaptiveSelect } from "./AdaptiveSelect";
export type { AdaptiveSelectProps } from "./AdaptiveSelect";
export { SearchCombobox } from "./SearchCombobox";
export {
  comboMatches,
  comboScore,
  rankComboOptions,
  isSearchableSize,
  SEARCHABLE_SELECT_THRESHOLD,
  type ComboOption,
} from "./combo-match";
// List filters that take several values (DESIGN-CONVENTIONS §3): OR within a
// filter, AND across filters, nothing picked = off.
export { MultiSelectFilter } from "./MultiSelectFilter";
export type { MultiSelectOption } from "./MultiSelectFilter";
export { passesMulti, toggleMulti, multiSummary } from "./multi-select";
export { useScrollToEdit } from "./useScrollToEdit";
// Popovers stay on screen (DESIGN-CONVENTIONS §3): put useFitInViewport's ref
// on any dropdown / menu / popover panel; the pure geometry is exported too.
export { useFitInViewport } from "./useFitInViewport";
export { horizontalNudge, availableHeightBelow, VIEWPORT_GUTTER } from "./viewport-fit";
export { NoAccessNotice, NotFoundNotice, PageErrorNotice } from "./AccessNotices";
export {
  DEFAULT_ADMIN_LABEL,
  NO_ACCESS_HEADING,
  NOT_FOUND_HEADING,
  PAGE_ERROR_HEADING,
  noAccessMessage,
  notFoundMessage,
  pageErrorMessage,
} from "./access-copy";
export type { AccessCopyOptions } from "./access-copy";
