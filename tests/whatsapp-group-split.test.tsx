/**
 * Landing page: the single WhatsApp CTA became two location-based groups —
 * players pick the group for their area.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');

const DUBAILAND = 'https://chat.whatsapp.com/HqkDIpLMHyV7vKzjePctXr';
const DIP = 'https://chat.whatsapp.com/EPeC5K3IaM2Fa4910p8XpE';

describe('landing WhatsApp banner — two labelled area groups', () => {
  const src = read('client/src/pages/marketplace/MarketplaceHome.tsx');

  it('both group URLs live ONLY in the shared constants module (single source)', () => {
    const mod = read('client/src/lib/whatsappGroups.ts');
    expect(mod).toContain(`'${DUBAILAND}'`);
    expect(mod).toContain(`'${DIP}'`);
    // no hardcoded group links anywhere else in the two consumers
    expect(src).not.toContain('chat.whatsapp.com');
    expect(read('client/src/components/MarketplaceFooter.tsx')).not.toContain('chat.whatsapp.com/EPeC5K3IaM2Fa4910p8XpE');
    expect(src).toMatch(/import \{ WHATSAPP_DUBAILAND_URL, WHATSAPP_DIP_URL, WHATSAPP_GROUPS_ANCHOR_ID \} from '@\/lib\/whatsappGroups'/);
    expect(src).not.toMatch(/const WHATSAPP_URL =/);
  });

  it('renders one labelled option per group, correctly paired', () => {
    const dub = src.indexOf('button-join-whatsapp-dubailand');
    const dip = src.indexOf('button-join-whatsapp-dip');
    expect(dub).toBeGreaterThan(0);
    expect(dip).toBeGreaterThan(0);
    // href const sits with its own option (window around each testid)
    expect(src.slice(dub - 500, dub + 300)).toMatch(/WHATSAPP_DUBAILAND_URL/);
    expect(src.slice(dub - 500, dub + 300)).toMatch(/Dubailand \/ DSO/);
    expect(src.slice(dip - 500, dip + 300)).toMatch(/WHATSAPP_DIP_URL/);
    expect(src.slice(dip - 500, dip + 300)).toMatch(/>DIP</);
    // the old single CTA is gone
    expect(src).not.toContain('data-testid="button-join-whatsapp"');
  });

  it('both options use the landing design language: factory pills (Montserrat, 44px, press)', () => {
    const block = src.slice(src.indexOf('whatsapp-group-options'), src.indexOf('whatsapp-group-options') + 1600);
    expect((block.match(/ghostBtn\('sm'\)/g) ?? []).length).toBe(2);
    // external-link hygiene on both
    expect((block.match(/rel="noopener noreferrer"/g) ?? []).length).toBe(2);
    expect((block.match(/target="_blank"/g) ?? []).length).toBe(2);
  });

  it('footer icon deep-links to the landing groups block (anchor + label), from any page', () => {
    const foot = read('client/src/components/MarketplaceFooter.tsx');
    const i = foot.indexOf('link-footer-social-whatsapp');
    const around = foot.slice(i - 700, i + 400);
    expect(around).toMatch(/WHATSAPP_GROUPS_PATH/);
    expect(around).toMatch(/aria-label="WhatsApp community groups"/);
    expect(around).toMatch(/width: 44, height: 44/);
    // the landing block carries the anchor id + the hash-scroll effect exists
    expect(src).toMatch(/id=\{WHATSAPP_GROUPS_ANCHOR_ID\}/);
    expect(src).toMatch(/hashchange/);
  });

  it('footer Contact Us: two labelled 44px group links, noopener, importing the shared constants', () => {
    const foot = read('client/src/components/MarketplaceFooter.tsx');
    expect(foot).toMatch(/import \{ WHATSAPP_DUBAILAND_URL, WHATSAPP_DIP_URL, WHATSAPP_GROUPS_ANCHOR_ID, WHATSAPP_GROUPS_PATH \} from '@\/lib\/whatsappGroups'/);
    const dub = foot.indexOf('link-footer-whatsapp-dubailand');
    const dip = foot.indexOf('link-footer-whatsapp-dip');
    expect(dub).toBeGreaterThan(0);
    expect(dip).toBeGreaterThan(0);
    expect(foot.slice(dub - 500, dub + 300)).toMatch(/WHATSAPP_DUBAILAND_URL/);
    expect(foot.slice(dub - 500, dub + 300)).toMatch(/WhatsApp — Dubailand \/ DSO/);
    expect(foot.slice(dip - 500, dip + 300)).toMatch(/WHATSAPP_DIP_URL/);
    expect(foot.slice(dip - 500, dip + 300)).toMatch(/WhatsApp — DIP/);
    for (const w of [foot.slice(dub - 500, dub + 100), foot.slice(dip - 500, dip + 100)]) {
      expect(w).toMatch(/rel="noopener noreferrer"/);
      expect(w).toMatch(/min-h-11/);
    }
    // the old single community link is gone
    expect(foot).not.toContain('link-footer-whatsapp-group"');
  });
});
