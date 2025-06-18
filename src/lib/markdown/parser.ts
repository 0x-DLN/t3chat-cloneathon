import { marked } from "marked";
import TurndownService from "turndown";
import { generateHTML, generateJSON } from "@tiptap/html";
import StarterKit from "@tiptap/starter-kit";
import { getSchema, type JSONContent } from "@tiptap/core";
import { MarkdownSerializer } from "prosemirror-markdown";

export async function markdownToTiptapJson(markdown: string) {
  const html = await marked(markdown);
  const tiptapJson = generateJSON(html.toString(), [StarterKit.configure()]);
  return tiptapJson;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function tiptapJsonToMarkdown(json: any) {
  const html = generateHTML(json, [StarterKit]);
  const markdown = turndownService.turndown(html);
  return markdown.toString();
}

export function convertTiptapJsonToMarkdown(json: JSONContent): string {
  if (!json || !json.content) {
    return "";
  }

  try {
    const prosemirrorNode = tiptapSchema.nodeFromJSON(json);
    return serializer.serialize(prosemirrorNode, {
      tightLists: true,
    });
  } catch (error) {
    console.error("Error converting Tiptap JSON to Markdown:", error);
    return "Error during conversion.";
  }
}

const tiptapSchema = getSchema([StarterKit]);

const turndownService = new TurndownService();

const serializer = new MarkdownSerializer(
  {
    blockquote(state, node) {
      state.wrapBlock("> ", null, node, () => state.renderContent(node));
    },
    codeBlock(state, node) {
      state.write("```" + (node.attrs.params || "") + "\n");
      state.text(node.textContent, false);
      state.ensureNewLine();
      state.write("```");
      state.closeBlock(node);
    },
    heading(state, node) {
      state.write(state.repeat("#", node.attrs.level) + " ");
      state.renderInline(node);
      state.closeBlock(node);
    },
    horizontalRule(state, node) {
      state.write(node.attrs.markup || "---");
      state.closeBlock(node);
    },
    bulletList(state, node) {
      state.renderList(node, "  ", () => (node.attrs.bullet || "*") + " ");
    },
    orderedList(state, node) {
      const start = node.attrs.order || 1;
      const maxW = String(start + node.childCount - 1).length;
      const space = state.repeat(" ", maxW + 2);
      state.renderList(node, space, (i) => {
        const nStr = String(start + i);
        return state.repeat(" ", maxW - nStr.length) + nStr + ". ";
      });
    },
    listItem(state, node) {
      state.renderContent(node);
    },
    paragraph(state, node) {
      state.renderInline(node);
      state.closeBlock(node);
    },
    text(state, node) {
      state.text(node.text || "");
    },
    hardBreak(state, node, parent, index) {
      for (let i = index + 1; i < parent.childCount; i++) {
        if (parent.child(i).type != node.type) {
          state.write("\\\n");
          return;
        }
      }
    },
  },
  {
    bold: {
      open: "**",
      close: "**",
      mixable: true,
      expelEnclosingWhitespace: true,
    },
    italic: {
      open: "*",
      close: "*",
      mixable: true,
      expelEnclosingWhitespace: true,
    },
    strike: {
      open: "~~",
      close: "~~",
      mixable: true,
      expelEnclosingWhitespace: true,
    },
    code: { open: "`", close: "`", escape: false },
    link: {
      open: "[",
      close(state, mark) {
        const href = state.esc(mark.attrs.href);
        const title = mark.attrs.title
          ? ` "${state.esc(mark.attrs.title)}"`
          : "";
        return `](${href}${title})`;
      },
    },
  }
);
