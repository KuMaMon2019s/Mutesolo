import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";

import type { Block, PartialBlock } from "@blocknote/core";
import { BlockNoteView } from "@blocknote/mantine";
import { useCreateBlockNote } from "@blocknote/react";
import { useCallback, useEffect, useMemo, useState } from "react";

type TencentDoc = {
  type: "tencent_doc";
  title: string;
  url: string;
  readInstruction: string;
};

type Attachment = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  kind: "image" | "file";
  url: string;
  storageKey?: string;
  source: string;
};

type ExportedAttachment = Attachment;

type EditorContext = {
  schemaVersion: 1;
  source: "Mutesolo-requirement-editor";
  blocks: Block[];
  plainText: string;
  tencentDocs: TencentDoc[];
  attachments: ExportedAttachment[];
};

const defaultDraftKey = "Mutesolo.requirementEditor.draft.v1";

function draftKeyFromSearch(search: string) {
  const params = new URLSearchParams(search);
  const project = params.get("project") || "local";
  const requirement = params.get("requirement") || "draft";
  return `Mutesolo.requirementEditor.${project}.${requirement}.v1`;
}

function starterBlocksFromSearch(search: string): PartialBlock[] {
  const params = new URLSearchParams(search);
  const title = params.get("title") || "需求标题";
  const rawDescription = params.get("description") || "在这里补充功能需求、接口要求、边界条件和验收标准。";
  // When description is HTML, convert it via tryParseHTMLToBlocks after editor creation.
  const isHtml = /<[a-z][\s\S]*\/?>|<br\s*\/?>/i.test(rawDescription);
  if (isHtml) {
    return [
      {
        type: "heading",
        props: { level: 2 },
        content: title,
      },
    ];
  }
  return [
    {
      type: "heading",
      props: { level: 2 },
      content: title,
    },
    {
      type: "paragraph",
      content: rawDescription,
    },
  ];
}

function readDraft(draftKey: string): { blocks?: PartialBlock[]; tencentDocs?: TencentDoc[]; attachments?: Attachment[] } {
  const raw = window.localStorage.getItem(draftKey);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as { blocks?: PartialBlock[]; tencentDocs?: TencentDoc[]; attachments?: Attachment[] };
  } catch {
    return {};
  }
}

function sanitizeAttachments(attachments: Attachment[]): ExportedAttachment[] {
  return attachments.filter((attachment) => Boolean(attachment.url));
}

async function uploadAsset(file: File, projectId: string, requirementId: string): Promise<Attachment> {
  const body = new FormData();
  body.append("file", file);
  if (projectId) body.append("project_id", projectId);
  if (requirementId) body.append("requirement_id", requirementId);
  const response = await fetch("/api/assets", {
    method: "POST",
    body
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Upload failed");
  }
  return {
    id: data.id || crypto.randomUUID(),
    name: data.name || file.name,
    mimeType: data.mimeType || file.type || "application/octet-stream",
    size: data.size || file.size,
    kind: data.kind === "image" ? "image" : "file",
    url: data.url,
    storageKey: data.storageKey,
    source: data.source || "minio"
  };
}

function textFromInlineContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((item) => {
      if (typeof item === "string") return item;
      if (!item || typeof item !== "object") return "";
      const candidate = item as { text?: unknown; content?: unknown };
      if (typeof candidate.text === "string") return candidate.text;
      return textFromInlineContent(candidate.content);
    })
    .join("");
}

function blockToText(block: Block): string {
  const parts = [textFromInlineContent(block.content)];
  if (Array.isArray(block.children)) {
    parts.push(...block.children.map((child) => blockToText(child as Block)));
  }
  return parts.filter(Boolean).join("\n");
}

