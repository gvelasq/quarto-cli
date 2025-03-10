/*
* keepsource.ts
*
* Copyright (C) 2020 by RStudio, PBC
*
*/

import { Document, Element } from "../../core/deno-dom.ts";

import {
  HtmlPostProcessResult,
  kHtmlEmptyPostProcessResult,
  kMarkdownBlockSeparator,
} from "./types.ts";
import { Format } from "../../config/types.ts";
import {
  kCodeTools,
  kCodeToolsHideAllCode,
  kCodeToolsMenuCaption,
  kCodeToolsShowAllCode,
  kCodeToolsSourceCode,
  kCodeToolsViewSource,
  kKeepSource,
} from "../../config/constants.ts";
import { ExecutionEngine, ExecutionTarget } from "../../execute/types.ts";

import { isHtmlOutput } from "../../config/format.ts";
import { executionEngineCanKeepSource } from "../../execute/engine.ts";
import { formatHasBootstrap } from "../../format/html/format-html-bootstrap.ts";

const kHideAllCodeLinkId = "quarto-hide-all-code";
const kShowAllCodeLinkId = "quarto-show-all-code";
const kViewSourceLinkId = "quarto-view-source";
const kEmbeddedSourceClass = "quarto-embedded-source-code";
const kEmbeddedSourceModalId = kEmbeddedSourceClass + "-modal";
const kEmbeddedSourceModalLabelId = kEmbeddedSourceClass + "-modal-label";
const kKeepSourceSentinel = "quarto-executable-code-5450563D";

export const kCodeToolsSourceButtonId = "quarto-code-tools-source";
export const kCodeToolsMenuButtonId = "quarto-code-tools-menu";
export const kDataQuartoSourceUrl = "data-quarto-source-url";

export function formatHasCodeTools(format: Format) {
  const codeTools = format.render?.[kCodeTools];
  return !!codeTools && isHtmlOutput(format.pandoc, true) &&
    formatHasBootstrap(format);
}

export function resolveKeepSource(
  format: Format,
  engine: ExecutionEngine,
  target: ExecutionTarget,
) {
  // keep source if requested (via keep-source or code-tools), we are targeting html,
  // and engine can keep it (e.g. we wouldn't keep an .ipynb file as source)
  const codeTools = format.render?.[kCodeTools];
  if (
    codeTools === true ||
    (typeof (codeTools) === "object" &&
      (codeTools?.source === undefined || codeTools?.source === true))
  ) {
    format.render[kKeepSource] = true;
  }
  format.render[kKeepSource] = format.render[kKeepSource] &&
    isHtmlOutput(format.pandoc, true) &&
    formatHasBootstrap(format) &&
    executionEngineCanKeepSource(engine, target);
}

export function keepSourceBlock(format: Format, source: string) {
  if (format.render[kKeepSource]) {
    // read code
    let code = Deno.readTextFileSync(source).trimLeft();
    if (!code.endsWith("\n")) {
      code = code + "\n";
    }

    // make sure that quarto code blocks get correct highlighting
    code = code.replaceAll(
      /\n```{(\w+)}\s*\n/g,
      "\n" + kKeepSourceSentinel + "\n\n```$1\n",
    );

    const kKeepSourceBackticks = "```````````````````";
    return `${kMarkdownBlockSeparator}::: {.${kEmbeddedSourceClass}}\n${kKeepSourceBackticks}` +
      `{.markdown shortcodes="false"}\n${code}` +
      `${kKeepSourceBackticks}\n:::\n`;
  } else {
    return "";
  }
}

