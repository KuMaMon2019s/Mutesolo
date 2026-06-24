import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";

import type { Block, PartialBlock } from "@blocknote/core";
import { BlockNoteView } from "@blocknote/mantine";
import { useCreateBlockNote } from "@blocknote/react";
import { useCallback, useMemo, useState } from "react";

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
  objectUrl: string;
};

type ExportedAttachment = Omit<Attachment, "objectUrl"> & {
  source: "local_browser_attachment";
};

type EditorContext = {
  schemaVersion: 1;
  source: "mutisolo-requirement-editor";
  blocks: Block[];
  plainText: string;
  tencentDocs: TencentDoc[];
  attachments: ExportedAttachment[];
};

const draftKey = "mutisolo.requirementEditor.draft.v1";

const starterBlocks: PartialBlock[] = [
  {
    type: "heading",
    props: { level: 2 },
    content: "需求标题"
  },
  {
    type: "paragraph",
    content: "在这里补充功能需求、接口要求、边界条件和验收标准。"
  }
];

function readDraft(): { blocks?: PartialBlock[]; tencentDocs?: TencentDoc[]; attachments?: Attachment[] } {
  const raw = window.localStorage.getItem(draftKey);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as { blocks?: PartialBlock[]; tencentDocs?: TencentDoc[]; attachments?: Attachment[] };
  } catch {
    return {};
  }
}

function makeAttachment(file: File, objectUrl: string): Attachment {
  return {
    id: crypto.randomUUID(),
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    kind: file.type.startsWith("image/") ? "image" : "file",
    objectUrl
  };
}

