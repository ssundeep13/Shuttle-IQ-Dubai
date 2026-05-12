import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { RobotsMetaController } from '@/components/RobotsMetaController';
import { MarketplaceFooter } from '@/components/MarketplaceFooter';
import { MarketplaceNav } from '@/components/MarketplaceNav';
import { MarketplaceAuthProvider } from '@/contexts/MarketplaceAuthContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  NOINDEX_PATH_PATTERNS,
  ROBOTS_TXT_DISALLOW,
  isNoindexPath,
} from '@shared/seo';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function renderAt(path: string) {
  const { hook } = memoryLocation({ path });
  return render(
    <Router hook={hook}>
      <RobotsMetaController />
    </Router>,
  );
}

function getRobotsContent(): string | null {
  return document
    .querySelector('meta[name="robots"]')
    ?.getAttribute('content') ?? null;
}

describe('RobotsMetaController', () => {
  beforeEach(() => {
    document
      .querySelectorAll('meta[name="robots"]')
      .forEach((el) => el.remove());
    const baseline = document.createElement('meta');
    baseline.setAttribute('name', 'robots');
    baseline.setAttribute('content', 'index,follow');
    document.head.appendChild(baseline);
  });

  it('keeps the default index,follow on public marketplace pages', () => {
    renderAt('/marketplace/book');
    expect(getRobotsContent()).toBe('index,follow');
  });

  it('keeps the default index,follow on the home page', () => {
    renderAt('/');
    expect(getRobotsContent()).toBe('index,follow');
  });

  it('emits noindex,nofollow on admin routes', () => {
    renderAt('/admin/sessions');
    expect(getRobotsContent()).toBe('noindex,nofollow');
  });

  it('emits noindex,nofollow on checkout routes', () => {
    renderAt('/marketplace/checkout/abc');
    expect(getRobotsContent()).toBe('noindex,nofollow');
  });

  it('emits noindex,nofollow on the welcome screen', () => {
    renderAt('/welcome');
    expect(getRobotsContent()).toBe('noindex,nofollow');
  });

  it('emits noindex,nofollow on player public profile personality card', () => {
    renderAt('/marketplace/players/123/personality-card');
    expect(getRobotsContent()).toBe('noindex,nofollow');
  });

  it('restores the previous content when the noindex page unmounts', () => {
    const { unmount } = renderAt('/admin/sessions');
    expect(getRobotsContent()).toBe('noindex,nofollow');
    unmount();
    expect(getRobotsContent()).toBe('index,follow');
  });
});

function assertAllLinksHaveNames(container: HTMLElement) {
  const links = Array.from(container.querySelectorAll('a'));
  expect(links.length).toBeGreaterThan(0);
  for (const a of links) {
    const name =
      a.getAttribute('aria-label') ??
      a.getAttribute('title') ??
      a.textContent?.trim() ??
      '';
    expect(
      name.length,
      `link ${a.outerHTML} must have an accessible name`,
    ).toBeGreaterThan(0);
  }
}

describe('Marketplace links — descriptive accessible names', () => {
  it('every anchor in the footer has a non-empty accessible name', () => {
    const { container } = render(<MarketplaceFooter />);
    assertAllLinksHaveNames(container);
  });

  it('every anchor in the nav has a non-empty accessible name (incl. brand wordmark)', () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { container, getByTestId } = render(
      <QueryClientProvider client={qc}>
        <MarketplaceAuthProvider>
          <Router hook={memoryLocation({ path: '/' }).hook}>
            <MarketplaceNav />
          </Router>
        </MarketplaceAuthProvider>
      </QueryClientProvider>,
    );
    assertAllLinksHaveNames(container);
    expect(getByTestId('link-marketplace-home').getAttribute('aria-label'))
      .toBe('ShuttleIQ home');
  });
});

describe('SEO route lists — parity across all three sources', () => {
  it('every robots.txt Disallow line matches a noindex regex', () => {
    for (const line of ROBOTS_TXT_DISALLOW) {
      // robots.txt prefix rules: synthesize a representative path.
      const sample = line.endsWith('/') ? line + 'x' : line;
      expect(
        isNoindexPath(sample),
        `robots.txt disallows ${line} but no NOINDEX regex matches it`,
      ).toBe(true);
    }
  });

  it('robots.txt on disk matches the canonical Disallow list', () => {
    const txt = readFileSync(
      resolve(process.cwd(), 'client/public/robots.txt'),
      'utf-8',
    );
    for (const line of ROBOTS_TXT_DISALLOW) {
      expect(txt, `robots.txt missing Disallow: ${line}`).toContain(
        `Disallow: ${line}`,
      );
    }
  });

  it('exposes a non-empty canonical pattern list', () => {
    expect(NOINDEX_PATH_PATTERNS.length).toBeGreaterThan(5);
  });
});
