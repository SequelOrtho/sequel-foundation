// Shared Sequel UI primitives. Import from "@sequel/foundation/ui" rather than
// the individual files so adoption sites have one stable path.
export { Button, buttonClasses } from "./Button";
export type { ButtonProps, ButtonVariant, ButtonSize } from "./Button";
export { Callout } from "./Callout";
export type { CalloutTone } from "./Callout";
export { Field } from "./Field";
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
// cannot follow data-theme on its own.
export { useBrandColors, useSeriesColors, useThemeName } from "./brand-colors";
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
  clearAllToasts,
  getToasts,
  useToasts,
} from "./toast/store";
export type { ToastItem, ToastAction } from "./toast/store";
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
export type { Crumb } from "./Breadcrumbs";
export { ExportBar } from "./ExportBar";
export { SearchCombobox } from "./SearchCombobox";
export { comboMatches, type ComboOption } from "./combo-match";
export { useScrollToEdit } from "./useScrollToEdit";
