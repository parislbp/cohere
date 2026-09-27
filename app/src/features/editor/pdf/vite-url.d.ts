// Typing for Vite's `?url` asset imports (the project does not include `vite/client` types).
declare module "*.mjs?url" {
  const url: string;
  export default url;
}
