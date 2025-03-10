/*
* project-config.ts
*
* Copyright (C) 2020 by RStudio, PBC
*
*/

import { join } from "path/mod.ts";

import * as ld from "../core/lodash.ts";

import { safeExistsSync } from "../core/path.ts";
import { asHtmlId } from "../core/html.ts";

import { readInputTargetIndex } from "./project-index.ts";
import { fileExecutionEngine } from "../execute/engine.ts";
import { shortUuid } from "../core/uuid.ts";

export const kAriaLabel = "aria-label";
export const kCollapseLevel = "collapse-level";
export const kCollapseBelow = "collapse-below";

export const kSidebarMenus = "sidebar-menus";

export type LayoutBreak = "" | "sm" | "md" | "lg" | "xl" | "xxl";

export interface Navbar {
  title?: string | false;
  logo?: string;
  background:
    | "primary"
    | "secondary"
    | "success"
    | "danger"
    | "warning"
    | "info"
    | "light"
    | "dark";
  search?: boolean | string;
  left?: NavbarItem[];
  right?: NavbarItem[];
  collapse?: boolean;
  tools?: SidebarTool[];
  pinned?: boolean;
  [kCollapseBelow]?: LayoutBreak;
  [kSidebarMenus]?: boolean;
  darkToggle?: boolean;
  readerToggle?: boolean;
}

export interface NavItem {
  // href + more readable/understndable aliases
  icon?: string;
  href?: string;
  file?: string;
  text?: string;
  url?: string;
  [kAriaLabel]?: string;
}

export interface NavbarItem extends NavItem {
  // core identification
  id?: string;

  // more
  menu?: NavbarItem[];
}

export interface Sidebar {
  id?: string;
  title?: string;
  subtitle?: string;
  logo?: string;
  aligment?: "left" | "right" | "center";
  background?:
    | "none"
    | "primary"
    | "secondary"
    | "success"
    | "danger"
    | "warning"
    | "info"
    | "light"
    | "dark"
    | "white";
  search?: boolean | string;
  [kCollapseLevel]?: number;
  contents: SidebarItem[];
  tools: SidebarTool[];
  style: "docked" | "floating";
  pinned?: boolean;
  header?: Array<string> | string;
  footer?: Array<string> | string;
}

export interface SidebarItem extends NavItem {
  // core structure/contents
  section?: string;
  sectionId?: string;
  contents?: SidebarItem[];

  // more
  expanded?: boolean;
  active?: boolean;
}

export interface SidebarTool {
  // label/contents
  icon?: string;
  text?: string;
  menu?: NavbarItem[];

  // href + more readable/understndable aliases
  href?: string;
  file?: string;
  url?: string;
}

export function normalizeSidebarItem(
  projectDir: string,
  item: SidebarItem,
): SidebarItem {
  // clone so we can mutate
  item = ld.cloneDeep(item);

  if (typeof (item) === "string") {
    if (safeExistsSync(join(projectDir, item))) {
      item = {
        href: item,
      };
    } else {
      item = {
        text: item,
      };
    }
  } else {
    // resolve aliases for href
    resolveHrefAttribute(item);

    // section is a special key that can provide either text or href
    // for an item with 'contents'
    const section = item.section;
    if (section) {
      const sectionPath = join(projectDir, section);
      if (safeExistsSync(sectionPath) && Deno.statSync(sectionPath).isFile) {
        item.href = section;
      } else {
        item.text = section;
      }
      item.sectionId = kQuartoSidebarPrefix + asHtmlId(section);
      delete item.section;
    }

    if (item.contents && !item.sectionId) {
      // If the item does not have a sectionId, synthesize one
      // Since this item has contents
      item.sectionId = kQuartoSidebarPrefix + shortUuid();
    }

    // handle subitems
    if (item.contents) {
      for (let i = 0; i < item.contents.length; i++) {
        item.contents[i] = normalizeSidebarItem(
          projectDir,
          item.contents[i],
        );
      }
    }
  }

  return item;
}

const kQuartoSidebarPrefix = "quarto-sidebar-section-";

export function resolveHrefAttribute(
  item: { href?: string; file?: string; url?: string },
) {
  item.href = item.href || item.file || item.url;
  delete item.file;
  delete item.url;
}

export async function partitionedMarkdownForInput(
  projectDir: string,
  input: string,
) {
  // first see if we can get the partioned markdown out of the index
  const index = readInputTargetIndex(projectDir, input);
  if (index) {
    return index.markdown;
    // otherwise fall back to calling the engine to do the partition
  } else {
    const inputPath = join(projectDir, input);
    const engine = fileExecutionEngine(inputPath);
    if (engine) {
      return await engine.partitionedMarkdown(inputPath);
    } else {
      return undefined;
    }
  }
}
