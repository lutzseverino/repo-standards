import { randomUUID } from 'node:crypto';
import { marked, Renderer } from '../../vendor/marked/marked.esm.js';
import { parseFragment } from '../../vendor/parse5/parse5.esm.js';

const blockElements = new Set([
  'address', 'article', 'aside', 'blockquote', 'details', 'dialog', 'div', 'dl', 'fieldset',
  'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header',
  'hgroup', 'hr', 'li', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'table', 'ul',
]);
const codeElements = new Set(['code', 'pre']);
const renderedElementsWithoutText = new Set([
  'audio', 'canvas', 'embed', 'hr', 'iframe', 'img', 'input', 'math', 'object', 'picture', 'svg', 'video',
]);
const defaultNonRenderedElements = new Set(['script', 'style', 'template']);

function attribute(node, name) {
  return node.attrs?.find(candidate => candidate.name === name)?.value ?? null;
}

function visibility(additionalNonRenderedElements) {
  const nonRenderedElements = new Set([
    ...defaultNonRenderedElements,
    ...(additionalNonRenderedElements ?? []),
  ]);
  return node => nonRenderedElements.has(node.tagName) || attribute(node, 'hidden') !== null;
}

function renderedText(node, isHidden) {
  if (node.nodeName === '#text') return node.value;
  if (isHidden(node)) return '';
  if (node.tagName === 'img') return attribute(node, 'alt') ?? '';
  return (node.childNodes ?? []).map(child => renderedText(child, isHidden)).join('');
}

function containsHeading(node, isHidden) {
  if (isHidden(node)) return false;
  return (node.childNodes ?? []).some(child => (
    /^h[1-6]$/.test(child.tagName) || containsHeading(child, isHidden)
  ));
}

function semanticElements(fragment, isHidden, markdownHeadingMarker) {
  const elements = [];
  const visitTargets = node => {
    if (isHidden(node)) return;
    if (node.tagName === 'a') {
      elements.push({
        type: 'link',
        text: renderedText(node, isHidden).trim(),
        target: attribute(node, 'href') ?? '',
        insideHeading: true,
      });
    } else if (node.tagName === 'img') {
      elements.push({
        type: 'image',
        text: attribute(node, 'alt') ?? '',
        target: attribute(node, 'src') ?? '',
        insideHeading: true,
      });
      return;
    }
    for (const child of node.childNodes ?? []) visitTargets(child);
  };
  const visit = (node, centered = false) => {
    if (isHidden(node)) return;
    if (node.nodeName === '#text') {
      if (node.value.trim()) elements.push({ type: 'text', text: node.value });
      return;
    }

    const ownCenter = attribute(node, 'align')?.toLocaleLowerCase('en-US') === 'center';
    if (/^h[1-6]$/.test(node.tagName)) {
      const text = renderedText(node, isHidden).trim();
      if (text) elements.push({
        type: 'heading',
        level: Number(node.tagName[1]),
        name: text,
        text,
        centered: ownCenter || centered,
        folded: text.toLocaleLowerCase('en-US'),
        source: attribute(node, 'data-repo-canon-markdown-heading') === markdownHeadingMarker
          ? 'markdown'
          : 'html',
      });
      for (const child of node.childNodes ?? []) visitTargets(child);
      return;
    }
    if (node.tagName === 'a') {
      elements.push({ type: 'link', text: renderedText(node, isHidden).trim(), target: attribute(node, 'href') ?? '' });
      if (containsHeading(node, isHidden)) {
        for (const child of node.childNodes ?? []) visit(child, centered);
      }
      return;
    }
    if (node.tagName === 'img') {
      elements.push({ type: 'image', text: attribute(node, 'alt') ?? '', target: attribute(node, 'src') ?? '' });
      return;
    }
    if (renderedElementsWithoutText.has(node.tagName)) elements.push({ type: 'content' });
    const insideCenter = centered || (node.tagName === 'div' && ownCenter);
    for (const child of node.childNodes ?? []) visit(child, insideCenter);
  };
  visit(fragment);
  return elements;
}

