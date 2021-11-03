(() => {
  // binary-search.ts
  function glb(array, value, compare) {
    if (compare === void 0) {
      compare = (a, b) => a - b;
    }
    if (array.length === 0) {
      return -1;
    }
    if (array.length === 1) {
      if (compare(value, array[0]) < 0) {
        return -1;
      } else {
        return 0;
      }
    }
    let left = 0;
    let right = array.length - 1;
    let vLeft = array[left], vRight = array[right];
    if (compare(value, vRight) >= 0) {
      return right;
    }
    if (compare(value, vLeft) < 0) {
      return -1;
    }
    while (right - left > 1) {
      const center = left + (right - left >> 1);
      const vCenter = array[center];
      const cmp = compare(value, vCenter);
      if (cmp < 0) {
        right = center;
      } else if (cmp === 0) {
        left = center;
      } else {
        left = center;
      }
    }
    return left;
  }

  // text.ts
  function lines(text) {
    return text.split(/\r?\n/);
  }
  function normalizeNewlines(text) {
    return lines(text).join("\n");
  }
  function lineOffsets(text) {
    const offsets = [0];
    const re = /\r?\n/g;
    let match;
    while ((match = re.exec(text)) != null) {
      offsets.push(match.index);
    }
    return offsets;
  }
  function indexToRowCol(text) {
    const offsets = lineOffsets(text);
    return function(offset) {
      if (offset === 0) {
        return {
          line: 0,
          column: 0
        };
      }
      const startIndex = glb(offsets, offset);
      if (offset === offsets[startIndex]) {
        return {
          line: startIndex - 1,
          column: offsets[startIndex] - offsets[startIndex - 1]
        };
      } else {
        return {
          line: startIndex,
          column: offset - offsets[startIndex] - 1
        };
      }
    };
  }
  function rowColToIndex(text) {
    const offsets = lineOffsets(text);
    return function(position) {
      return offsets[position.row] + position.column;
    };
  }
  function formatLineRange(text, firstLine, lastLine) {
    const lineWidth = Math.max(String(firstLine + 1).length, String(lastLine + 1).length);
    const pad = " ".repeat(lineWidth);
    const ls = lines(text);
    const result2 = [];
    for (let i = firstLine; i <= lastLine; ++i) {
      const numberStr = `${pad}${i + 1}`.slice(-lineWidth);
      const lineStr = ls[i];
      result2.push({
        lineNumber: i,
        content: numberStr + lineStr,
        rawLine: ls[i]
      });
    }
    return {
      prefixWidth: lineWidth + 2,
      lines: result2
    };
  }

  // ranged-text.ts
  function rangedSubstring(src, start, end = -1) {
    if (end === -1) {
      end = src.length;
    }
    const substring = src.substring(start, end);
    return {
      substring,
      range: { start, end }
    };
  }
  function matchAll(str, regex) {
    let match;
    regex = new RegExp(regex);
    const result2 = [];
    while ((match = regex.exec(str)) != null) {
      result2.push(match);
    }
    return result2;
  }
  function rangedLines(text) {
    const regex = /\r?\n/g;
    const result2 = [];
    let startOffset = 0;
    for (const r of matchAll(text, regex)) {
      result2.push({
        substring: text.substring(startOffset, r.index),
        range: {
          start: startOffset,
          end: r.index
        }
      });
      startOffset = r.index + r[0].length;
    }
    result2.push({
      substring: text.substring(startOffset, text.length),
      range: {
        start: startOffset,
        end: text.length
      }
    });
    return result2;
  }

  // mapped-text.ts
  function mappedString(source, pieces) {
    ;
    if (typeof source === "string") {
      let map = function(targetOffset) {
        const ix = glb(offsetInfo, { offset: targetOffset }, (a, b) => a.offset - b.offset);
        if (ix < 0) {
          return void 0;
        }
        const info = offsetInfo[ix];
        if (!info.fromSource) {
          return void 0;
        }
        const localOffset = targetOffset - info.offset;
        if (localOffset >= info.length) {
          return void 0;
        }
        return info.range.start + localOffset;
      }, mapClosest = function(targetOffset) {
        if (offsetInfo.length === 0 || targetOffset < 0) {
          return void 0;
        }
        const firstIx = glb(offsetInfo, { offset: targetOffset }, (a, b) => a.offset - b.offset);
        let ix = firstIx;
        let smallestSourceInfo = void 0;
        while (ix >= 0) {
          const info = offsetInfo[ix];
          if (!info.fromSource) {
            ix--;
            continue;
          }
          smallestSourceInfo = info;
          if (ix === firstIx) {
            const localOffset = targetOffset - info.offset;
            if (localOffset < info.length) {
              return info.range.start + localOffset;
            }
          }
          return info.range.end - 1;
        }
        if (smallestSourceInfo === void 0) {
          return void 0;
        } else {
          return smallestSourceInfo.range.start;
        }
      };
      const offsetInfo = [];
      let offset = 0;
      const resultList = pieces.map((piece) => {
        if (typeof piece === "string") {
          offsetInfo.push({
            fromSource: false,
            length: piece.length,
            offset
          });
          offset += piece.length;
          return piece;
        } else {
          const resultPiece = source.substring(piece.start, piece.end);
          offsetInfo.push({
            fromSource: true,
            length: resultPiece.length,
            offset,
            range: {
              start: piece.start,
              end: piece.end
            }
          });
          offset += resultPiece.length;
          return resultPiece;
        }
      });
      const value = resultList.join("");
      return {
        value,
        originalString: source,
        map,
        mapClosest
      };
    } else {
      let composeMap = function(offset) {
        const v = nextMap(offset);
        if (v === void 0) {
          return v;
        }
        return previousMap(v);
      }, composeMapClosest = function(offset) {
        const v = nextMapClosest(offset);
        if (v === void 0) {
          return v;
        }
        return previousMapClosest(v);
      };
      const {
        value,
        originalString,
        map: previousMap,
        mapClosest: previousMapClosest
      } = source;
      const {
        value: resultValue,
        map: nextMap,
        mapClosest: nextMapClosest
      } = mappedString(value, pieces);
      return {
        value: resultValue,
        originalString,
        map: composeMap,
        mapClosest: composeMapClosest
      };
    }
  }
  function asMappedString(str) {
    return {
      value: str,
      originalString: str,
      map: (x) => x,
      mapClosest: (x) => x
    };
  }
  function mappedConcat(strings) {
    if (strings.length === 0) {
      throw new Error("strings must be non-empty");
    }
    let currentOffset = 0;
    const offsets = [];
    for (const s of strings) {
      currentOffset += s.value.length;
      offsets.push(currentOffset);
    }
    const value = "".concat(...strings.map((s) => s.value));
    return {
      value,
      originalString: strings[0].originalString,
      map(offset) {
        if (offset < 0 || offset >= value.length) {
          return void 0;
        }
        const ix = glb(offsets, offset);
        return strings[ix].map(offset - offsets[ix]);
      },
      mapClosest(offset) {
        if (offset < 0 || offset >= value.length) {
          return void 0;
        }
        const ix = glb(offsets, offset);
        return strings[ix].mapClosest(offset - offsets[ix]);
      }
    };
  }
  function mappedIndexToRowCol(text) {
    const f = indexToRowCol(text.originalString);
    return function(offset) {
      const n = text.mapClosest(offset);
      if (n === void 0) {
        throw new Error("Internal Error: bad offset in mappedIndexRowCol");
      }
      return f(n);
    };
  }

  // partition-cell-options.ts
  function mappedSource(source, substrs) {
    const params = [];
    for (const { range } of substrs) {
      params.push(range);
      params.push("\n");
    }
    params.pop();
    return mappedString(source, params);
  }
  function partitionCellOptionsMapped(language, source, validate = false) {
    const commentChars = langCommentChars(language);
    const optionPrefix = optionCommentPrefix(commentChars[0]);
    const optionSuffix = commentChars[1] || "";
    const optionsSource = [];
    const yamlLines = [];
    let endOfYaml = 0;
    for (const line of rangedLines(source.value)) {
      if (line.substring.startsWith(optionPrefix)) {
        if (!optionSuffix || line.substring.trimRight().endsWith(optionSuffix)) {
          let yamlOption = line.substring.substring(optionPrefix.length);
          if (optionSuffix) {
            yamlOption = yamlOption.trimRight();
            yamlOption = yamlOption.substring(0, yamlOption.length - optionSuffix.length);
          }
          endOfYaml = line.range.start + optionPrefix.length + yamlOption.length - optionSuffix.length;
          const rangedYamlOption = {
            substring: yamlOption,
            range: {
              start: line.range.start + optionPrefix.length,
              end: endOfYaml
            }
          };
          yamlLines.push(rangedYamlOption);
          optionsSource.push(line);
          continue;
        }
      }
      break;
    }
    let mappedYaml = yamlLines.length ? mappedSource(source, yamlLines) : void 0;
    return {
      mappedYaml,
      optionsSource,
      source: mappedString(source, [{ start: endOfYaml, end: source.value.length }]),
      sourceStartLine: yamlLines.length
    };
  }
  function langCommentChars(lang) {
    const chars = kLangCommentChars[lang] || "#";
    if (!Array.isArray(chars)) {
      return [chars];
    } else {
      return chars;
    }
  }
  function optionCommentPrefix(comment) {
    return comment + "| ";
  }
  var kLangCommentChars = {
    r: "#",
    python: "#",
    julia: "#",
    scala: "//",
    matlab: "%",
    csharp: "//",
    fsharp: "//",
    c: ["/*", "*/"],
    css: ["/*", "*/"],
    sas: ["*", ";"],
    powershell: "#",
    bash: "#",
    sql: "--",
    mysql: "--",
    psql: "--",
    lua: "--",
    cpp: "//",
    cc: "//",
    stan: "#",
    octave: "#",
    fortran: "!",
    fortran95: "!",
    awk: "#",
    gawk: "#",
    stata: "*",
    java: "//",
    groovy: "//",
    sed: "#",
    perl: "#",
    ruby: "#",
    tikz: "%",
    js: "//",
    d3: "//",
    node: "//",
    sass: "//",
    coffee: "#",
    go: "//",
    asy: "//",
    haskell: "--",
    dot: "//",
    ojs: "//"
  };

  // break-quarto-md.ts
  function breakQuartoMd(src, validate = false) {
    const nb = {
      cells: []
    };
    const yamlRegEx = /^---\s*$/;
    const startCodeCellRegEx = new RegExp("^\\s*```+\\s*\\{([=A-Za-z]+)( *[ ,].*)?\\}\\s*$");
    const startCodeRegEx = /^```/;
    const endCodeRegEx = /^```\s*$/;
    const delimitMathBlockRegEx = /^\$\$/;
    let language = "";
    const lineBuffer = [];
    const flushLineBuffer = (cell_type) => {
      if (lineBuffer.length) {
        const mappedChunks = [];
        for (const line of lineBuffer) {
          mappedChunks.push(line.range);
          mappedChunks.push("\n");
        }
        mappedChunks.pop();
        const source = mappedString(src, mappedChunks);
        const cell = {
          cell_type: cell_type === "code" ? { language } : cell_type,
          source,
          sourceOffset: 0,
          sourceStartLine: 0,
          sourceVerbatim: source
        };
        if (cell_type === "code" && (language === "ojs" || language === "dot")) {
          const { yaml, source: source2, sourceStartLine } = partitionCellOptionsMapped(language, cell.source, validate);
          const breaks = lineOffsets(cell.source.value).slice(1);
          let strUpToLastBreak = "";
          if (sourceStartLine > 0) {
            if (breaks.length) {
              const lastBreak = breaks[Math.min(sourceStartLine - 1, breaks.length - 1)];
              strUpToLastBreak = cell.source.value.substring(0, lastBreak);
            } else {
              strUpToLastBreak = cell.source.value;
            }
          }
          cell.sourceOffset = strUpToLastBreak.length + "```{ojs}\n".length;
          cell.sourceVerbatim = mappedString(cell.sourceVerbatim, [
            "```{ojs}\n",
            { start: 0, end: cell.sourceVerbatim.value.length },
            "\n```"
          ]);
          cell.source = source2;
          cell.options = yaml;
          cell.sourceStartLine = sourceStartLine;
        }
        if (mdTrimEmptyLines(lines(cell.source.value)).length > 0) {
          nb.cells.push(cell);
        }
        lineBuffer.splice(0, lineBuffer.length);
      }
    };
    let inYaml = false, inMathBlock = false, inCodeCell = false, inCode = false;
    for (const line of rangedLines(src.value)) {
      if (yamlRegEx.test(line.substring) && !inCodeCell && !inCode && !inMathBlock) {
        if (inYaml) {
          lineBuffer.push(line);
          flushLineBuffer("raw");
          inYaml = false;
        } else {
          flushLineBuffer("markdown");
          lineBuffer.push(line);
          inYaml = true;
        }
      } else if (startCodeCellRegEx.test(line.substring)) {
        const m = line.substring.match(startCodeCellRegEx);
        language = m[1];
        flushLineBuffer("markdown");
        inCodeCell = true;
      } else if (endCodeRegEx.test(line.substring)) {
        if (inCodeCell) {
          inCodeCell = false;
          flushLineBuffer("code");
        } else {
          inCode = !inCode;
          lineBuffer.push(line);
        }
      } else if (startCodeRegEx.test(line.substring)) {
        inCode = true;
        lineBuffer.push(line);
      } else if (delimitMathBlockRegEx.test(line.substring)) {
        if (inMathBlock) {
          flushLineBuffer("math");
        } else {
          if (inYaml || inCode || inCodeCell) {
          } else {
            flushLineBuffer("markdown");
          }
        }
        inMathBlock = !inMathBlock;
        lineBuffer.push(line);
      } else {
        lineBuffer.push(line);
      }
    }
    flushLineBuffer("markdown");
    return nb;
  }
  function mdTrimEmptyLines(lines3) {
    const firstNonEmpty = lines3.findIndex((line) => line.trim().length > 0);
    if (firstNonEmpty === -1) {
      return [];
    }
    lines3 = lines3.slice(firstNonEmpty);
    let lastNonEmpty = -1;
    for (let i = lines3.length - 1; i >= 0; i--) {
      if (lines3[i].trim().length > 0) {
        lastNonEmpty = i;
        break;
      }
    }
    if (lastNonEmpty > -1) {
      lines3 = lines3.slice(0, lastNonEmpty + 1);
    }
    return lines3;
  }

  // promise.ts
  var PromiseQueue = class {
    constructor() {
      this.queue = new Array();
      this.running = false;
    }
    enqueue(promise, clearPending = false) {
      return new Promise((resolve, reject) => {
        if (clearPending) {
          this.queue.splice(0, this.queue.length);
        }
        this.queue.push({
          promise,
          resolve,
          reject
        });
        this.dequeue();
      });
    }
    dequeue() {
      if (this.running) {
        return false;
      }
      const item = this.queue.shift();
      if (!item) {
        return false;
      }
      try {
        this.running = true;
        item.promise().then((value) => {
          this.running = false;
          item.resolve(value);
          this.dequeue();
        }).catch((err) => {
          this.running = false;
          item.reject(err);
          this.dequeue();
        });
      } catch (err) {
        this.running = false;
        item.reject(err);
        this.dequeue();
      }
      return true;
    }
  };

  // schema.ts
  function schemaType(schema) {
    const t = schema.type;
    if (t)
      return t;
    if (schema.anyOf) {
      return "anyOf";
    }
    if (schema.oneOf) {
      return "oneOf";
    }
    if (schema.allOf) {
      return "allOf";
    }
    if (schema.enum) {
      return "enum";
    }
    return "any";
  }
  function schemaCompletions(schema) {
    const normalize = (completions) => {
      const result2 = (schema.completions || []).map((c) => {
        if (typeof c === "string") {
          return {
            type: "value",
            display: c,
            value: c,
            description: "",
            suggest_on_accept: false,
            schema
          };
        }
        return {
          ...c,
          schema
        };
      });
      return result2;
    };
    if (schema.completions && schema.completions.length) {
      return normalize(schema.completions);
    }
    switch (schemaType(schema)) {
      case "array":
        if (schema.items) {
          return schemaCompletions(schema.items);
        } else {
          return [];
        }
      case "anyOf":
        return schema.anyOf.map(schemaCompletions).flat();
      case "oneOf":
        return schema.oneOf.map(schemaCompletions).flat();
      case "allOf":
        return schema.allOf.map(schemaCompletions).flat();
      default:
        return [];
    }
  }
  function walkSchema(schema, f) {
    f(schema);
    switch (schemaType(schema)) {
      case "array":
        if (schema.items) {
          walkSchema(schema.items, f);
        }
        ;
        break;
      case "anyOf":
        for (const s of schema.anyOf) {
          walkSchema(s, f);
        }
        break;
      case "oneOf":
        for (const s of schema.oneOf) {
          walkSchema(s, f);
        }
        break;
      case "allOf":
        for (const s of schema.allOf) {
          walkSchema(s, f);
        }
        break;
      case "object":
        if (schema.properties) {
          for (const key of Object.getOwnPropertyNames(schema.properties)) {
            const s = schema.properties[key];
            walkSchema(s, f);
          }
        }
        if (schema.additionalProperties) {
          walkSchema(schema.additionalProperties, f);
        }
        break;
    }
  }
  function normalizeSchema(schema) {
    const result2 = JSON.parse(JSON.stringify(schema));
    walkSchema(result2, (schema2) => {
      if (schema2.completions) {
        delete schema2.completions;
      }
      if (schema2.exhaustiveCompletions) {
        delete schema2.exhaustiveCompletions;
      }
      if (schema2.documentation) {
        delete schema2.documentation;
      }
    });
    return result2;
  }

  // yaml-schema.ts
  var ajv = void 0;
  function setupAjv(_ajv) {
    ajv = _ajv;
  }
  function navigate(path, annotation, returnKey = false, pathIndex = 0) {
    if (pathIndex >= path.length) {
      return annotation;
    }
    if (annotation.kind === "mapping" || annotation.kind === "block_mapping") {
      const { components } = annotation;
      const searchKey = path[pathIndex];
      for (let i = 0; i < components.length; i += 2) {
        const key = components[i].result;
        if (key === searchKey) {
          if (returnKey && pathIndex === path.length - 1) {
            return navigate(path, components[i], returnKey, pathIndex + 1);
          } else {
            return navigate(path, components[i + 1], returnKey, pathIndex + 1);
          }
        }
      }
      throw new Error("Internal error: searchKey not found in mapping object");
    } else if (annotation.kind === "sequence" || annotation.kind === "block_sequence") {
      const searchKey = Number(path[pathIndex]);
      return navigate(path, annotation.components[searchKey], returnKey, pathIndex + 1);
    } else {
      throw new Error(`Internal error: unexpected kind ${annotation.kind}`);
    }
  }
  function navigateSchema(path, schema, pathIndex = 0) {
    if (pathIndex >= path.length - 1) {
      return schema;
    }
    const pathVal = path[pathIndex];
    if (pathVal === "properties") {
      const key = path[pathIndex + 1];
      const subSchema = schema.properties[key];
      return navigateSchema(path, subSchema, pathIndex + 2);
    } else if (pathVal === "anyOf") {
      const key = Number(path[pathIndex + 1]);
      const subSchema = schema.anyOf[key];
      return navigateSchema(path, subSchema, pathIndex + 2);
    } else if (pathVal === "oneOf") {
      const key = Number(path[pathIndex + 1]);
      const subSchema = schema.oneOf[key];
      return navigateSchema(path, subSchema, pathIndex + 2);
    } else if (pathVal === "items") {
      const subSchema = schema.items;
      return navigateSchema(path, subSchema, pathIndex + 1);
    } else {
      console.log({ path });
      throw new Error("Internal error: Failed to navigate schema path");
    }
  }
  function isProperPrefix(a, b) {
    return b.length > a.length && b.substring(0, a.length) === a;
  }
  function localizeAndPruneErrors(annotation, validationErrors, source, schema) {
    const result2 = [];
    const locF = mappedIndexToRowCol(source);
    const errorsPerInstanceMap = {};
    let errorsPerInstanceList = [];
    for (let error of validationErrors) {
      let { instancePath } = error;
      if (error.keyword === "additionalProperties") {
        instancePath = `${instancePath}/${error.params.additionalProperty}`;
        error = {
          ...error,
          instancePath,
          keyword: "_custom_invalidProperty",
          message: `property ${error.params.additionalProperty} not allowed in object`,
          params: {
            ...error.params,
            originalError: error
          },
          schemaPath: error.schemaPath.slice(0, -21)
        };
      }
      if (errorsPerInstanceMap[instancePath] === void 0) {
        const errors = [];
        const namedError = {
          instancePath,
          errors
        };
        errorsPerInstanceMap[instancePath] = namedError;
        errorsPerInstanceList.push(namedError);
      }
      errorsPerInstanceMap[instancePath].errors.push(error);
    }
    errorsPerInstanceList = errorsPerInstanceList.filter(({ instancePath: pathA }) => errorsPerInstanceList.filter(({ instancePath: pathB }) => isProperPrefix(pathA, pathB)).length === 0);
    debugger;
    for (let { instancePath, errors } of errorsPerInstanceList) {
      const path = instancePath.split("/").slice(1);
      errors = errors.filter((error) => {
        if (["enum", "type"].indexOf(error.keyword) === -1) {
          return true;
        }
        return !errors.some((otherError) => ["oneOf", "anyOf"].indexOf(otherError.keyword) !== -1);
      });
      errors = errors.filter((error) => ["oneOf", "anyOf"].indexOf(error.keyword) === -1);
      for (const error of errors) {
        const returnKey = error.keyword === "_custom_invalidProperty";
        const violatingObject = navigate(path, annotation, returnKey);
        const schemaPath = error.schemaPath.split("/").slice(1);
        const innerSchema = navigateSchema(schemaPath, schema);
        let message = "";
        const start = locF(violatingObject.start);
        const end = locF(violatingObject.end);
        const locStr = start.line === end.line ? `(line ${start.line + 1}, columns ${start.column + 1}--${end.column + 1})` : `(line ${start.line + 1}, column ${start.column + 1} through line ${end.line + 1}, column ${end.column + 1})`;
        let messageNoLocation;
        if (error.keyword === "_custom_invalidProperty") {
          messageNoLocation = error.message;
        } else {
          messageNoLocation = `Expected field ${instancePath} to ${innerSchema.description}`;
        }
        message = `${locStr}: ${messageNoLocation}`;
        result2.push({
          instancePath,
          violatingObject,
          message,
          messageNoLocation,
          source,
          start,
          end,
          error
        });
      }
    }
    result2.sort((a, b) => a.violatingObject.start - b.violatingObject.start);
    return result2;
  }
  var YAMLSchema = class {
    constructor(schema) {
      this.schema = schema;
      this.validate = ajv.compile(normalizeSchema(schema));
    }
    validateParse(src, annotation) {
      let errors = [];
      if (!this.validate(annotation.result)) {
        errors = localizeAndPruneErrors(annotation, this.validate.errors, src, this.schema);
        return {
          result: annotation.result,
          errors
        };
      } else {
        return {
          result: annotation.result,
          errors: []
        };
      }
    }
    reportErrorsInSource(result2, src, message, error) {
      if (result2.errors.length) {
        const locF = mappedIndexToRowCol(src);
        const nLines = lines(src.originalString).length;
        error(message);
        for (const err of result2.errors) {
          console.log(err.message);
          let startO = err.violatingObject.start;
          let endO = err.violatingObject.end;
          while (src.mapClosest(startO) < src.originalString.length - 1 && src.originalString[src.mapClosest(startO)].match(/\s/)) {
            startO++;
          }
          while (src.mapClosest(endO) > src.mapClosest(startO) && src.originalString[src.mapClosest(endO)].match(/\s/)) {
            endO--;
          }
          const start = locF(startO);
          const end = locF(endO);
          const {
            prefixWidth,
            lines: lines3
          } = formatLineRange(src.originalString, Math.max(0, start.line - 1), Math.min(end.line + 1, nLines - 1));
          for (const { lineNumber, content, rawLine } of lines3) {
            console.log(content);
            if (lineNumber >= start.line && lineNumber <= end.line) {
              const startColumn = lineNumber > start.line ? 0 : start.column;
              const endColumn = lineNumber < end.line ? rawLine.length : end.column;
              console.log(" ".repeat(prefixWidth + startColumn) + "^".repeat(endColumn - startColumn + 1));
            }
          }
        }
      }
      return result2;
    }
    validateParseWithErrors(src, annotation, message, error) {
      const result2 = this.validateParse(src, annotation);
      this.reportErrorsInSource(result2, src, message, error);
      return result2;
    }
  };

  // index.ts
  var result = {
    glb,
    breakQuartoMd,
    mappedString,
    asMappedString,
    mappedConcat,
    mappedIndexToRowCol,
    partitionCellOptionsMapped,
    kLangCommentChars,
    PromiseQueue,
    rangedSubstring,
    rangedLines,
    lineOffsets,
    lines,
    normalizeNewlines,
    indexToRowCol,
    rowColToIndex,
    schemaType,
    schemaCompletions,
    YAMLSchema,
    setupAjv
  };
  if (window) {
    window._quartoCoreLib = result;
  }
})();
