import ts from 'typescript';

export interface ActDocstring {
  raw: string;
  body: string;
  sections: {
    goals?: string;
    fixtures?: string;
    hints?: string;
    assertions?: string;
    other?: Record<string, string>;
  };
  startLine: number;
  endLine: number;
}

const KNOWN_SECTIONS = new Set(['goals', 'fixtures', 'hints', 'assertions']);

/**
 * Parse an @act docstring from a comment range.
 * Returns null if this comment is not an @act docstring.
 *
 * Rules:
 * - Must be a block comment, not a JSDoc comment
 * - First line of the comment body must be `@act` (with optional trailing whitespace)
 * - Body is freeform markdown with suggested sections (Goals, Fixtures, Hints, Assertions)
 */
export function parseActDocstring(
  comment: ts.CommentRange,
  source: ts.SourceFile,
): ActDocstring | null {
  if (comment.kind !== ts.SyntaxKind.MultiLineCommentTrivia) return null;

  const raw = source.text.substring(comment.pos, comment.end);

  // Reject JSDoc comments (start with /**)
  if (raw.startsWith('/**')) return null;

  // Extract inner text (between /* and */)
  const inner = raw.slice(2, -2);

  // First line must be @act (with optional trailing whitespace)
  const lines = inner.split('\n');
  const firstLine = lines[0].trim();
  if (firstLine !== '@act') return null;

  // Body is everything after the first line
  const bodyLines = lines.slice(1);

  // Strip uniform leading-asterisk-and-space if every non-empty line starts with ` * `
  const nonEmptyBodyLines = bodyLines.filter((l) => l.trim().length > 0);
  const allHaveAsterisk =
    nonEmptyBodyLines.length > 0 &&
    nonEmptyBodyLines.every((l) => /^\s*\* /.test(l) || /^\s*\*$/.test(l));

  let processedLines: string[];
  if (allHaveAsterisk) {
    processedLines = bodyLines.map((l) => {
      if (l.trim() === '') return '';
      if (/^\s*\*$/.test(l)) return '';
      return l.replace(/^\s*\* ?/, '');
    });
  } else {
    processedLines = bodyLines;
  }

  const body = processedLines.join('\n').trim();

  const sections = parseSections(body);

  const startLine = source.getLineAndCharacterOfPosition(comment.pos).line + 1;
  const endLine = source.getLineAndCharacterOfPosition(comment.end).line + 1;

  return { raw, body, sections, startLine, endLine };
}

function parseSections(body: string): ActDocstring['sections'] {
  const sections: ActDocstring['sections'] = {};
  if (!body) return sections;

  const lines = body.split('\n');
  let currentSection: string | null = null;
  let currentContent: string[] = [];
  const preSection: string[] = [];

  for (const line of lines) {
    const sectionMatch = line.match(/^##\s+(\S+.*)$/);
    if (sectionMatch) {
      if (currentSection) {
        storeSection(
          sections,
          currentSection,
          currentContent.join('\n').trim(),
        );
      }
      currentSection = sectionMatch[1].trim();
      currentContent = [];
    } else if (currentSection) {
      currentContent.push(line);
    } else {
      preSection.push(line);
    }
  }

  if (currentSection) {
    storeSection(sections, currentSection, currentContent.join('\n').trim());
  }

  return sections;
}

function storeSection(
  sections: ActDocstring['sections'],
  heading: string,
  content: string,
): void {
  const key = heading.toLowerCase();
  if (KNOWN_SECTIONS.has(key)) {
    (sections as Record<string, string>)[key] = content;
  } else {
    if (!sections.other) sections.other = {};
    sections.other[heading] = content;
  }
}

/**
 * Find the @act docstring immediately above a test() call.
 * Returns null if:
 * - No block comment exists above the test call
 * - The comment is not an @act docstring
 * - A blank line separates the comment from the test() call
 */
export function findActDocstringForTest(
  source: ts.SourceFile,
  testCall: ts.CallExpression,
): ActDocstring | null {
  // Get the statement that contains the test call
  const statement = findContainingStatement(source, testCall);
  const nodeForComments = statement ?? testCall;

  const leadingComments = ts.getLeadingCommentRanges(
    source.text,
    nodeForComments.getFullStart(),
  );
  if (!leadingComments || leadingComments.length === 0) return null;

  // Take the last leading comment (immediately above the test call)
  const lastComment = leadingComments[leadingComments.length - 1];

  // Check for blank line between comment end and test call start.
  // A blank line means the text between contains two consecutive newlines (\n\n),
  // indicating at least one fully empty line separating the comment from the test.
  const textBetween = source.text.substring(
    lastComment.end,
    nodeForComments.getStart(source),
  );
  if (/\n\s*\n/.test(textBetween)) return null;

  return parseActDocstring(lastComment, source);
}

function findContainingStatement(
  source: ts.SourceFile,
  node: ts.Node,
): ts.Statement | null {
  let current: ts.Node = node;
  while (current) {
    if (ts.isExpressionStatement(current)) {
      return current;
    }
    if (current.parent === source || !current.parent) break;
    current = current.parent;
  }
  return null;
}