function renderedContent(fragment, isHidden, markdownHeadingMarker) {
  const elements = semanticElements(fragment, isHidden, markdownHeadingMarker);
  return {
    elements,
    hasContent: elements.length > 0,
    text({
      includeCode = true,
      includeKeyboardInput = includeCode,
      includeImageAlt = true,
      includeLinkTargets = false,
      blockBreaks = false,
    } = {}) {
      const links = [];
      const fragments = [];
      let text = '';
      const append = value => {
        if (includeLinkTargets) fragments.push(value);
        else text += value;
      };
      const stack = [{ node: fragment, closing: false }];
      while (stack.length) {
        const { node, closing } = stack.pop();
        if (closing) {
          append('\n');
          continue;
        }
        if (node.nodeName === '#comment') continue;
        if (node.nodeName === '#text') {
          append(node.value);
          continue;
        }
        if (isHidden(node)
            || (!includeCode && codeElements.has(node.tagName))
            || (!includeKeyboardInput && node.tagName === 'kbd')) continue;
        if (node.tagName === 'a') {
          const href = attribute(node, 'href');
          if (href) {
            links.push(href);
            if (includeLinkTargets) fragments.push(href);
          }
        }
        if (includeImageAlt && node.tagName === 'img') append(attribute(node, 'alt') ?? '');
        if (blockBreaks && node.tagName === 'br') append('\n');
        if (blockBreaks && blockElements.has(node.tagName)) stack.push({ node, closing: true });
        const children = node.childNodes ?? [];
        for (let index = children.length - 1; index >= 0; index -= 1) {
          stack.push({ node: children[index], closing: false });
        }
      }
      return { text: includeLinkTargets ? fragments.join('\n') : text, links };
    },
  };
}

function markdownInlineText(tokens) {
  return (tokens ?? []).map(token => {
    if (token.type === 'html') return '';
    if (token.type === 'codespan') return token.text;
    if (token.tokens) return markdownInlineText(token.tokens);
    return typeof token.text === 'string' ? token.text : '';
  }).join('');
}

function normalizedHeadingName(value, stripTrailingColon) {
  let normalized = value.replace(/[\t\f\v ]+/g, ' ').replace(/ *\n */g, '\n').trim();
  if (stripTrailingColon) normalized = normalized.replace(/:\s*$/, '').trim();
  return normalized.toLocaleLowerCase('en-US');
}

function markdownTokenSpans(markdown, tokens) {
  let cursor = 0;
  return tokens.map(token => {
    const index = markdown.indexOf(token.raw, cursor);
    if (index === -1) throw new Error(`Could not locate parsed Markdown token after offset ${cursor}.`);
    cursor = index + token.raw.length;
    return { token, index };
  });
}

function headingName(token, nameSource, isHidden) {
  if (nameSource === 'markdown') return markdownInlineText(token.tokens);
  const fragment = parseFragment(marked.Parser.parseInline(token.tokens));
  return renderedContent(fragment, isHidden, null).text({ blockBreaks: true }).text;
}

