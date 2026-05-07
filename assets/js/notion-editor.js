/**
 * Lexical-based rich editor for Dhammics (vanilla JS, dynamic ESM imports).
 *
 * Architecture contract (host page must supply):
 *   rootElement     – contenteditable div that Lexical owns
 *   toolbarElement  – empty div that buildToolbarDom() fills
 *   imageTrayElement – div[data-image-tray] below the editor
 *
 * The fullscreen layout and scroll are handled by CSS (.wfe-* classes).
 * This module is layout-agnostic.
 */

const LEXICAL_VERSION = '0.18.0';

const importLexical = async () => {
  await import(`https://esm.sh/prismjs@1.29.0`);
  const [
    lexical,
    richText,
    history,
    list,
    link,
    html,
    selection,
    code,
    table,
    utils,
  ] = await Promise.all([
    import(`https://esm.sh/lexical@${LEXICAL_VERSION}`),
    import(`https://esm.sh/@lexical/rich-text@${LEXICAL_VERSION}?deps=lexical@${LEXICAL_VERSION}`),
    import(`https://esm.sh/@lexical/history@${LEXICAL_VERSION}?deps=lexical@${LEXICAL_VERSION}`),
    import(`https://esm.sh/@lexical/list@${LEXICAL_VERSION}?deps=lexical@${LEXICAL_VERSION}`),
    import(`https://esm.sh/@lexical/link@${LEXICAL_VERSION}?deps=lexical@${LEXICAL_VERSION}`),
    import(`https://esm.sh/@lexical/html@${LEXICAL_VERSION}?deps=lexical@${LEXICAL_VERSION}`),
    import(`https://esm.sh/@lexical/selection@${LEXICAL_VERSION}?deps=lexical@${LEXICAL_VERSION}`),
    import(
      `https://esm.sh/@lexical/code@${LEXICAL_VERSION}?deps=lexical@${LEXICAL_VERSION},prismjs@1.29.0`
    ),
    import(
      `https://esm.sh/@lexical/table@${LEXICAL_VERSION}?deps=lexical@${LEXICAL_VERSION},@lexical/clipboard@${LEXICAL_VERSION},@lexical/utils@${LEXICAL_VERSION}`
    ),
    import(`https://esm.sh/@lexical/utils@${LEXICAL_VERSION}?deps=lexical@${LEXICAL_VERSION}`),
  ]);
  return { lexical, richText, history, list, link, html, selection, code, table, utils };
};

const safeUrl = (value) => String(value || '').trim();

const escAttr = (s) =>
  String(s || '')
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;');

/**
 * Flat toolbar definition.
 * Each entry is either [action, lucide-icon, tooltip] or '|' (visual separator).
 * Selects are rendered in a separate controls strip below the icon strip.
 */
