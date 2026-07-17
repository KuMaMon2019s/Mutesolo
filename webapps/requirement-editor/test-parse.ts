// Quick test: verify tryParseHTMLToBlocks handles <img> in various HTML structures
// Run with: cd webapps/requirement-editor && npx tsx --tsconfig tsconfig.json test-parse.ts

import { BlockNoteEditor } from "@blocknote/core";

async function main() {
  // Minimal editor creation
  const editor = await BlockNoteEditor.create();

  const testCases = [
    {
      name: "plain img between p tags",
      html: '<p>Some text</p><img src="/assets/test.png"><p>More text</p>',
    },
    {
      name: "img inside div (contenteditable style)",
      html: '<div>Some text<img src="/assets/test.png">More text</div>',
    },
    {
      name: "img with br separators",
      html: '<div>Line one<br><br><img src="/assets/test.png" alt="screenshot"><br>Line two</div>',
    },
    {
      name: "standalone img",
      html: '<img src="/assets/test.png">',
    },
    {
      name: "multiple imgs with text",
      html: '<p>Text</p><img src="/assets/a.png"><img src="/assets/b.png"><p>More</p>',
    },
    {
      name: "img in paragraph",
      html: '<p>Text <img src="/assets/test.png"> more text</p>',
    },
  ];

  for (const tc of testCases) {
    console.log(`\n=== ${tc.name} ===`);
    console.log("HTML:", tc.html.substring(0, 80));
    try {
      const blocks = editor.tryParseHTMLToBlocks(tc.html);
      console.log("Block types:", blocks.map(b => b.type));
      const imgBlocks = blocks.filter(b => b.type === "image");
      console.log("Image blocks:", imgBlocks.length);
      if (imgBlocks.length > 0) {
        console.log("  URLs:", imgBlocks.map(b => b.props?.url));
      }
      // Also log all blocks' details
      for (const b of blocks) {
        if (b.type === "image") {
          console.log(`  image: url=${b.props?.url}, name=${b.props?.name}`);
        } else if (b.type === "paragraph") {
          const text = b.content?.map((c: any) => c.text || "").join("") || "";
          console.log(`  paragraph: "${text}"`);
        }
      }
    } catch(e: any) {
      console.log("ERROR:", e.message);
    }
  }

  console.log("\nDONE");
}

main().catch(console.error);
