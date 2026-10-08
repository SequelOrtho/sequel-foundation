import Image, { type StaticImageData } from "next/image";
import { ENTITIES, type EntityKey } from "./entities";
import seqColor from "./assets/logo-navy.png";
import seqWhite from "./assets/logo-white.png";
import fvoColor from "./assets/fvo/logo-color.png";
import fvoReverse from "./assets/fvo/logo-reverse.png";
import fvoWhite from "./assets/fvo/logo-white.png";
import onColor from "./assets/on/logo-color.png";
import onReverse from "./assets/on/logo-reverse.png";
import onWhite from "./assets/on/logo-white.png";

// The entity's official lockup, theme-aware. Replaces every app's hand-rolled
// Logo: `auto` renders the color lockup on light and the reverse lockup
// (color mark, white wordmark — each guide's dark-ground treatment) in dark
// mode, toggled by the `dark:` variant so there is no flash and no client JS.
// Pin a single treatment with `variant` (`white` for photos / brand-color
// grounds, per the guides' background-control rules).
//
// Width comes from the registry's aspect ratio rather than the image object so
// the component renders the same under vitest (where a .png import is a URL
// string) as under Next (StaticImageData).

const FILES: Record<EntityKey, { color: StaticImageData; reverse: StaticImageData; white: StaticImageData }> = {
  SEQ: { color: seqColor, reverse: seqWhite, white: seqWhite },
  FVO: { color: fvoColor, reverse: fvoReverse, white: fvoWhite },
  ON: { color: onColor, reverse: onReverse, white: onWhite },
};

export type EntityLogoVariant = "auto" | "color" | "reverse" | "white";

export function EntityLogo({
  entity,
  height = 32,
  variant = "auto",
  priority = false,
  className = "",
}: {
  entity: EntityKey;
  /** Rendered height in px. Stay at or above the guide minimum (ENTITIES[k].logo.minHeightPx). */
  height?: number;
  variant?: EntityLogoVariant;
  priority?: boolean;
  className?: string;
}) {
  const { logo } = ENTITIES[entity];
  const files = FILES[entity];
  const width = Math.round(height * logo.aspect);
  const img = (src: StaticImageData, cls: string) => (
    <Image
      src={src}
      alt={logo.alt}
      height={height}
      width={width}
      priority={priority}
      className={[cls, className].filter(Boolean).join(" ")}
    />
  );
  if (variant !== "auto") return img(files[variant], "");
  return (
    <>
      {img(files.color, "dark:hidden")}
      {img(files.reverse, "hidden dark:block")}
    </>
  );
}