function sanitizeAttachments(attachments: Attachment[]): ExportedAttachment[] {
  return attachments.map(({ objectUrl: _objectUrl, ...attachment }) => ({
    ...attachment,
    source: "local_browser_attachment"
  }));
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

function emptyTencentDoc(): TencentDoc {
  return {
    type: "tencent_doc",
    title: "",
    url: "",
    readInstruction: ""
  };
}

export function RequirementEditor() {
  const draft = useMemo(readDraft, []);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [tencentDocs, setTencentDocs] = useState<TencentDoc[]>(draft.tencentDocs?.length ? draft.tencentDocs : [emptyTencentDoc()]);
  const [attachments, setAttachments] = useState<Attachment[]>(draft.attachments || []);
  const [exportedContext, setExportedContext] = useState<EditorContext | null>(null);
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const [status, setStatus] = useState("Draft is stored only in this browser until backend file storage is connected.");

  const uploadFile = useCallback(async (file: File) => {
    const objectUrl = URL.createObjectURL(file);
    const attachment = makeAttachment(file, objectUrl);
    setAttachments((current) => [...current, attachment]);
    return {
      url: objectUrl,
      name: file.name,
      caption: "Local browser attachment. Backend parsing is required before sending to an online LLM."
    };
  }, []);

  const editor = useCreateBlockNote(
    {
      initialContent: draft.blocks?.length ? draft.blocks : starterBlocks,
      uploadFile
    },
    []
  );

  const buildContext = useCallback((): EditorContext => {
    const currentBlocks = editor.document as Block[];
    return {
      schemaVersion: 1,
      source: "mutisolo-requirement-editor",
      blocks: currentBlocks,
      plainText: buildPlainText(currentBlocks),
      tencentDocs: tencentDocs.filter((doc) => doc.title.trim() || doc.url.trim() || doc.readInstruction.trim()),
      attachments: sanitizeAttachments(attachments)
    };
  }, [attachments, editor, tencentDocs]);

  const saveDraft = () => {
    const currentBlocks = editor.document as Block[];
    window.localStorage.setItem(
      draftKey,
      JSON.stringify({
        blocks: currentBlocks,
        tencentDocs,
        attachments
      })
    );
    setBlocks(currentBlocks);
    setStatus("Draft saved to localStorage as blocks JSON.");
  };

  const exportContext = () => {
    const context = buildContext();
    setBlocks(context.blocks);
    setExportedContext(context);
    setStatus("Context exported. Local object URLs were stripped from attachments.");
  };

  const generateShortPrompt = async () => {
    const context = buildContext();
    setExportedContext(context);
    const response = await fetch("/api/generate-prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        blocks: context.blocks,
        tencentDocs: context.tencentDocs,
        attachments: context.attachments,
        plainText: context.plainText
      })
    });
    const data = (await response.json()) as { prompt?: string; error?: string };
    if (!response.ok) throw new Error(data.error || "Prompt generation failed");
    setGeneratedPrompt(data.prompt || "");
    setStatus("Short prompt generated by the local backend placeholder.");
  };

  const updateTencentDoc = (index: number, patch: Partial<TencentDoc>) => {
    setTencentDocs((current) => current.map((doc, docIndex) => (docIndex === index ? { ...doc, ...patch } : doc)));
  };

  const removeTencentDoc = (index: number) => {
    setTencentDocs((current) => current.filter((_, docIndex) => docIndex !== index));
  };

  return (
    <main className="editorShell">
      <header className="editorTopbar">
        <div>
          <p className="eyebrow">MutiSolo Webapps</p>
          <h1>Requirement Editor</h1>
          <p>Use BlockNote to capture demand context without leaking local file paths to online LLMs.</p>
        </div>
        <div className="actionRow">
          <button type="button" onClick={saveDraft}>
            保存草稿
          </button>
          <button type="button" className="secondary" onClick={exportContext}>
            导出上下文
          </button>
          <button type="button" className="secondary" onClick={() => void generateShortPrompt().catch((error: Error) => setStatus(error.message))}>
            生成短提示词
          </button>
        </div>
      </header>

      <section className="editorGrid">
        <section className="editorPanel">
          <div className="panelHead">
            <div>
              <h2>需求正文</h2>
              <p>支持普通文字、图片块和文件块。上传内容只保留浏览器本地对象引用。</p>
            </div>
            <span>{blocks.length || editor.document.length} blocks</span>
          </div>
          <BlockNoteView
            editor={editor}
            theme="dark"
            onChange={() => {
              setBlocks(editor.document as Block[]);
            }}
          />
        </section>

        <aside className="sidePanel">
          <section className="card">
            <div className="panelHead">
              <div>
                <h2>腾讯文档链接</h2>
                <p>第一版作为结构化卡片保存，后续可升级为 BlockNote custom block。</p>
              </div>
              <button type="button" className="iconButton" onClick={() => setTencentDocs((current) => [...current, emptyTencentDoc()])}>
                +
              </button>
            </div>
            <div className="docList">
              {tencentDocs.map((doc, index) => (
                <article className="docCard" key={index}>
                  <input value={doc.title} placeholder="需求说明文档" onChange={(event) => updateTencentDoc(index, { title: event.target.value })} />
                  <input value={doc.url} placeholder="https://docs.qq.com/xxx" onChange={(event) => updateTencentDoc(index, { url: event.target.value })} />
                  <textarea
                    value={doc.readInstruction}
                    placeholder="只读取功能需求、接口要求和输出格式"
                    onChange={(event) => updateTencentDoc(index, { readInstruction: event.target.value })}
                  />
                  <button type="button" className="secondary" onClick={() => removeTencentDoc(index)}>
                    Remove
                  </button>
                </article>
              ))}
            </div>
          </section>

          <section className="card">
            <h2>本地附件</h2>
            <p>后续由本地 Go 后端读取/解析。导出给 LLM 时不会包含本地路径或 blob URL。</p>
            <div className="attachmentList">
              {attachments.length ? (
                attachments.map((attachment) => (
                  <div className="attachmentRow" key={attachment.id}>
                    <span className={attachment.kind}>{attachment.kind}</span>
                    <strong>{attachment.name}</strong>
                    <small>{Math.ceil(attachment.size / 1024)} KB</small>
                  </div>
                ))
              ) : (
                <p className="empty">Use BlockNote image/file upload to add attachments.</p>
              )}
            </div>
          </section>

          <section className="card">
            <h2>状态</h2>
            <p>{status}</p>
          </section>
        </aside>
      </section>

      <section className="outputGrid">
        <section className="card">
          <h2>结构化上下文 JSON</h2>
          <pre>{exportedContext ? JSON.stringify(exportedContext, null, 2) : "Click 导出上下文 to inspect blocks JSON."}</pre>
        </section>
        <section className="card">
          <h2>短提示词</h2>
          <pre>{generatedPrompt || "Click 生成短提示词 to call POST /api/generate-prompt."}</pre>
        </section>
      </section>
    </main>
  );
}
