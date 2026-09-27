import type { FunctionComponent, ReactElement, SVGProps } from "react";
import "./icons.css";
import { ICON_NAMES, ICON_PATHS, type IconName } from "./paths";

export { ICON_NAMES, ICON_PATHS };
export type { IconName };

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "name" | "children" | "dangerouslySetInnerHTML"> {
  name: IconName;
  /** Rendered width and height in px. Defaults to 18. */
  size?: number;
  /** Line weight in viewBox units (the grid is 20×20). Defaults to 1.5. */
  strokeWidth?: number;
  /** Accessible label. Without it the icon is decorative and hidden from assistive tech. */
  title?: string;
}

const XML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };
const escapeXml = (text: string): string => text.replace(/[&<>]/g, (c) => XML_ESCAPES[c] ?? c);

export function Icon({ name, size = 18, strokeWidth = 1.5, title, className, ...rest }: IconProps): ReactElement {
  // Drawings live in paths.ts as markup so the same data feeds the static preview;
  // <title> has to be part of that markup because innerHTML and children are exclusive.
  const markup = (title ? `<title>${escapeXml(title)}</title>` : "") + ICON_PATHS[name];
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      data-icon={name}
      {...rest}
      className={["ch-icon", className].filter(Boolean).join(" ")}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}

export type NamedIconProps = Omit<IconProps, "name">;

function named(name: IconName): FunctionComponent<NamedIconProps> {
  const Named: FunctionComponent<NamedIconProps> = (props) => <Icon name={name} {...props} />;
  Named.displayName = `Icon(${name})`;
  return Named;
}

export const IconSearch = named("search");
export const IconPlus = named("plus");
export const IconClose = named("close");
export const IconCheck = named("check");
export const IconSettings = named("settings");
export const IconHome = named("home");
export const IconPalette = named("palette");
export const IconMotion = named("motion");
export const IconTrash = named("trash");
export const IconRename = named("rename");
export const IconArchive = named("archive");
export const IconUnarchive = named("unarchive");
export const IconDownloadZip = named("downloadZip");
export const IconDownloadPdf = named("downloadPdf");
export const IconCompile = named("compile");
export const IconSnapshot = named("snapshot");
export const IconChevronDown = named("chevronDown");
export const IconChevronRight = named("chevronRight");
export const IconSidebar = named("sidebar");
export const IconExport = named("export");
export const IconUpload = named("upload");
export const IconNewFile = named("newFile");
export const IconNewFolder = named("newFolder");
export const IconWarning = named("warning");
export const IconError = named("error");
export const IconInfo = named("info");
