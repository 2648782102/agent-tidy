import type { SourceLocation } from "../types.js";

export interface TomlBlock {
  header: string;
  keyPath: string[];
  startLine: number;
  endLine: number;
  raw: string;
}

export interface TomlHeader {
  header: string;
  keyPath: string[];
  line: number;
}

export function parseTomlHeader(line: string): TomlHeader | undefined {
  const match = /^\s*\[{1,2}\s*([^\]]+?)\s*\]{1,2}\s*(?:#.*)?$/.exec(line);
  if (!match) return undefined;
  const raw = (match[1] ?? "").trim();
  const keyPath: string[] = [];
  let current = "";
  let quote: '"' | "'" | undefined;
  for (const character of raw) {
    if (quote) {
      if (character === quote) quote = undefined;
      else current += character;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === ".") {
      keyPath.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }
  keyPath.push(current.trim());
  return { header: line.trim(), keyPath, line: 0 };
}

export function splitTomlBlocks(text: string): TomlBlock[] {
  const lines = text.split("\n");
  const headers: TomlHeader[] = [];
  lines.forEach((line, index) => {
    const header = parseTomlHeader(line);
    if (header) headers.push({ ...header, line: index });
  });
  return headers.map((header, index) => {
    const endLine = index + 1 < headers.length ? (headers[index + 1]?.line ?? lines.length) : lines.length;
    return {
      header: header.header,
      keyPath: header.keyPath,
      startLine: header.line,
      endLine,
      raw: lines.slice(header.line, endLine).join("\n"),
    };
  });
}

export function blockLocation(path: string, block: TomlBlock, field?: string): SourceLocation {
  return { path, line: block.startLine + 1, ...(field ? { field } : {}) };
}

export function disableTomlBlock(text: string, block: TomlBlock): string {
  const lines = text.split("\n");
  const slice = lines.slice(block.startLine, block.endLine);
  const transformed = slice.map((line, index) => {
    if (index === 0) return line.replace(/^\s*\[{1,2}/, (match) => `${match}disabled.`);
    return line;
  });
  lines.splice(block.startLine, slice.length, ...transformed);
  return lines.join("\n");
}
