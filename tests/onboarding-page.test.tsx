import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/contexts/MarketplaceAuthContext', () => ({
  useMarketplaceAuth: vi.fn(),
}));
vi.mock('@/hooks/usePageTitle', () => ({ usePageTitle: () => {} }));
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

import Onboarding from '@/pages/marketplace/Onboarding';
import { useMarketplaceAuth } from '@/contexts/MarketplaceAuthContext';

function renderPage() {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ score: 75, tier: 'upper_intermediate' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  vi.stubGlobal('fetch', fetchMock);

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { hook } = memoryLocation({ path: '/marketplace/onboarding' });
  render(
    <QueryClientProvider client={qc}>
      <Router hook={hook}>
        <Onboarding />
      </Router>
    </QueryClientProvider>,
  );
  return { fetchMock };
}

describe('Onboarding page UI', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    (useMarketplaceAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      user: {
        id: 'u1',
        email: 'a@b.com',
        name: 'Alice',
        onboardingCompleted: false,
        onboardingAnswers: null,
        canRetakeOnboarding: false,
        linkedPlayerId: null,
      },
      isLoading: false,
      isAuthenticated: true,
      login: vi.fn(),
      signup: vi.fn(),
      loginWithTokens: vi.fn(),
      logout: vi.fn(),
      error: null,
    });
  });

  it('renders all three questions and keeps the submit button disabled until every question is answered', async () => {
    renderPage();

    expect(screen.getByTestId('card-question-experience')).toBeInTheDocument();
    expect(screen.getByTestId('card-question-rallies')).toBeInTheDocument();
    expect(screen.getByTestId('card-question-games')).toBeInTheDocument();

    const submit = screen.getByTestId('button-submit-onboarding') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    fireEvent.click(screen.getByTestId('radio-experience-3'));
    expect((screen.getByTestId('button-submit-onboarding') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId('radio-rallies-3'));
    expect((screen.getByTestId('button-submit-onboarding') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId('radio-games-3'));

    await waitFor(() => {
      expect((screen.getByTestId('button-submit-onboarding') as HTMLButtonElement).disabled).toBe(false);
    });

    // Live tier preview reflects the band-snap score for avg=3 → 75.
    expect(screen.getByTestId('text-preview-tier').textContent).toMatch(/75/);
  });

  it('submits the three answers to /api/marketplace/onboarding when the user clicks Save & continue', async () => {
    const { fetchMock } = renderPage();

    fireEvent.click(screen.getByTestId('radio-experience-3'));
    fireEvent.click(screen.getByTestId('radio-rallies-3'));
    fireEvent.click(screen.getByTestId('radio-games-3'));

    await waitFor(() => {
      expect((screen.getByTestId('button-submit-onboarding') as HTMLButtonElement).disabled).toBe(false);
    });

    fireEvent.click(screen.getByTestId('button-submit-onboarding'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/api/marketplace/onboarding');
    expect(init?.method).toBe('POST');
    expect(JSON.parse((init?.body as string) ?? '{}')).toEqual({
      experience: 3,
      rallies: 3,
      games: 3,
    });
  });
});