const TOOLBAR_FLAT = [
  ['undo', 'undo-2', 'Undo (Ctrl+Z)'],
  ['redo', 'redo-2', 'Redo (Ctrl+Y)'],
  '|',
  ['bold', 'bold', 'Bold'],
  ['italic', 'italic', 'Italic'],
  ['underline', 'underline', 'Underline'],
  ['strikethrough', 'strikethrough', 'Strikethrough'],
  ['inlineCode', 'code', 'Inline code'],
  ['superscript', 'superscript', 'Superscript'],
  ['subscript', 'subscript', 'Subscript'],
  '|',
  ['openTextColor', 'palette', 'Text colour'],
  ['openBgColor', 'highlighter', 'Highlight / background'],
  '|',
  ['paragraph', 'pilcrow', 'Normal paragraph'],
  ['h1', 'heading-1', 'Heading 1'],
  ['h2', 'heading-2', 'Heading 2'],
  ['h3', 'heading-3', 'Heading 3'],
  ['h4', 'heading-4', 'Heading 4'],
  ['h5', 'heading-5', 'Heading 5'],
  ['h6', 'type', 'Heading 6'],
  '|',
  ['bullet', 'list', 'Bullet list'],
  ['number', 'list-ordered', 'Numbered list'],
  ['checklist', 'list-checks', 'Checklist'],
  '|',
  ['quote', 'quote', 'Blockquote'],
  ['callout', 'megaphone', 'Callout block'],
  ['toggleSection', 'chevron-right-square', 'Toggle section'],
  ['codeBlock', 'file-code-2', 'Code block'],
  ['divider', 'minus', 'Horizontal divider'],
  '|',
  ['alignLeft', 'align-left', 'Align left'],
  ['alignCenter', 'align-center', 'Align centre'],
  ['alignRight', 'align-right', 'Align right'],
  ['alignJustify', 'align-justify', 'Justify'],
  ['indent', 'indent-increase', 'Indent'],
  ['outdent', 'indent-decrease', 'Outdent'],
  '|',
  ['link', 'link', 'Insert link'],
  ['addImage', 'image-plus', 'Attach image URL'],
  ['video', 'video', 'Video embed'],
  ['file', 'paperclip', 'File attachment'],
  ['embed', 'layout-template', 'URL embed'],
  ['bookmark', 'bookmark', 'Bookmark'],
  '|',
  ['tableInsert', 'table-2', 'Insert table'],
  ['tableAddRow', 'panel-bottom-open', 'Add row below'],
  ['tableAddCol', 'panel-right-open', 'Add column after'],
  ['tableDelRow', 'trash-2', 'Delete row'],
  ['tableDelCol', 'trash', 'Delete column'],
  ['tableUnmerge', 'table', 'Unmerge cell'],
  ['tableMergeHint', 'combine', 'Merge cells (info)'],
  ['tableCellBg', 'paint-bucket', 'Cell background'],
  '|',
  ['mention', 'at-sign', 'Mention @user'],
  ['math', 'sigma', 'Inline math'],
  ['comment', 'message-square-text', 'Comment / annotation'],
  ['emojiToggle', 'smile-plus', 'Emoji picker'],
  '|',
  ['clearFormat', 'eraser', 'Clear formatting'],
  ['duplicateBlock', 'layers', 'Duplicate block'],
  ['moveBlockUp', 'arrow-up-to-line', 'Move block up'],
  ['moveBlockDown', 'arrow-down-to-line', 'Move block down'],
  ['copyBlock', 'copy', 'Copy block as JSON'],
];

const buildToolbarDom = (toolbarElement) => {
  const btnHtml = TOOLBAR_FLAT.map((item) => {
    if (item === '|') {
      return '<span class="wfe-toolbar-sep" aria-hidden="true"></span>';
    }
    const [action, icon, title] = item;
    return `<button type="button" class="wfe-tb-btn" data-editor-action="${action}" title="${escAttr(title)}"><i data-lucide="${icon}"></i></button>`;
  }).join('');

  const selectsHtml = `
    <div class="wfe-toolbar-selects" role="group" aria-label="Font and spacing options">
      <label class="sr-only" for="wfe-sel-font">Font family</label>
      <select id="wfe-sel-font" class="wfe-tb-select" data-editor-select="fontFamily" title="Font family">
        <option value="">Font</option>
        <option value="var(--font-sans)">Sans-serif</option>
        <option value="Georgia, serif">Serif</option>
        <option value="ui-monospace, monospace">Monospace</option>
      </select>

      <label class="sr-only" for="wfe-sel-size">Font size</label>
      <select id="wfe-sel-size" class="wfe-tb-select" data-editor-select="fontSize" title="Font size">
        <option value="">Size</option>
        <option value="12px">12</option>
        <option value="14px">14</option>
        <option value="16px">16</option>
        <option value="18px">18</option>
        <option value="22px">22</option>
        <option value="28px">28</option>
        <option value="36px">36</option>
      </select>

      <label class="sr-only" for="wfe-sel-lh">Line height</label>
      <select id="wfe-sel-lh" class="wfe-tb-select" data-editor-select="lineHeight" title="Line spacing">
        <option value="">Spacing</option>
        <option value="1.25">Tight 1.25</option>
        <option value="1.5">Normal 1.5</option>
        <option value="1.75">Relaxed 1.75</option>
        <option value="2">Double 2</option>
      </select>

      <label class="sr-only" for="wfe-sel-lang">Code language</label>
      <select id="wfe-sel-lang" class="wfe-tb-select" data-code-lang-select title="Code block language">
        <option value="javascript">JS</option>
        <option value="typescript">TS</option>
        <option value="python">Python</option>
        <option value="css">CSS</option>
        <option value="html">HTML</option>
        <option value="markdown">Markdown</option>
        <option value="plain">Plain</option>
      </select>
    </div>
    <input type="color" class="wfe-color-input" value="#1a1410" data-color-role="foreground" aria-label="Text colour picker" tabindex="-1" />
    <input type="color" class="wfe-color-input" value="#fff59d" data-color-role="background" aria-label="Background colour picker" tabindex="-1" />
    <div class="wfe-emoji-panel" data-emoji-panel hidden></div>
  `;

  toolbarElement.innerHTML =
    `<div class="wfe-toolbar-strip" role="group" aria-label="Formatting commands">${btnHtml}</div>` +
    selectsHtml;

  const emojiPanel = toolbarElement.querySelector('[data-emoji-panel]');
  if (!emojiPanel) return;
  const emojis = [
    '😀', '🙂', '🙏', '✨', '🔥', '💡', '📌', '❤️', '✅', '⚠️',
    '📎', '🧘', '🌿', '☸️', '✍️', '📖', '🕊️', '🌊', '🌸', '💎',
  ];
  emojiPanel.innerHTML = emojis
    .map((e) => `<button type="button" class="wfe-emoji-btn" data-insert-emoji="${e}" title="${escAttr(e)}">${e}</button>`)
    .join('');
};

