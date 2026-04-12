import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { format } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar, Clock, ArrowRight } from 'lucide-react';
import { usePageTitle } from '@/hooks/usePageTitle';
import type { BlogPost } from '@shared/schema';

function estimateReadTime(content: string): number {
  const plainText = content.replace(/<[^>]*>/g, ' ');
  const words = plainText.trim().split(/\s+/).length;
  return Math.max(1, Math.ceil(words / 200));
}

export default function BlogList() {
  usePageTitle('Blog');

  const { data: posts, isLoading } = useQuery<BlogPost[]>({
    queryKey: ['/api/blog'],
  });

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 py-8 md:py-12">
      <div className="mb-8 md:mb-10">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight" data-testid="text-blog-heading">
          Blog
        </h1>
        <p className="text-muted-foreground mt-2 text-sm md:text-base" data-testid="text-blog-subheading">
          Tips, updates, and stories from the ShuttleIQ community.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-6">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-5 w-3/4 mb-3" />
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-4 w-2/3 mb-4" />
                <Skeleton className="h-3 w-1/4" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : !posts || posts.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground" data-testid="text-blog-empty">
              No posts yet. Check back soon!
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5">
          {posts.map((post) => (
            <Link
              key={post.id}
              href={`/marketplace/blog/${post.slug}`}
              className="block group"
              data-testid={`link-blog-post-${post.slug}`}
            >
              <Card className="hover-elevate transition-shadow">
                <CardContent className="p-5 md:p-6">
                  <div className="flex flex-col gap-3">
                    {post.featuredImage && (
                      <div className="w-full h-40 md:h-48 rounded-md overflow-hidden mb-1">
                        <img
                          src={post.featuredImage}
                          alt={post.title}
                          className="w-full h-full object-cover"
                          data-testid={`img-blog-post-${post.slug}`}
                        />
                      </div>
                    )}
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary" className="text-xs no-default-hover-elevate no-default-active-elevate">
                        {post.authorName}
                      </Badge>
                      {post.publishedAt && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(post.publishedAt), 'MMM d, yyyy')}
                        </span>
                      )}
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {estimateReadTime(post.content)} min read
                      </span>
                    </div>
                    <h2 className="text-lg md:text-xl font-semibold leading-snug group-hover:text-secondary transition-colors" data-testid={`text-blog-title-${post.slug}`}>
                      {post.title}
                    </h2>
                    {post.summary && (
                      <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2" data-testid={`text-blog-summary-${post.slug}`}>
                        {post.summary}
                      </p>
                    )}
                    <div className="flex items-center gap-1 text-sm font-medium text-secondary mt-1">
                      Read more <ArrowRight className="h-3.5 w-3.5" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