export function codeToolsPostprocessor(format: Format) {
  return (doc: Document): Promise<HtmlPostProcessResult> => {
    if (format.render[kKeepSource]) {
      // fixup the lines in embedded source
      const lines = doc.querySelectorAll(
        `.${kEmbeddedSourceClass} > div.sourceCode > pre > code > span`,
      );

      if (lines.length > 0) {
        const newLines: Element[] = [];
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i] as Element;
          if (line.innerText === kKeepSourceSentinel) {
            i += 2;
            const codeBlockLine = lines[i] as Element;
            const codeSpan = codeBlockLine.lastChild as Element;
            if (codeSpan.innerHTML) {
              codeSpan.innerHTML = codeSpan.innerHTML.replace(
                /```(\w+)/,
                "```{$1}",
              );
            }
            newLines.push(codeBlockLine);
          } else {
            newLines.push(line);
          }
        }
        if (newLines.length !== lines.length) {
          const parent = (lines[0] as Element).parentElement!;
          parent.innerHTML = "";
          newLines.forEach((line) => {
            parent.appendChild(line);
            parent.appendChild(doc.createTextNode("\n"));
          });
        }
      }
    }

    // provide code tools in header
    if (formatHasCodeTools(format)) {
      // resolve what sort of code tools we will present
      const codeTools = resolveCodeTools(format, doc);
      if (codeTools.source || codeTools.toggle) {
        const title = doc.querySelector("#title-block-header > h1");
        if (title) {
          const header = (title as Element).parentElement;
          const titleDiv = doc.createElement("div");
          titleDiv.classList.add("quarto-title-block");
          const layoutDiv = doc.createElement("div");
          titleDiv.appendChild(layoutDiv);
          header?.replaceChild(titleDiv, title);
          layoutDiv.appendChild(title);
          const button = doc.createElement("button");
          button.setAttribute("type", "button");
          button.classList.add("btn").add("code-tools-button");
          const icon = doc.createElement("i");
          icon.classList.add("bi");
          button.appendChild(icon);
          if (codeTools.caption !== "none") {
            button.appendChild(doc.createTextNode(" " + codeTools.caption));
          }
          layoutDiv.appendChild(button);
          header!.appendChild(titleDiv);
          if (codeTools.toggle) {
            button.setAttribute("id", kCodeToolsMenuButtonId);
            button.classList.add("dropdown-toggle");
            button.setAttribute("data-bs-toggle", "dropdown");
            button.setAttribute("aria-expanded", "false");
            const ul = doc.createElement("ul");
            ul.classList.add("dropdown-menu").add("dropdown-menu-end");
            ul.setAttribute("aria-labelelledby", kCodeToolsMenuButtonId);
            const addListItem = (id: string, text: string) => {
              const a = doc.createElement("a");
              a.setAttribute("id", id);
              a.classList.add("dropdown-item");
              a.setAttribute("href", "javascript:void(0)");
              a.setAttribute("role", "button");
              a.appendChild(doc.createTextNode(text));
              const li = doc.createElement("li");
              li.appendChild(a);
              ul.appendChild(li);
              return li;
            };
            const addDivider = () => {
              const hr = doc.createElement("hr");
              hr.classList.add("dropdown-divider");
              const li = doc.createElement("li");
              li.appendChild(hr);
              ul.appendChild(li);
            };
            addListItem(
              kShowAllCodeLinkId,
              format.language[kCodeToolsShowAllCode]!,
            );
            addListItem(
              kHideAllCodeLinkId,
              format.language[kCodeToolsHideAllCode]!,
            );
            if (codeTools.source) {
              addDivider();
              const vsLi = addListItem(
                kViewSourceLinkId,
                format.language[kCodeToolsViewSource]!,
              );
              if (typeof (codeTools.source) === "string") {
                (vsLi.firstChild as Element).setAttribute(
                  kDataQuartoSourceUrl,
                  codeTools.source,
                );
              }
            }
            layoutDiv.appendChild(ul);
          } else {
            // no toggle, so just a button to show source code
            button.setAttribute("id", kCodeToolsSourceButtonId);
            if (typeof (codeTools.source) === "string") {
              button.setAttribute(kDataQuartoSourceUrl, codeTools.source);
            }
          }
        }
        if (codeTools.source) {
          // grab the embedded source code element
          const embeddedCode = doc.querySelector(`.${kEmbeddedSourceClass}`);
          if (embeddedCode) {
            // create a bootstrap model to wrap it
            const modalDiv = doc.createElement("div");
            modalDiv.classList.add("modal").add("fade");
            modalDiv.setAttribute("id", kEmbeddedSourceModalId);
            modalDiv.setAttribute("tabindex", "-1");
            modalDiv.setAttribute(
              "aria-labelledby",
              kEmbeddedSourceModalLabelId,
            );
            modalDiv.setAttribute("aria-hidden", "true");
            const modalDialogDiv = doc.createElement("div");
            modalDialogDiv.classList.add("modal-dialog").add(
              "modal-dialog-scrollable",
            );
            const modalContentDiv = doc.createElement("div");
            modalContentDiv.classList.add("modal-content");
            const modalDialogHeader = doc.createElement("div");
            modalDialogHeader.classList.add("modal-header");
            const h5 = doc.createElement("h5");
            h5.classList.add("modal-title");
            h5.setAttribute("id", kEmbeddedSourceModalLabelId);
            h5.appendChild(
              doc.createTextNode(format.language[kCodeToolsSourceCode]!),
            );
            modalDialogHeader.appendChild(h5);
            const button = doc.createElement("button");
            button.classList.add("btn-close");
            button.setAttribute("data-bs-dismiss", "modal");
            modalDialogHeader.appendChild(button);
            modalContentDiv.appendChild(modalDialogHeader);
            const modalBody = doc.createElement("div");
            modalBody.classList.add("modal-body");
            modalContentDiv.appendChild(modalBody);
            modalDialogDiv.appendChild(modalContentDiv);
            modalDiv.appendChild(modalDialogDiv);

            // insert it
            embeddedCode.parentElement?.insertBefore(modalDiv, embeddedCode);
            modalBody.appendChild(embeddedCode);
            embeddedCode.classList.delete(kEmbeddedSourceClass);
          }
        }
      }
    }

    return Promise.resolve(kHtmlEmptyPostProcessResult);
  };
}

interface CodeTools {
  source: boolean | string;
  toggle: boolean;
  caption: string;
}

function resolveCodeTools(format: Format, doc: Document): CodeTools {
  // determine user prefs
  const kCodeCaption = format.language[kCodeToolsMenuCaption]!;
  const codeTools = format?.render[kCodeTools];
  const codeToolsResolved = {
    source: typeof (codeTools) === "boolean"
      ? codeTools
      : codeTools?.source !== undefined
      ? codeTools?.source
      : true,
    toggle: typeof (codeTools) === "boolean" ? codeTools
    : codeTools?.toggle !== undefined
      ? !!codeTools?.toggle
      : true,
    caption: typeof (codeTools) === "boolean" ? kCodeCaption
    : codeTools?.caption || kCodeCaption,
  };

  // if we have request source, make sure we are able to keep source
  if (codeToolsResolved.source) {
    codeToolsResolved.source = !!format.render[kKeepSource];
  }

  // if we have requested toggle, make sure there are things to toggle
  if (codeToolsResolved.toggle) {
    const codeDetails = doc.querySelector(".cell > details > .sourceCode");
    const codeHidden = doc.querySelector(".cell .sourceCode.hidden");
    codeToolsResolved.toggle = codeToolsResolved.toggle &&
      (!!codeDetails || !!codeHidden);
  }

  // return resolved
  return codeToolsResolved;
}
