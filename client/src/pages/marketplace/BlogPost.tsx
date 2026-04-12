import { useQuery } from '@tanstack/react-query';
import { useRoute, Link } from 'wouter';
import { format } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar, Clock, ArrowLeft } from 'lucide-react';
import { usePageTitle } from '@/hooks/usePageTitle';
import type { BlogPost as BlogPostType } from '@shared/schema';

function estimateReadTime(content: string): number {
  const words = content.trim().split(/\s+/).length;
  return Math.max(1, Math.ceil(words / 200));
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeUrl(url: string): string {
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('/')) return trimmed;
  return '';
}

function renderMarkdown(content: string): string {
  let html = escapeHtml(content);
  html = html.replace(/^### (.+)$/gm, '<h3 class="text-lg font-semibold mt-6 mb-2">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="text-xl font-bold mt-8 mb-3">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold mt-8 mb-4">$1</h1>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text: string, url: string) => {
    const safeUrl = sanitizeUrl(url);
    return safeUrl ? `<a href="${safeUrl}" class="text-secondary underline hover:text-secondary/80" target="_blank" rel="noopener noreferrer">${text}</a>` : text;
  });
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt: string, url: string) => {
    const safeUrl = sanitizeUrl(url);
    return safeUrl ? `<img src="${safeUrl}" alt="${alt}" class="rounded-md my-4 max-w-full" />` : '';
  });
  html = html.replace(/^- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>');
  html = html.replace(/(<li[^>]*>.*<\/li>\n?)+/g, (match) => `<ul class="my-3 space-y-1">${match}</ul>`);
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote class="border-l-4 border-secondary/30 pl-4 my-4 italic text-muted-foreground">$1</blockquote>');
  html = html.replace(/`([^`]+)`/g, '<code class="bg-muted px-1.5 py-0.5 rounded text-sm font-mono">$1</code>');
  html = html.replace(/^---$/gm, '<hr class="my-6 border-border" />');
  const lines = html.split('\n');
  const processed = lines.map(line => {
    const trimmed = line.trim();
    if (!trimmed) return '';
    if (trimmed.startsWith('<h') || trimmed.startsWith('<ul') || trimmed.startsWith('<li') ||
        trimmed.startsWith('<blockquote') || trimmed.startsWith('<hr') || trimmed.startsWith('<img')) {
      return line;
    }
    return `<p class="my-2 leading-relaxed">${line}</p>`;
  });
  return processed.join('\n');
}

export default function BlogPost() {
  const [, params] = useRoute('/marketplace/blog/:slug');
  const slug = params?.slug ?? '';

  const { data: post, isLoading, error } = useQuery<BlogPostType>({
    queryKey: ['/api/blog', slug],
    enabled: !!slug,
  });

  usePageTitle(post?.title ?? 'Blog');

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto px-4 md:px-6 py-8">
        <Skeleton className="h-8 w-3/4 mb-4" />
        <Skeleton className="h-4 w-1/3 mb-8" />
        <div className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="max-w-3xl mx-auto px-4 md:px-6 py-16 text-center">
        <h1 className="text-2xl font-bold mb-3" data-testid="text-post-not-found">Post not found</h1>
        <p className="text-muted-foreground mb-6">
          This blog post doesn't exist or has been removed.
        </p>
        <Link href="/marketplace/blog">
          <Button variant="outline" data-testid="button-back-to-blog">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Blog
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-8 md:py-12">
      <Link href="/marketplace/blog" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6" data-testid="link-back-to-blog">
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Blog
      </Link>

      <article>
        <header className="mb-8">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight leading-tight mb-4" data-testid="text-post-title">
            {post.title}
          </h1>

          <div className="flex items-center gap-3 flex-wrap">
            <Badge variant="secondary" className="no-default-hover-elevate no-default-active-elevate">
              {post.authorName}
            </Badge>
            {post.publishedAt && (
              <span className="flex items-center gap-1 text-sm text-muted-foreground" data-testid="text-post-date">
                <Calendar className="h-3.5 w-3.5" />
                {format(new Date(post.publishedAt), 'MMMM d, yyyy')}
              </span>
            )}
            <span className="flex items-center gap-1 text-sm text-muted-foreground" data-testid="text-post-read-time">
              <Clock className="h-3.5 w-3.5" />
              {estimateReadTime(post.content)} min read
            </span>
          </div>
        </header>

        {post.featuredImage && (
          <div className="w-full rounded-md overflow-hidden mb-8">
            <img
              src={post.featuredImage}
              alt={post.title}
              className="w-full h-auto object-cover"
              data-testid="img-post-featured"
            />
          </div>
        )}

        <div
          className="prose prose-sm md:prose-base max-w-none text-foreground"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(post.content) }}
          data-testid="div-post-content"
        />
      </article>
    </div>
  );
}