function buildPlainText(blocks: Block[]): string {
  return blocks
    .map(blockToText)
    .map((part) => part.trim())
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Lift nested img tags out of block containers (p/div/li/h1-h6)
 * so that BlockNote DOMParser doesn't silently drop them.
 * BlockNote treats img as block-level; nesting inside inline containers loses it.
 *
 * Regex groups:
 *   1. tag name (p|div|span|li|h1-h6)
 *   2. content BEFORE img inside the container
 *   3. the <img ...> tag itself
 *   4. content AFTER img inside the container
 *   Closing tag matched by <\/\1> (backreference to tag name in group 1).
 *
 * For <p><img src="a.png">text</p>:
 *   → <img src="a.png">\n<p>text</p>
 * For <p>text<img src="a.png"></p>:
 *   → <p>text</p>\n<img src="a.png">
 * For <p>before<img src="a.png">after</p>:
 *   → <p>before</p>\n<img src="a.png">\n<p>after</p>
 * For <p><img src="a.png"></p> (no text at all):
 *   → <img src="a.png">  (drop the empty container entirely)
 */
function liftImagesToBlockLevel(html: string): string {
  return html.replace(
    /<(p|div|span|li|h[1-6])\b[^>]*>([\s\S]*?)(<img\b[^>]*\/?>)([\s\S]*?)<\/\1>/gi,
    (_match, tagName, before, imgTag, after) => {
      const beforeTrimmed = before.trim();
      const afterTrimmed = after.trim();
      // No text at all — replace whole container with just the img
      if (!beforeTrimmed && !afterTrimmed) return imgTag;
      // Only text after img
      if (!beforeTrimmed) return imgTag + '\n<' + tagName + '>' + after + '</' + tagName + '>';
      // Only text before img
      if (!afterTrimmed) return '<' + tagName + '>' + before + '</' + tagName + '>\n' + imgTag;
      // Text on both sides — split into two paragraphs around the img
      return '<' + tagName + '>' + before + '</' + tagName + '>\n' + imgTag + '\n<' + tagName + '>' + after + '</' + tagName + '>';
    },
  );
}

function emptyTencentDoc(): TencentDoc {
  return {
    type: "tencent_doc",
    title: "",
    url: "",
    readInstruction: ""
  };
}



export function RequirementEditor() {
  const search = window.location.search;
  const isEmbedded = new URLSearchParams(search).get("embed") === "1";
  const draftKey = useMemo(() => draftKeyFromSearch(search || defaultDraftKey), [search]);
  const starterBlocks = useMemo(() => starterBlocksFromSearch(search), [search]);

  // Extract project/requirement IDs for asset tracking.
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const projectId = params.get("project") || "";
  const requirementId = params.get("requirement") || "";
  const rawDescription = params.get("description") || "";

  // In embedded mode, add class to html/body so CSS height:100% chain works
  useEffect(() => {
    if (isEmbedded) {
      document.documentElement.classList.add("embedded");
      return () => document.documentElement.classList.remove("embedded");
    }
  }, [isEmbedded]);
  const draft = useMemo(() => readDraft(draftKey), [draftKey]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [tencentDocs, setTencentDocs] = useState<TencentDoc[]>(draft.tencentDocs?.length ? draft.tencentDocs : [emptyTencentDoc()]);
  const [attachments, setAttachments] = useState<Attachment[]>(draft.attachments || []);

  const uploadFile = useCallback(async (file: File) => {
    const attachment = await uploadAsset(file, projectId, requirementId);
    setAttachments((current) => [...current, attachment]);
    return {
      props: {
        url: attachment.url,
        name: attachment.name
      }
    };
  }, [projectId, requirementId]);

  const editor = useCreateBlockNote(
    {
      initialContent: draft.blocks?.length ? draft.blocks : starterBlocks,
      uploadFile
    },
    []
  );

  // When description is HTML and no saved draft exists, parse HTML into blocks
  // and render them directly in the BlockNote editor.
  useEffect(() => {
    if (draft.blocks?.length) return;
    if (!rawDescription) return;
    if (!/<[a-z][\s\S]*\/?>|<br\s*\/?>/i.test(rawDescription)) return;

    const title = params.get("title") || "需求标题";
    const titleBlock: PartialBlock = {
      type: "heading",
      props: { level: 2 },
      content: title,
    };

    // --- Image diagnostics: lift + parse pipeline ---
    const liftedHTML = liftImagesToBlockLevel(rawDescription);
    console.log(
      "[RequirementEditor] rawDescription has <img>:",
      /<img\b/i.test(rawDescription),
      "| length:",
      rawDescription.length
    );
    console.log(
      "[RequirementEditor] After liftImagesToBlockLevel — has <img>:",
      /<img\b/i.test(liftedHTML),
      "| liftedHTML:",
      liftedHTML.substring(0, 300)
    );

    const htmlBlocks = editor.tryParseHTMLToBlocks(liftedHTML);
    const imageBlockCount = htmlBlocks.filter((b: any) => b.type === "image").length;
    console.log(
      "[RequirementEditor] tryParseHTMLToBlocks produced",
      htmlBlocks.length,
      "blocks, image blocks:",
      imageBlockCount
    );

    // Fallback: if HTML contains <img> but tryParseHTMLToBlocks produced zero image
    // blocks, manually build image blocks from the lifted HTML.
    if (/<img\b/i.test(liftedHTML) && imageBlockCount === 0) {
      const imgRegex = /<img\b[^>]*src\s*=\s*["']([^"']+)["'][^>]*\/?>/gi;
      const manualImageBlocks: PartialBlock[] = [];
      let m: RegExpExecArray | null;
      while ((m = imgRegex.exec(liftedHTML)) !== null) {
        manualImageBlocks.push({
          type: "image",
          props: {
            url: m[1],
            caption: "",
            showPreview: true,
            backgroundColor: "default",
            textAlignment: "left",
          },
        });
      }
      console.log(
        "[RequirementEditor] Fallback: built",
        manualImageBlocks.length,
        "manual image blocks from HTML"
      );
      // Interleave: for each <img> in the raw HTML, insert a manual image block
      // between the parsed text blocks (which will be the non-image content).
      // Strategy: collect all text-only blocks, then insert image blocks where
      // they appeared in the original HTML.
      const combined: PartialBlock[] = [];
      let imgIdx = 0;
      // Re-scan the lifted HTML: for each segment, if it's an img, insert manual
      // image block; otherwise find the corresponding text block.
      const segmentRegex = /(<img\b[^>]*\/?>)|([\s\S]*?)(?=<img\b[^>]*\/?>|$)/gi;
      let textBlockIdx = 0;
      // Collect text (non-image) blocks from htmlBlocks
      const textBlocks = htmlBlocks.filter(
        (b: any) => b.type !== "image"
      ) as PartialBlock[];
      let seg: RegExpExecArray | null;
      while ((seg = segmentRegex.exec(liftedHTML)) !== null) {
        if (seg[1]) {
          // This segment is an <img> — insert manual image block
          if (imgIdx < manualImageBlocks.length) {
            combined.push(manualImageBlocks[imgIdx++]);
          }
        } else if (seg[2]?.trim()) {
          // This segment is text — use the next text block
          if (textBlockIdx < textBlocks.length) {
            combined.push(textBlocks[textBlockIdx++]);
          }
        }
      }
      // If we somehow didn't consume all text blocks, append remaining
      while (textBlockIdx < textBlocks.length) {
        combined.push(textBlocks[textBlockIdx++]);
      }
      console.log(
        "[RequirementEditor] Combined",
        combined.length,
        "blocks (",
        combined.filter((b: any) => b.type === "image").length,
        "images )"
      );
      editor.replaceBlocks(editor.document, [titleBlock, ...combined]);
    } else {
      editor.replaceBlocks(editor.document, [titleBlock, ...htmlBlocks]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buildContext = useCallback((): EditorContext => {
    const currentBlocks = editor.document as Block[];
    return {
      schemaVersion: 1,
      source: "Mutesolo-requirement-editor",
      blocks: currentBlocks,
      plainText: buildPlainText(currentBlocks),
      tencentDocs: tencentDocs.filter((doc) => doc.title.trim() || doc.url.trim() || doc.readInstruction.trim()),
      attachments: sanitizeAttachments(attachments)
    };
  }, [attachments, editor, tencentDocs]);

  const persistDraft = useCallback((currentBlocks: Block[]) => {
    window.localStorage.setItem(
      draftKey,
      JSON.stringify({
        blocks: currentBlocks,
        tencentDocs,
        attachments
      })
    );
    setBlocks(currentBlocks);
    const context = buildContext();
    window.localStorage.setItem(`${draftKey}.context`, JSON.stringify(context));
  }, [attachments, buildContext, draftKey, tencentDocs]);

  const saveDraft = () => {
    persistDraft(editor.document as Block[]);
  };

  const postHeight = useCallback(() => {
    if (!isEmbedded) return;
    const height = Math.max(
      document.documentElement.scrollHeight,
      document.documentElement.offsetHeight,
      document.documentElement.clientHeight,
      document.body.scrollHeight,
      document.body.offsetHeight,
      document.body.clientHeight
    );
    window.parent.postMessage(
      {
        type: "Mutesolo.requirementEditor.height",
        height: Math.ceil(height)
      },
      window.location.origin
    );
  }, [isEmbedded]);

  useEffect(() => {
    postHeight();
    const resizeObserver = new ResizeObserver(() => postHeight());
    resizeObserver.observe(document.documentElement);
    resizeObserver.observe(document.body);
    return () => resizeObserver.disconnect();
  }, [postHeight]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== "Mutesolo.requirementEditor.requestContext") return;
      const context = buildContext();
      persistDraft(editor.document as Block[]);
      window.parent.postMessage(
        {
          type: "Mutesolo.requirementEditor.context",
          requestId: event.data.requestId,
          context
        },
        window.location.origin
      );
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [buildContext, editor, persistDraft]);

  return (
    <main className={`editorShell ${isEmbedded ? "embedded" : ""}`}>
      {!isEmbedded && (
        <header className="editorTopbar">
          <div>
            <p className="eyebrow">Mutesolo Requirement</p>
            <h1>Requirement Detail</h1>
            <p>Use BlockNote to capture requirement content.</p>
          </div>
          <div className="actionRow">
            <button type="button" onClick={saveDraft}>
              保存草稿
            </button>
          </div>
        </header>
      )}

      <section className="editorGrid">
        <section className="editorPanel">
          <div className="panelHead">
            <span>{blocks.length || editor.document.length} blocks</span>
          </div>
          <BlockNoteView
            editor={editor}
            theme="dark"
            onChange={() => {
              persistDraft(editor.document as Block[]);
              requestAnimationFrame(postHeight);
            }}
          />
        </section>
      </section>
    </main>
  );
}
