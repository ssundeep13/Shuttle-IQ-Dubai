import { db } from './db';
import { tags } from '@shared/schema';
import { nanoid } from 'nanoid';
import { sql } from 'drizzle-orm';

const TAG_DATA: Array<{ label: string; emoji: string; category: string }> = [
  // Playing Style
  { label: 'Smasher',              emoji: '🔥', category: 'playing_style' },
  { label: 'The Wall',             emoji: '🧱', category: 'playing_style' },
  { label: 'Precision Player',     emoji: '🎯', category: 'playing_style' },
  { label: 'Speedster',            emoji: '⚡', category: 'playing_style' },
  { label: 'Tactical Player',      emoji: '🧠', category: 'playing_style' },
  { label: 'Deception Master',     emoji: '🎭', category: 'playing_style' },
  { label: 'Rally King',           emoji: '🔁', category: 'playing_style' },
  { label: 'Sharp Shooter',        emoji: '🏹', category: 'playing_style' },
  { label: 'Aggressor',            emoji: '🧨', category: 'playing_style' },
  { label: 'Control Player',       emoji: '🎮', category: 'playing_style' },
  { label: 'Soft Touch',           emoji: '🪶', category: 'playing_style' },
  { label: 'Power Player',         emoji: '🚀', category: 'playing_style' },
  // Social / Personality
  { label: 'Ultra Friendly',       emoji: '😄', category: 'social' },
  { label: 'Vibe Creator',         emoji: '🎉', category: 'social' },
  { label: 'Team Player',          emoji: '🤝', category: 'social' },
  { label: 'Funny One',            emoji: '😂', category: 'social' },
  { label: 'Calm & Composed',      emoji: '🧊', category: 'social' },
  { label: 'Talkative',            emoji: '🗣️', category: 'social' },
  { label: 'Chill Player',         emoji: '🧘', category: 'social' },
  { label: 'Respectful',           emoji: '🫡', category: 'social' },
  { label: 'High Energy',          emoji: '⚡', category: 'social' },
  { label: 'Silent Killer',        emoji: '👀', category: 'social' },
  // Reputation
  { label: 'MVP',                  emoji: '🐐', category: 'reputation' },
  { label: 'Clutch Player',        emoji: '💪', category: 'reputation' },
  { label: 'Crowd Favorite',       emoji: '🧲', category: 'reputation' },
  { label: 'Consistent Performer', emoji: '🎯', category: 'reputation' },
  { label: 'Comeback King',        emoji: '🧗', category: 'reputation' },
  { label: 'Underrated',           emoji: '💎', category: 'reputation' },
  { label: 'Most Improved',        emoji: '📈', category: 'reputation' },
  { label: 'Game Changer',         emoji: '👑', category: 'reputation' },
  // Women-centric
  { label: 'Queen of the Court',   emoji: '👑', category: 'reputation' },
  { label: 'Newbie',               emoji: '🌱', category: 'social' },
  { label: 'Fearless',             emoji: '🦁', category: 'reputation' },
  { label: 'Trailblazer',          emoji: '🔥', category: 'social' },
  { label: 'Court Diva',           emoji: '💅', category: 'social' },
];

export async function seedTags(): Promise<void> {
  try {
    const existing = await db.select({ label: tags.label }).from(tags);
    const existingLabels = new Set(existing.map(r => r.label));
    const missing = TAG_DATA.filter(t => !existingLabels.has(t.label));
    if (missing.length === 0) return;
    await db.insert(tags).values(missing.map(t => ({ id: nanoid(), ...t, isActive: true })));
    console.log(`[Seed] Inserted ${missing.length} new player personality tags`);
  } catch (err) {
    console.error('[Seed] Failed to seed tags:', err);
  }
}
