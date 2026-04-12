import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRoute, Link } from 'wouter';
import { format } from 'date-fns';
import DOMPurify from 'dompurify';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar, Clock, ArrowLeft } from 'lucide-react';
import { usePageTitle } from '@/hooks/usePageTitle';
import { renderMarkdown } from '@/lib/renderMarkdown';
import type { BlogPost as BlogPostType } from '@shared/schema';

function estimateReadTime(content: string): number {
  const plainText = content.replace(/<[^>]*>/g, ' ');
  const words = plainText.trim().split(/\s+/).length;
  return Math.max(1, Math.ceil(words / 200));
}

function isHtmlContent(content: string): boolean {
  return /^<[a-z][\s\S]*>/i.test(content.trim());
}

export default function BlogPost() {
  const [, params] = useRoute('/marketplace/blog/:slug');
  const slug = params?.slug ?? '';

  const { data: post, isLoading, error } = useQuery<BlogPostType>({
    queryKey: ['/api/blog', slug],
    enabled: !!slug,
  });

  usePageTitle(post?.title ?? 'Blog');

  useEffect(() => {
    if (!post) return;
    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: post.title,
      description: post.summary || undefined,
      image: post.featuredImage || undefined,
      author: { '@type': 'Organization', name: post.authorName },
      publisher: {
        '@type': 'Organization',
        name: 'ShuttleIQ',
        url: 'https://shuttleiq.org',
      },
      datePublished: post.publishedAt ? new Date(post.publishedAt).toISOString() : undefined,
      dateModified: post.updatedAt ? new Date(post.updatedAt).toISOString() : undefined,
      mainEntityOfPage: {
        '@type': 'WebPage',
        '@id': `https://shuttleiq.org/marketplace/blog/${post.slug}`,
      },
    };
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(jsonLd);
    document.head.appendChild(script);
    return () => { document.head.removeChild(script); };
  }, [post]);

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
          className="blog-content max-w-none"
          dangerouslySetInnerHTML={{
            __html: DOMPurify.sanitize(
              isHtmlContent(post.content)
                ? post.content
                : renderMarkdown(post.content),
              { ADD_ATTR: ['target', 'rel'] }
            ),
          }}
          data-testid="div-post-content"
        />
      </article>
    </div>
  );
}