const registerVanillaTablePlugin = (editor, lexical, tableMod, utilsMod) => {
  const {
    TableNode,
    TableCellHeaderStates,
    INSERT_TABLE_COMMAND,
    $createTableNodeWithDimensions,
    $computeTableMapSkipCellCheck,
    $createTableCellNode,
    $isTableNode,
    $getNodeByKey,
    applyTableHandlers,
  } = tableMod;
  const { mergeRegister: mergeRegisterFn, $insertNodeToNearestRoot } = utilsMod;
  const mergeRegister =
    typeof mergeRegisterFn === 'function'
      ? mergeRegisterFn
      : (...regs) => () => {
          regs.forEach((r) => {
            if (typeof r === 'function') r();
          });
        };
  const { $isTextNode, $createParagraphNode, COMMAND_PRIORITY_EDITOR } = lexical;

  const tableHandlers = new Map();

  const unregisterMerged = mergeRegister(
    editor.registerCommand(
      INSERT_TABLE_COMMAND,
      ({ columns, rows, includeHeaders }) => {
        const tableNode = $createTableNodeWithDimensions(
          Number(rows),
          Number(columns),
          includeHeaders ?? true
        );
        $insertNodeToNearestRoot(tableNode);
        const first = tableNode.getFirstDescendant();
        if ($isTextNode(first)) {
          first.select();
        }
        return true;
      },
      COMMAND_PRIORITY_EDITOR
    ),
    editor.registerNodeTransform(TableNode, (tableNode) => {
      const [grid] = $computeTableMapSkipCellCheck(tableNode, null, null);
      const maxCols = grid.reduce((max, row) => Math.max(max, row.length), 0);
      const rows = tableNode.getChildren();
      for (let y = 0; y < grid.length; y++) {
        const row = rows[y];
        if (!row) continue;
        const count = grid[y].reduce((acc, cell) => (cell ? acc + 1 : acc), 0);
        if (count !== maxCols) {
          for (let i = count; i < maxCols; i++) {
            const cell = $createTableCellNode(TableCellHeaderStates.NO_STATUS);
            cell.append($createParagraphNode());
            row.append(cell);
          }
        }
      }
    })
  );

  const unregisterMutation = editor.registerMutationListener(
    TableNode,
    (mutatedNodes) => {
      for (const [nodeKey, mutation] of mutatedNodes) {
        if (mutation === 'created' || mutation === 'updated') {
          const prev = tableHandlers.get(nodeKey);
          const dom = editor.getElementByKey(nodeKey);
          if (prev && dom === prev.element) continue;
          if (prev) {
            prev.observer.removeListeners();
            tableHandlers.delete(nodeKey);
          }
          if (dom !== null) {
            editor.getEditorState().read(() => {
              const node = $getNodeByKey(nodeKey);
              if ($isTableNode(node)) {
                const observer = applyTableHandlers(node, dom, editor, true);
                tableHandlers.set(nodeKey, { observer, element: dom });
              }
            });
          }
        } else if (mutation === 'destroyed') {
          const prev = tableHandlers.get(nodeKey);
          if (prev !== undefined) {
            prev.observer.removeListeners();
            tableHandlers.delete(nodeKey);
          }
        }
      }
    },
    { skipInitialization: false }
  );

  return () => {
    unregisterMerged();
    unregisterMutation();
    for (const [, { observer }] of tableHandlers) {
      observer.removeListeners();
    }
    tableHandlers.clear();
  };
};

