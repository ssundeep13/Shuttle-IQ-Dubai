import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import { useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  Bold,
  Italic,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Minus,
  Undo,
  Redo,
  Link as LinkIcon,
  Unlink,
} from 'lucide-react';

interface BlogEditorProps {
  content: string;
  onChange: (html: string) => void;
}

function ToolbarButton({
  active,
  onClick,
  children,
  title,
  testId,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title: string;
  testId: string;
}) {
  return (
    <Button
      type="button"
      size="icon"
      variant={active ? 'secondary' : 'ghost'}
      className={`h-8 w-8 ${active ? 'toggle-elevate toggle-elevated' : ''}`}
      onClick={onClick}
      title={title}
      data-testid={testId}
    >
      {children}
    </Button>
  );
}

export default function BlogEditor({ content, onChange }: BlogEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          rel: 'noopener noreferrer',
          target: '_blank',
        },
      }),
    ],
    content,
    onUpdate: ({ editor: ed }) => {
      onChange(ed.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'blog-editor-content min-h-[300px] outline-none px-4 py-3',
        'data-testid': 'input-blog-content',
      },
    },
  });

  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  const setLink = useCallback(() => {
    if (!editor) return;
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('URL', previousUrl || 'https://');
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    const trimmed = url.trim();
    if (!/^https?:\/\//i.test(trimmed) && !trimmed.startsWith('/') && !trimmed.startsWith('mailto:')) {
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: trimmed }).run();
  }, [editor]);

  if (!editor) return null;

  return (
    <div className="rounded-md border" data-testid="blog-editor">
      <div className="flex items-center gap-0.5 flex-wrap border-b px-2 py-1.5 bg-muted/30">
        <ToolbarButton
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="Bold"
          testId="button-editor-bold"
        >
          <Bold className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="Italic"
          testId="button-editor-italic"
        >
          <Italic className="h-3.5 w-3.5" />
        </ToolbarButton>
        <div className="w-px h-5 bg-border mx-1" />
        <ToolbarButton
          active={editor.isActive('heading', { level: 1 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          title="Heading 1"
          testId="button-editor-h1"
        >
          <Heading1 className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('heading', { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          title="Heading 2"
          testId="button-editor-h2"
        >
          <Heading2 className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('heading', { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          title="Heading 3"
          testId="button-editor-h3"
        >
          <Heading3 className="h-3.5 w-3.5" />
        </ToolbarButton>
        <div className="w-px h-5 bg-border mx-1" />
        <ToolbarButton
          active={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          title="Bullet List"
          testId="button-editor-ul"
        >
          <List className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          title="Numbered List"
          testId="button-editor-ol"
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('blockquote')}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          title="Blockquote"
          testId="button-editor-quote"
        >
          <Quote className="h-3.5 w-3.5" />
        </ToolbarButton>
        <div className="w-px h-5 bg-border mx-1" />
        <ToolbarButton
          active={editor.isActive('link')}
          onClick={setLink}
          title="Add Link"
          testId="button-editor-link"
        >
          <LinkIcon className="h-3.5 w-3.5" />
        </ToolbarButton>
        {editor.isActive('link') && (
          <ToolbarButton
            onClick={() => editor.chain().focus().unsetLink().run()}
            title="Remove Link"
            testId="button-editor-unlink"
          >
            <Unlink className="h-3.5 w-3.5" />
          </ToolbarButton>
        )}
        <ToolbarButton
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          title="Horizontal Rule"
          testId="button-editor-hr"
        >
          <Minus className="h-3.5 w-3.5" />
        </ToolbarButton>
        <div className="w-px h-5 bg-border mx-1" />
        <ToolbarButton
          onClick={() => editor.chain().focus().undo().run()}
          title="Undo"
          testId="button-editor-undo"
        >
          <Undo className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().redo().run()}
          title="Redo"
          testId="button-editor-redo"
        >
          <Redo className="h-3.5 w-3.5" />
        </ToolbarButton>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
