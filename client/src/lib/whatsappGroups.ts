// The two location-based WhatsApp community groups. Single source — the
// landing banner and the footer both import from here; the raw URLs must not
// be hardcoded anywhere else (pinned in tests/whatsapp-group-split.test.tsx).
export const WHATSAPP_DUBAILAND_URL = 'https://chat.whatsapp.com/HqkDIpLMHyV7vKzjePctXr';
export const WHATSAPP_DIP_URL = 'https://chat.whatsapp.com/EPeC5K3IaM2Fa4910p8XpE';

// The landing-page block where a player picks their group; the footer's
// community icon deep-links here from any marketplace page.
export const WHATSAPP_GROUPS_ANCHOR_ID = 'whatsapp-groups';
export const WHATSAPP_GROUPS_PATH = '/marketplace#whatsapp-groups';