export const createNotionEditor = async ({ rootElement, toolbarElement, imageTrayElement }) => {
  const { lexical, richText, history, list, link, html, selection, code, table, utils } =
    await importLexical();

  const {
    createEditor,
    $getRoot,
    $createParagraphNode,
    $getSelection,
    $isRangeSelection,
    FORMAT_TEXT_COMMAND,
    FORMAT_ELEMENT_COMMAND,
    UNDO_COMMAND,
    REDO_COMMAND,
    INDENT_CONTENT_COMMAND,
    OUTDENT_CONTENT_COMMAND,
    $isTextNode,
    $createTextNode,
    $parseSerializedNode,
  } = lexical;
  const { registerRichText, HeadingNode, QuoteNode, $createHeadingNode, $createQuoteNode } =
    richText;
  const { registerHistory, createEmptyHistoryState } = history;
  const {
    ListNode,
    ListItemNode,
    INSERT_UNORDERED_LIST_COMMAND,
    INSERT_ORDERED_LIST_COMMAND,
    INSERT_CHECK_LIST_COMMAND,
    registerList,
  } = list;
  const { LinkNode, TOGGLE_LINK_COMMAND } = link;
  const { $generateHtmlFromNodes, $generateNodesFromDOM } = html;
  const { $setBlocksType, $patchStyleText, $getSelectionStyleValueForProperty } = selection;
  const {
    CodeNode,
    CodeHighlightNode,
    $createCodeNode,
    $createCodeHighlightNode,
    registerCodeHighlighting,
  } = code;
  const {
    TableNode,
    TableCellNode,
    TableRowNode,
    INSERT_TABLE_COMMAND,
    $insertTableRow__EXPERIMENTAL,
    $insertTableColumn__EXPERIMENTAL,
    $deleteTableRow__EXPERIMENTAL,
    $deleteTableColumn__EXPERIMENTAL,
    $unmergeCell,
    $findCellNode,
  } = table;

  buildToolbarDom(toolbarElement);

  let defaultCodeLang = 'javascript';
  const codeLangSelect = toolbarElement.querySelector('[data-code-lang-select]');
  if (codeLangSelect) {
    codeLangSelect.addEventListener('change', () => {
      defaultCodeLang = String(codeLangSelect.value || 'javascript');
    });
  }

  const fgInput = toolbarElement.querySelector('[data-color-role="foreground"]');
  const bgInput = toolbarElement.querySelector('[data-color-role="background"]');
  const emojiPanel = toolbarElement.querySelector('[data-emoji-panel]');

  const editor = createEditor({
    namespace: 'dhammics-notion-editor',
    theme: {
      code: 'lexical-code',
      codeHighlight: {
        atrule: 'lexical-token-atrule',
        attr: 'lexical-token-attr',
        boolean: 'lexical-token-boolean',
        builtin: 'lexical-token-builtin',
        cdata: 'lexical-token-cdata',
        char: 'lexical-token-char',
        class: 'lexical-token-class',
        'class-name': 'lexical-token-class-name',
        comment: 'lexical-token-comment',
        constant: 'lexical-token-constant',
        deleted: 'lexical-token-deleted',
        doctype: 'lexical-token-doctype',
        entity: 'lexical-token-entity',
        function: 'lexical-token-function',
        important: 'lexical-token-important',
        inserted: 'lexical-token-inserted',
        keyword: 'lexical-token-keyword',
        namespace: 'lexical-token-namespace',
        number: 'lexical-token-number',
        operator: 'lexical-token-operator',
        prolog: 'lexical-token-prolog',
        property: 'lexical-token-property',
        punctuation: 'lexical-token-punctuation',
        regex: 'lexical-token-regex',
        selector: 'lexical-token-selector',
        string: 'lexical-token-string',
        symbol: 'lexical-token-symbol',
        tag: 'lexical-token-tag',
        url: 'lexical-token-url',
        variable: 'lexical-token-variable',
      },
      table: 'lexical-table',
      tableCell: 'lexical-table-cell',
      tableCellHeader: 'lexical-table-cell-header',
      tableRow: 'lexical-table-row',
      tableSelection: 'lexical-table-selection',
      tableRowStriping: 'lexical-table-row-striping',
    },
    onError(error) {
      console.error('Lexical editor error:', error);
    },
    nodes: [
      HeadingNode,
      QuoteNode,
      ListNode,
      ListItemNode,
      LinkNode,
      CodeNode,
      CodeHighlightNode,
      TableNode,
      TableCellNode,
      TableRowNode,
    ],
  });

  editor.setRootElement(rootElement);
  editor.setEditable(true);

  /** Invisible anchor so empty paragraphs accept a caret (some browsers skip empty <p> with no text node). */
  const ZWSP = '\u200b';
  const normalizeDocTextForEmptyCheck = (raw) =>
    String(raw || '')
      .replaceAll('\u200b', '')
      .replaceAll('\ufeff', '')
      .trim();

  /**
   * Empty / padding clicks: native focus can land on the root without a Lexical range selection, so keys do nothing.
   * Only force defaultSelection when the doc is visually empty or the mousedown hit the root chrome (padding), so we
   * do not reset the caret on every click while editing.
   */
  const mouseDownFocusSurface = (e) => {
    if (e.button !== 0) return;
    const hitRootChrome = e.target === rootElement;
    const visuallyEmpty = editor.getEditorState().read(() => {
      return normalizeDocTextForEmptyCheck($getRoot().getTextContent()).length === 0;
    });
    if (!hitRootChrome && !visuallyEmpty) return;
    Promise.resolve().then(() => {
      editor.focus(() => {}, { defaultSelection: 'rootEnd' });
    });
  };
  rootElement.addEventListener('mousedown', mouseDownFocusSurface);

  const unregisterRich = registerRichText(editor);
  const unregisterHistory = registerHistory(editor, createEmptyHistoryState(), 300);
  const unregisterList = registerList(editor);
  const unregisterCodeHighlight = registerCodeHighlighting(editor);
  const unregisterTable = registerVanillaTablePlugin(editor, lexical, table, utils);

  let imageUrls = [];

  const ensureInitialParagraph = () => {
    editor.update(() => {
      const root = $getRoot();
      if (root.getFirstChild() === null) {
        const p = $createParagraphNode();
        p.append($createTextNode(ZWSP));
        root.append(p);
      }
    });
  };
  ensureInitialParagraph();

  const updateEmptyState = () => {
    const isEmpty = editor.getEditorState().read(() => {
      return normalizeDocTextForEmptyCheck($getRoot().getTextContent()).length === 0;
    });
    rootElement.classList.toggle('is-empty', isEmpty);
  };

  const renderImageTray = () => {
    if (!imageTrayElement) return;
    if (imageUrls.length === 0) {
      imageTrayElement.innerHTML = '';
      imageTrayElement.hidden = true;
      return;
    }
    imageTrayElement.hidden = false;
    imageTrayElement.innerHTML = `
      <p class="form-help">Attached image URLs (${imageUrls.length})</p>
      <div class="notion-image-grid">
        ${imageUrls
          .map(
            (url, i) => `
          <div class="notion-image-item">
            <img src="${url.replace(/"/g, '')}" alt="" loading="lazy" />
            <button type="button" class="icon-btn" data-remove-image="${i}" title="Remove image">
              <i data-lucide="x"></i>
            </button>
          </div>
        `
          )
          .join('')}
      </div>
    `;
    imageTrayElement.querySelectorAll('[data-remove-image]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const index = Number(btn.dataset.removeImage);
        imageUrls = imageUrls.filter((_, i) => i !== index);
        renderImageTray();
        if (window.lucide?.createIcons) window.lucide.createIcons();
      });
    });
    if (window.lucide?.createIcons) window.lucide.createIcons();
  };

  const runBlockTransform = (factory) => {
    editor.update(() => {
      const rangeSelection = $getSelection();
      if ($isRangeSelection(rangeSelection)) {
        $setBlocksType(rangeSelection, factory);
      }
    });
  };

  const insertDivider = () => {
    editor.update(() => {
      const sel = $getSelection();
      if (!$isRangeSelection(sel)) return;
      const p = $createParagraphNode();
      p.setStyle(
        'border:none;border-top:2px solid var(--border);margin:1.15rem 0;padding:0;min-height:1px;background:transparent;'
      );
      p.append($createTextNode('\u200b'));
      sel.insertNodes([p]);
    });
  };

  const insertFromHtmlString = (htmlString) => {
    editor.update(() => {
      const doc = new DOMParser().parseFromString(htmlString, 'text/html');
      const nodes = $generateNodesFromDOM(editor, doc.body);
      const sel = $getSelection();
      if ($isRangeSelection(sel) && nodes.length) {
        sel.insertNodes(nodes);
      }
    });
  };

  const insertToggleSection = () => {
    const summary = window.prompt('Toggle title (summary line)', 'Section');
    if (summary === null) return;
    editor.update(() => {
      const sel = $getSelection();
      if (!$isRangeSelection(sel)) return;
      const title = $createParagraphNode();
      title.append($createTextNode(`▸ ${summary}`));
      const body = $createParagraphNode();
      body.append($createTextNode('…'));
      sel.insertNodes([title, body]);
    });
  };

  const insertCallout = () => {
    const emoji = window.prompt('Callout emoji / icon (optional)', '💡');
    if (emoji === null) return;
    const text = window.prompt('Callout text', '') ?? '';
    editor.update(() => {
      const sel = $getSelection();
      if (!$isRangeSelection(sel)) return;
      const q = $createQuoteNode();
      q.append($createTextNode(`${emoji ? `${emoji} ` : ''}${text}`));
      sel.insertNodes([q]);
    });
  };

  const duplicateBlock = () => {
    editor.update(() => {
      const sel = $getSelection();
      if (!$isRangeSelection(sel)) return;
      const block = sel.anchor.getNode().getTopLevelElementOrThrow();
      const clone = $parseSerializedNode(block.exportJSON());
      block.insertAfter(clone);
    });
  };

  const moveBlock = (dir) => {
    editor.update(() => {
      const sel = $getSelection();
      if (!$isRangeSelection(sel)) return;
      const block = sel.anchor.getNode().getTopLevelElementOrThrow();
      if (dir === 'up') {
        const prev = block.getPreviousSibling();
        if (prev) {
          prev.insertBefore(block);
          block.selectStart();
        }
      } else {
        const next = block.getNextSibling();
        if (next) {
          next.insertAfter(block);
          block.selectStart();
        }
      }
    });
  };

  const copyBlockJson = async () => {
    let json = '';
    editor.getEditorState().read(() => {
      const sel = $getSelection();
      if (!$isRangeSelection(sel)) return;
      const block = sel.anchor.getNode().getTopLevelElementOrThrow();
      json = JSON.stringify(block.exportJSON(), null, 2);
    });
    if (json && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(json);
    }
  };

  const clearFormatting = () => {
    editor.update(() => {
      const sel = $getSelection();
      if (!$isRangeSelection(sel)) return;
      for (const node of sel.getNodes()) {
        if ($isTextNode(node)) {
          const writable = node.getWritable();
          writable.setFormat(0);
          writable.setStyle('');
        }
      }
      const anchorNode = sel.anchor.getNode();
      const top = anchorNode.getTopLevelElementOrThrow();
      if (top && typeof top.setFormat === 'function') {
        try {
          top.setFormat('left');
        } catch {
          /* ignore */
        }
      }
    });
  };

  const patchSelectionStyle = (styles) => {
    editor.update(() => {
      const sel = $getSelection();
      if ($isRangeSelection(sel)) {
        $patchStyleText(sel, styles);
      }
    });
  };

  const applySelectValue = (name, value) => {
    if (!value) return;
    if (name === 'fontFamily') {
      patchSelectionStyle({ 'font-family': value });
    } else if (name === 'fontSize') {
      patchSelectionStyle({ 'font-size': value });
    } else if (name === 'lineHeight') {
      editor.update(() => {
        const sel = $getSelection();
        if (!$isRangeSelection(sel)) return;
        const nodes = sel.getNodes();
        const seen = new Set();
        for (const n of nodes) {
          const block = n.getTopLevelElementOrThrow();
          if (block && !seen.has(block.getKey())) {
            seen.add(block.getKey());
            const w = block.getWritable();
            if (typeof w.setStyle === 'function') {
              const prev = w.getStyle?.() || '';
              w.setStyle(`${prev};line-height:${value}`);
            }
          }
        }
      });
    }
  };

  const commandMap = {
    undo: () => editor.dispatchCommand(UNDO_COMMAND, undefined),
    redo: () => editor.dispatchCommand(REDO_COMMAND, undefined),
    bold: () => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold'),
    italic: () => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic'),
    underline: () => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline'),
    strikethrough: () => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'strikethrough'),
    inlineCode: () => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'code'),
    superscript: () => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'superscript'),
    subscript: () => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'subscript'),
    paragraph: () => runBlockTransform(() => $createParagraphNode()),
    h1: () => runBlockTransform(() => $createHeadingNode('h1')),
    h2: () => runBlockTransform(() => $createHeadingNode('h2')),
    h3: () => runBlockTransform(() => $createHeadingNode('h3')),
    h4: () => runBlockTransform(() => $createHeadingNode('h4')),
    h5: () => runBlockTransform(() => $createHeadingNode('h5')),
    h6: () => runBlockTransform(() => $createHeadingNode('h6')),
    quote: () => runBlockTransform(() => $createQuoteNode()),
    bullet: () => editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined),
    number: () => editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined),
    checklist: () => editor.dispatchCommand(INSERT_CHECK_LIST_COMMAND, undefined),
    link: () => {
      const url = window.prompt('Enter URL', 'https://');
      if (url === null) return;
      const value = safeUrl(url);
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, value || null);
    },
    alignLeft: () => editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'left'),
    alignCenter: () => editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'center'),
    alignRight: () => editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'right'),
    alignJustify: () => editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'justify'),
    indent: () => editor.dispatchCommand(INDENT_CONTENT_COMMAND, undefined),
    outdent: () => editor.dispatchCommand(OUTDENT_CONTENT_COMMAND, undefined),
    clearFormat: () => clearFormatting(),
    duplicateBlock: () => duplicateBlock(),
    moveBlockUp: () => moveBlock('up'),
    moveBlockDown: () => moveBlock('down'),
    copyBlock: () => {
      void copyBlockJson();
    },
    divider: () => insertDivider(),
    toggleSection: () => insertToggleSection(),
    callout: () => insertCallout(),
    codeBlock: () => {
      editor.update(() => {
        const sel = $getSelection();
        if (!$isRangeSelection(sel)) return;
        const codeNode = $createCodeNode(defaultCodeLang);
        codeNode.append($createCodeHighlightNode(''));
        sel.insertNodes([codeNode]);
      });
    },
    tableInsert: () => {
      editor.dispatchCommand(INSERT_TABLE_COMMAND, { rows: '3', columns: '3', includeHeaders: true });
    },
    tableAddRow: () => {
      editor.update(() => {
        $insertTableRow__EXPERIMENTAL(true);
      });
    },
    tableAddCol: () => {
      editor.update(() => {
        $insertTableColumn__EXPERIMENTAL(true);
      });
    },
    tableDelRow: () => {
      editor.update(() => {
        $deleteTableRow__EXPERIMENTAL();
      });
    },
    tableDelCol: () => {
      editor.update(() => {
        $deleteTableColumn__EXPERIMENTAL();
      });
    },
    tableUnmerge: () => {
      editor.update(() => {
        $unmergeCell();
      });
    },
    tableMergeHint: () => {
      window.alert(
        'Cell merge in Lexical needs a rectangular multi-cell table selection (shift+drag in full table UIs). Use Unmerge for split cells imported from tables.'
      );
    },
    tableCellBg: () => {
      const c = window.prompt('Cell background (#hex or css color)', '#fff3cd');
      if (!c) return;
      editor.update(() => {
        const sel = $getSelection();
        if (!$isRangeSelection(sel)) return;
        const cell = $findCellNode(sel.anchor.getNode());
        if (cell) cell.setBackgroundColor(c);
      });
    },
    addImage: () => {
      const url = window.prompt('Enter pre-hosted image URL');
      if (!url) return;
      const value = safeUrl(url);
      if (!value) return;
      imageUrls.push(value);
      renderImageTray();
    },
    comment: () => {
      patchSelectionStyle({
        backgroundColor: '#fff3cd',
        color: '#5c4a10',
      });
    },
    mention: () => {
      const u = window.prompt('Mention username (without @)', 'reader');
      if (u === null) return;
      editor.update(() => {
        const sel = $getSelection();
        if (!$isRangeSelection(sel)) return;
        sel.insertText(`@${u} `);
      });
    },
    math: () => {
      const tex = window.prompt('LaTeX (inline)', 'E = mc^2');
      if (tex === null) return;
      insertFromHtmlString(
        `<p><span class="math-inline" data-latex="${escAttr(tex).replace(/"/g, '')}">$${tex.replace(/</g, '')}$</span></p>`
      );
    },
    bookmark: () => {
      const title = window.prompt('Bookmark title', 'Saved link');
      if (title === null) return;
      const url = window.prompt('Bookmark URL', 'https://');
      if (url === null) return;
      insertFromHtmlString(
        `<p class="bookmark-block"><a href="${safeUrl(url)}" rel="noopener noreferrer">${title}</a></p>`
      );
    },
    embed: () => {
      const url = window.prompt('Embed URL (shown as preview link)', 'https://');
      if (url === null) return;
      const v = safeUrl(url);
      if (!v) return;
      insertFromHtmlString(
        `<p class="embed-block"><span class="embed-label">Embed</span> <a href="${v}" rel="noopener noreferrer">${v}</a></p>`
      );
    },
    video: () => {
      const url = window.prompt('Video page URL (YouTube/Vimeo/etc.)', 'https://');
      if (url === null) return;
      const v = safeUrl(url);
      if (!v) return;
      insertFromHtmlString(
        `<p class="video-embed-block"><a href="${v}" rel="noopener noreferrer">Watch video → ${v}</a></p>`
      );
    },
    file: () => {
      const url = window.prompt('File URL', 'https://');
      if (url === null) return;
      const label = window.prompt('Link label', 'Download attachment') || 'Download';
      const v = safeUrl(url);
      if (!v) return;
      insertFromHtmlString(
        `<p class="file-attach-block"><a href="${v}" download rel="noopener noreferrer">${label}</a></p>`
      );
    },
    openTextColor: () => fgInput?.click(),
    openBgColor: () => bgInput?.click(),
    emojiToggle: () => {
      if (!emojiPanel) return;
      emojiPanel.hidden = !emojiPanel.hidden;
    },
  };

  toolbarElement.addEventListener('click', (event) => {
    const emojiBtn = event.target.closest('[data-insert-emoji]');
    if (emojiBtn && emojiPanel?.contains(emojiBtn)) {
      const ch = emojiBtn.dataset.insertEmoji || '';
      editor.update(() => {
        const sel = $getSelection();
        if ($isRangeSelection(sel)) sel.insertText(ch);
      });
      emojiPanel.hidden = true;
      updateEmptyState();
      return;
    }

    const button = event.target.closest('[data-editor-action]');
    if (!button || button.disabled) return;
    const action = button.dataset.editorAction;
    if (action === 'dragHandle') return;
    if (commandMap[action]) {
      commandMap[action]();
      updateEmptyState();
    }
  });

  toolbarElement.addEventListener('change', (event) => {
    const sel = event.target.closest('[data-editor-select]');
    if (!sel) return;
    applySelectValue(sel.dataset.editorSelect, String(sel.value || ''));
    sel.value = '';
    updateEmptyState();
  });

  fgInput?.addEventListener('input', () => {
    patchSelectionStyle({ color: fgInput.value });
  });
  bgInput?.addEventListener('input', () => {
    patchSelectionStyle({ 'background-color': bgInput.value });
  });

  document.addEventListener('click', (e) => {
    if (!emojiPanel || emojiPanel.hidden) return;
    if (e.target.closest('[data-editor-action="emojiToggle"]')) return;
    if (emojiPanel.contains(e.target)) return;
    emojiPanel.hidden = true;
  }, { capture: true });

  const unregisterUpdate = editor.registerUpdateListener(() => {
    updateEmptyState();
  });
  updateEmptyState();

  const unregisterPointer = () => {
    rootElement.removeEventListener('mousedown', mouseDownFocusSurface);
  };

  return {
    setHTML(value) {
      const htmlValue = String(value || '').trim() || '<p></p>';
      editor.update(() => {
        const root = $getRoot();
        root.clear();
        const doc = new DOMParser().parseFromString(htmlValue, 'text/html');
        const nodes = $generateNodesFromDOM(editor, doc);
        root.append(...nodes);
        if (root.getFirstChild() === null) {
          const p = $createParagraphNode();
          p.append($createTextNode(ZWSP));
          root.append(p);
        } else if (normalizeDocTextForEmptyCheck(root.getTextContent()).length === 0) {
          const first = root.getFirstChild();
          if (first !== null && first.getChildrenSize() === 0) {
            first.append($createTextNode(ZWSP));
          }
        }
      });
      updateEmptyState();
    },
    getHTML() {
      return editor.getEditorState().read(() => $generateHtmlFromNodes(editor, null));
    },
    clear() {
      this.setHTML('<p></p>');
      imageUrls = [];
      renderImageTray();
    },
    getImages() {
      return [...imageUrls];
    },
    /** Current text color from toolbar (for UI sync). */
    getSelectionStyleSample() {
      return editor.getEditorState().read(() => {
        const sel = $getSelection();
        if (!$isRangeSelection(sel)) return { color: '', bg: '' };
        return {
          color: $getSelectionStyleValueForProperty(sel, 'color') || '',
          bg: $getSelectionStyleValueForProperty(sel, 'background-color') || '',
        };
      });
    },
    focus() {
      editor.focus(() => {}, { defaultSelection: 'rootEnd' });
    },
    destroy() {
      unregisterPointer();
      unregisterUpdate();
      unregisterTable();
      unregisterCodeHighlight();
      unregisterList();
      unregisterRich();
      unregisterHistory();
      editor.setRootElement(null);
    },
  };
};