function sectionMap(markdown, tokens, names, options, renderTokens, renderMarkdown, isHidden) {
  const accepted = new Set([...names].map(name => normalizedHeadingName(name, options.stripTrailingColon)));
  const sections = new Map();
  const record = (key, value) => {
    const occurrences = sections.get(key) ?? [];
    occurrences.push(value);
    sections.set(key, occurrences);
  };
  const keyFor = token => normalizedHeadingName(
    headingName(token, options.nameSource, isHidden),
    options.stripTrailingColon,
  );

  if (options.hierarchy === 'matching') {
    let current = null;
    for (const token of tokens) {
      if (token.type === 'heading') {
        const key = keyFor(token);
        if (!accepted.has(key)) {
          if (!current || token.depth <= current.level) current = null;
          continue;
        }
        current = { key, level: token.depth, tokens: [] };
        record(key, current);
        continue;
      }
      if (current) current.tokens.push(token);
    }
    for (const occurrences of sections.values()) {
      for (const section of occurrences) {
        section.source = section.tokens.map(token => token.raw).join('');
        section.content = renderTokens(section.tokens);
        delete section.tokens;
      }
    }
    return sections;
  }

  const headings = markdownTokenSpans(markdown, tokens)
    .filter(({ token }) => token.type === 'heading')
    .map(({ token, index }) => ({
      index,
      length: token.raw.length,
      level: token.depth,
      key: keyFor(token),
    }));
  const hierarchy = [];
  const selected = [];
  for (const heading of headings) {
    while (hierarchy.length > 0 && heading.level <= hierarchy.at(-1).level) hierarchy.pop();
    const insideSection = hierarchy.some(entry => entry.section);
    const section = accepted.has(heading.key) && !insideSection;
    if (section) selected.push(heading);
    hierarchy.push({ level: heading.level, section });
  }
  for (const heading of selected) {
    const start = heading.index + heading.length;
    const nextPeer = headings.find(candidate => candidate.index > heading.index && candidate.level <= heading.level);
    const end = nextPeer?.index ?? markdown.length;
    const source = markdown.slice(start, end).trim();
    record(heading.key, { key: heading.key, level: heading.level, source, content: renderMarkdown(source) });
  }
  return sections;
}

export function interpretMarkdown(markdown, { additionalNonRenderedElements = [] } = {}) {
  const normalizedMarkdown = markdown.replace(/\r\n?/g, '\n');
  const tokens = marked.lexer(normalizedMarkdown);
  const isHidden = visibility(additionalNonRenderedElements);
  const renderTokens = selectedTokens => {
    const marker = randomUUID();
    const renderer = new Renderer();
    renderer.heading = function ({ depth, tokens: headingTokens }) {
      return `<h${depth} data-repo-canon-markdown-heading="${marker}">${this.parser.parseInline(headingTokens)}</h${depth}>`;
    };
    return renderedContent(parseFragment(marked.parser(selectedTokens, { renderer })), isHidden, marker);
  };
  const renderMarkdown = source => renderTokens(marked.lexer(source));
  const content = renderTokens(tokens);
  const headings = content.elements.flatMap((element, index) => {
    if (element.type !== 'heading') return [];
    const end = content.elements.findIndex((candidate, candidateIndex) => (
      candidateIndex > index && candidate.type === 'heading' && candidate.level <= element.level
    ));
    const bodyElements = content.elements
      .slice(index + 1, end < 0 ? content.elements.length : end)
      .filter(candidate => !candidate.insideHeading);
    return [{ ...element, body: { elements: bodyElements } }];
  });
  const markdownHeadings = markdownTokenSpans(normalizedMarkdown, tokens)
    .filter(({ token }) => token.type === 'heading')
    .map(({ token, index }) => ({
      index,
      length: token.raw.length,
      level: token.depth,
      name: markdownInlineText(token.tokens),
    }));

  return {
    content,
    headings,
    markdownHeadings,
    sections(names, {
      hierarchy = 'outermost',
      nameSource = 'markdown',
      stripTrailingColon = false,
    } = {}) {
      if (!['matching', 'outermost'].includes(hierarchy)) throw new Error(`Unknown Markdown section hierarchy: ${hierarchy}.`);
      if (!['markdown', 'rendered'].includes(nameSource)) throw new Error(`Unknown Markdown heading name source: ${nameSource}.`);
      return sectionMap(
        normalizedMarkdown,
        tokens,
        names,
        { hierarchy, nameSource, stripTrailingColon },
        renderTokens,
        renderMarkdown,
        isHidden,
      );
    },
  };
}
