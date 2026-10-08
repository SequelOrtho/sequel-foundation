// Static image imports (brand/EntityLogo.tsx). Inside a Next app the app's own
// next-env.d.ts supplies the same declaration (next/image-types/global); this
// copy only serves the foundation's own typecheck.
declare module "*.png" {
  const src: import("next/image").StaticImageData;
  export default src;
}
