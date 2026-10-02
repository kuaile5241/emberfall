const art = {
  'fire-pillars': '<path d="M19 48l2-22 6 11 5-22 6 23 5-15 3 25"/><path d="M16 50h33M12 55h39"/><path d="M26 45l4-17 6 17"/>',
  'fire-meteor': '<path d="M43 12L24 34m28-13L32 40m6-28L19 32"/><path d="M18 33l14 2 6 12-12 8-13-9z"/><path d="M20 39l9 3 3 7M11 54h35"/>',
  'water-blizzard': '<path d="M16 25c-9-2-7-14 3-14 6-9 19-5 21 3 12-1 14 13 4 14H16"/><path d="M31 34v23m-10-17 20 12m-20 0 20-12m-15-3 5 4 5-4m-5 14-5 4m5-4 5 4"/><path d="M14 35l-3 6m39-6-3 6"/>',
  'water-torrent': '<path d="M8 34c11-16 24-18 37-8l10-8-2 27-24-2 9-8C25 27 21 31 8 34z"/><path d="M8 46c8-5 15-4 22 0s14 5 25-1M10 54c7-4 16-3 23 1"/>',
  'lightning-chain': '<path d="M14 14l9 12-7 6 24 6-4 8 15 5"/><circle cx="13" cy="13" r="5"/><circle cx="26" cy="31" r="5"/><circle cx="49" cy="50" r="5"/><path d="M45 10l-8 13h8l-5 9"/>',
  'lightning-lances': '<path d="M14 53l13-23-6-1 14-18-5 19 7 1-17 25M31 57l12-24-4-1 12-18-4 19 6 1-17 25M6 44l9-19-4-1 9-15-3 18 4 1-12 19"/>',
  armor: '<path d="M21 12l11 6 11-6 12 11-9 12-4-5 3 26H19l3-26-4 5-9-12z"/><path d="M26 20l6 9 6-9M26 35h12M25 43h14"/>',
  legacy: '<circle cx="32" cy="32" r="18"/><circle cx="32" cy="32" r="8"/><path d="M32 5v11m0 32v11M5 32h11m32 0h11"/>',
};
export function buildSkillIcon(id, element = 'fire') {
  return `<svg class="build-glyph" data-glyph="${art[id] ? id : 'legacy'}" data-element="${element}" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle class="build-glyph-ring" cx="32" cy="32" r="29"/>${art[id] || art.legacy}</svg>`;
}
