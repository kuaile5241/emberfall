// Original inline artwork. SVG keeps the etched edges sharp at every HUD scale.
let serial = 0;

const PALETTES = {
  attack: ['#f4bd65', '#b55120'],
  dash: ['#a8e7d3', '#387a82'],
  burst: ['#ffc76c', '#cf4b22'],
  heal: ['#fb9b80', '#9c2937'],
};

function frame(id, accent) {
  return `<g class="icon-frame">
    <path d="M64 8 75 17 94 20 100 36 113 49 108 65 111 82 97 93 87 108 69 108 54 115 39 105 22 99 19 81 10 67 17 49 20 32 39 24 48 12Z" fill="url(#${id}-metal)" stroke="#161a18" stroke-width="3"/>
    <path d="M64 13 75 21 91 24 97 39 108 51 103 65 107 81 94 90 84 103 68 103 54 110 42 101 27 96 24 79 15 67 22 51 24 36 41 28 51 17Z" fill="none" stroke="#c2a77c" stroke-opacity=".7" stroke-width="1"/>
    <circle cx="64" cy="63" r="43.5" fill="url(#${id}-well)" stroke="#141d1b" stroke-width="4"/>
    <circle cx="64" cy="63" r="45.5" fill="none" stroke="#9b8056" stroke-width="1.4" stroke-dasharray="38 5 3 4"/>
    <path d="M27 40A43 43 0 0 1 88 24" fill="none" stroke="#e8c790" stroke-width="1.5" opacity=".72"/>
    <path d="M101 87A43 43 0 0 1 40 104" fill="none" stroke="#050b0d" stroke-width="3"/>
    <path d="m64 5 6 9-6 9-6-9Zm-48 51 7 7-7 8-7-8Zm97 0 7 7-7 8-7-8ZM64 104l7 9-7 10-7-10Z" fill="url(#${id}-bone)" stroke="#4d402d" stroke-width="1"/>
    <path d="m64 10 2 4-2 4-2-4Zm0 100 2 3-2 4-2-4Z" fill="${accent}"/>
    <g fill="#d5b17b" stroke="#453a2c" stroke-width="1.3"><circle cx="31" cy="31" r="2.4"/><circle cx="97" cy="31" r="2.4"/><circle cx="29" cy="96" r="2.4"/><circle cx="97" cy="96" r="2.4"/></g>
    <path d="m23 70 8-3m-4 20 6-4m56 18-3-6m17-48-8 3M43 23l4 7" stroke="#090e0e" stroke-width="1.3" opacity=".7"/>
  </g>`;
}

const art = {
  attack: id => `<g class="icon-art">
    <path d="M26 91C3 67 12 29 49 17 76 8 95 21 104 38 84 19 62 20 45 32 23 48 20 67 26 91Z" fill="url(#${id}-glow)" opacity=".8"/>
    <path d="M24 80C12 59 25 33 50 25M32 93C11 68 19 44 31 36" fill="none" stroke="#ffcf7b" stroke-width="2" stroke-linecap="round"/>
    <path d="m43 75 42-55 16-10-5 20-40 55Z" fill="url(#${id}-blade)" stroke="#27322e" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="m50 78 45-59-5 14-34 52Z" fill="#78958d"/>
    <path d="m49 70 43-53-40 59" fill="none" stroke="#fff9cf" stroke-width="2"/>
    <path d="m34 74 10-9 27 22-5 11-7-12-14-12Z" fill="url(#${id}-bone)" stroke="#443626" stroke-width="2"/>
    <path d="m40 82 10 8-15 20-11-8Z" fill="#54362d" stroke="#241f1b" stroke-width="2"/>
    <path d="m34 88 9 6m-13 0 9 6m-13 0 8 6" stroke="#b09260" stroke-width="2"/>
    <path d="m21 101 8-4 11 11-8 8-11-8Z" fill="url(#${id}-bone)" stroke="#3a3426" stroke-width="1.5"/>
    <path d="m69 42 6-8m4 40 8-4m-2-28 4-2" stroke="#ffce78" stroke-width="2" stroke-linecap="round"/>
    <g class="ember-mote" fill="#ffb94e"><path d="m18 38 4-6 2 6-3 5Z"/><path d="m99 58 3-5 2 4-3 5Z"/><circle cx="51" cy="17" r="1.8"/></g>
  </g>`,
  dash: id => `<g class="icon-art">
    <path d="M10 78C33 68 30 47 57 39 30 45 16 55 13 65 22 57 25 57 34 55 23 61 24 75 10 78ZM19 96c30 1 31-21 53-23-23 9-22 28-53 23Z" fill="#72c3bd" opacity=".35"/>
    <path d="M13 85c25-3 31-16 46-19M21 53c15-17 29-16 37-18M31 102c15-4 16-8 27-14" fill="none" stroke="#92d9ce" stroke-width="2" stroke-linecap="round" opacity=".7"/>
    <path d="M67 47C41 39 45 60 29 70L10 76c21 6 38-2 47-12-9 17-5 24-24 34 29-2 37-29 46-40Z" fill="url(#${id}-cloak)" stroke="#203e42" stroke-width="1.5"/>
    <path d="m71 43-15 18 6 16 18 1 10-15-5-13Z" fill="url(#${id}-blade)" stroke="#1d3335" stroke-width="2"/>
    <path d="m65 65-9 14-22 4-3 8 29-2 14-18M78 73l11 15 15 4-2 9-23-6-16-19" fill="none" stroke="#263f43" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="m64 66-7 12-16 5m35-7 12 15 13 3" fill="none" stroke="#9fb9a9" stroke-width="3" stroke-linecap="round"/>
    <path d="m84 53 13 4 13-13M65 51 49 54l-8 12" fill="none" stroke="#a3beb4" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="m107 41 8-3-3 11-5 2Z" fill="#ecdec0"/>
    <path d="M70 32q0-11 11-12 12-1 16 10l-7 14-15-1Z" fill="url(#${id}-bone)" stroke="#304447" stroke-width="2"/>
    <path d="m76 23 13 2 8 7-12 2-9-3Z" fill="#638d89"/><path d="m84 33 11-2-3 6-9 1Z" fill="#16353b"/><path d="m86 34 7-1" stroke="#c4ffdd" stroke-width="2"/>
    <path d="M80 21c-5-7-13-6-16-3 8-1 9 3 10 8" fill="#6fbcae"/>
    <g class="ember-mote" fill="#b8f9d8"><path d="m18 70 7-4-3 6Z"/><path d="m43 35 6-5-1 5Z"/><circle cx="24" cy="93" r="1.7"/></g>
  </g>`,
  burst: id => `<g class="icon-art">
    <path d="M64 7c-13 20-8 26-18 28-5-6-8-11-7-18-17 21-5 30-15 36-2-7-4-9-8-12 0 17-5 21 5 34 8 13 22 18 44 16 32-2 46-21 41-45-3 8-7 13-12 14 6-18-5-27-3-39-13 10-8 21-16 24C66 35 70 19 64 7Z" fill="url(#${id}-fire)" stroke="#bc662a" stroke-width="1"/>
    <path d="M64 27c-7 17-1 21-9 29-3-7-6-9-9-12-9 14-6 20-15 23 10 15 41 20 54 6 12-12 6-21 5-26-3 9-9 12-14 13-10-9-4-21-12-33Z" fill="#ffd17d" opacity=".95"/>
    <path d="M62 40c-7 14-10 17-4 28 8 8 21 5 24-4-9 2-17-7-20-24Z" fill="#fff3bb"/>
    <path d="m52 116 3-24-12-16-8-8q-3-5 1-8t8 1l9 8-5-30q0-5 4-5t6 5l4 25 2-34q1-5 5-4t4 5l-1 33 7-26q1-5 5-3t3 6l-6 29 7-16q2-5 6-3t2 6L84 90l-9 25Z" fill="url(#${id}-hand)" stroke="#703d2b" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="m55 81 11-4 10 3m-16 7 8-3 7 2m-13 7 9-2M57 64l3 11m11-12-1 11m10-4-3 7" fill="none" stroke="#a2633e" stroke-width="1.5" stroke-linecap="round"/>
    <path d="m51 104 25 0 3 15-30 0Z" fill="url(#${id}-metal)" stroke="#3c3024" stroke-width="2"/><path d="m54 109 19 0" stroke="#e8bc75" stroke-width="2"/>
    <g class="ember-mote" fill="#ffdb89"><path d="m24 23 3 6-2 7-3-6Z"/><path d="m105 30 4 7-3 6-2-7Z"/><circle cx="93" cy="16" r="2"/><circle cx="16" cy="83" r="1.8"/></g>
  </g>`,
  heal: id => `<g class="icon-art">
    <path d="M36 91C23 70 28 53 41 45l4-17 34-1 4 18c18 13 22 38 6 55-13 15-40 11-53-9Z" fill="#071a23" opacity=".8" transform="translate(2 3)"/>
    <g transform="rotate(9 64 66)">
      <path d="m47 24 1 23C25 59 28 91 46 102c11 7 25 7 36 0 20-13 19-42-3-55l1-23Z" fill="url(#${id}-glass)" stroke="#92b7ae" stroke-width="2"/>
      <path d="M39 70c13-7 24 8 48-1 7 12 4 24-8 31-9 5-22 6-32 0-12-8-15-18-8-30Z" fill="url(#${id}-liquid)" stroke="#df6870" stroke-width="1"/>
      <path d="M40 70c13-5 28 8 46-1" fill="none" stroke="#ffbe9b" stroke-width="2"/>
      <path d="m50 28 1 19C35 58 34 78 39 87M81 56c8 8 11 17 9 27" fill="none" stroke="#e0f5dc" stroke-width="3" stroke-linecap="round" opacity=".75"/>
      <path d="m54 21 0-10 19 0 0 11" fill="#ae7850" stroke="#5c4330" stroke-width="2"/><path d="m59 13 1 7m7-7-1 7" stroke="#e2b579" stroke-width="1.5"/>
      <path d="m43 23 40 0-1 9-39 0Z" fill="url(#${id}-bone)" stroke="#48402f" stroke-width="2"/><path d="m46 25 32 0" stroke="#f5e2ad" stroke-width="1.5"/>
      <path d="M78 34c10 4 7 14 12 17" fill="none" stroke="#e7b876" stroke-width="2"/>
      <path d="m87 48 10 4-3 16-12-5Z" fill="#bca276" stroke="#695331"/><path d="m87 57 5 2" stroke="#675239" stroke-width="2"/>
      <circle cx="67" cy="88" r="3" fill="#ffd0a1" opacity=".6"/><circle cx="53" cy="78" r="1.5" fill="#ffe1ac" opacity=".7"/>
    </g>
    <path d="m26 43 7-6m62 45 5 2m-4-56 4-4" stroke="#efaf86" stroke-width="2" stroke-linecap="round"/>
    <g class="ember-mote" fill="#ffd3ae"><circle cx="28" cy="89" r="2"/><path d="m97 26 2-4 2 4-2 3Z"/><circle cx="31" cy="29" r="1.5"/></g>
  </g>`,
};

const ELEMENT_PALETTES = {
  fire: ['#f8b265', '#a64420'],
  lightning: ['#9edbff', '#355d91'],
  water: ['#49cfff', '#266c85'],
};

function lightningWeapon(id, tier) {
  return `<g class="icon-art">
    <path d="M15 72 34 57 26 42 52 46 58 20 73 36 105 23 91 48 113 57 90 68 95 97 72 86 53 112 48 89 21 99 31 79Z" fill="#9180c6" opacity=".14"/>
    <path d="m22 78 16-20-8-9 26 4 4-26 13 20 28-15-14 24 18 5-21 13 9 18-23-6-16 20" fill="none" stroke="#a3dcff" stroke-width="2"/>
    <path d="m30 107 44-65" stroke="#1e2931" stroke-width="9" stroke-linecap="round"/>
    <path d="m30 107 44-65" stroke="url(#${id}-bone)" stroke-width="5" stroke-linecap="round"/>
    <path d="m41 88 5 4m-1-10 5 4m-1-10 5 4m-1-10 5 4" stroke="#4a3d51" stroke-width="3"/>
    ${tier > 1 ? `<path d="M74 40 63 25 58 40 46 53 57 59 74 48 76 64 93 68 98 47 83 43Z" fill="url(#${id}-blade)" stroke="#3b3d49" stroke-width="2"/><path d="m61 30 5 13-13 10m35 9 7-13-14-3" fill="none" stroke="#fef7c8" stroke-width="2"/>` : ''}
    <path d="m66 50 10-26 27-16-5 31-26 18Z" fill="url(#${id}-blade)" stroke="#38384a" stroke-width="2"/>
    <path d="m73 50 25-36-18 33Z" fill="#8189b3"/><path d="m72 43 24-28" stroke="#fff9d1" stroke-width="2"/>
    <path d="m61 56 6-9 15 10-5 8Z" fill="url(#${id}-bone)" stroke="#39353f" stroke-width="1.5"/>
    <path d="m85 27-5 16 10-4-14 23 3-17-9 3Z" fill="#eeffff"/>
    <path d="m31 42 6-10-1 8 9-1-9 11 1-8Zm52 48 7-9-1 8 7-2-8 11 1-8Z" fill="#dcf5ff"/>
    <g class="ember-mote" fill="#daefff"><circle cx="24" cy="63" r="2"/><path d="m54 19 3 5-3 5-3-5Z"/><circle cx="105" cy="83" r="1.8"/></g>
  </g>`;
}

function waterWeapon(id, tier) {
  return `<g class="icon-art">
    <path d="M15 80c5-30 29-25 43-46 13-19 34-19 49-4-20-8-29 1-33 15-6 24-33 23-40 40-4 9 6 17 16 15-23 9-40-2-35-20Z" fill="url(#${id}-cloak)" opacity=".7"/>
    <path d="M20 83c7-27 31-26 45-47M34 103c-13-8-8-19-2-26" stroke="#a5e6e7" stroke-width="1.7" stroke-linecap="round"/>
    <path d="m36 109 42-64" stroke="#1f3740" stroke-width="9" stroke-linecap="round"/><path d="m36 109 42-64" stroke="url(#${id}-bone)" stroke-width="5" stroke-linecap="round"/>
    <path d="m38 104 10-7-2-8 11-7-1-8 11-7" fill="none" stroke="#428d99" stroke-width="2.5"/>
    <path d="M75 64C53 56 61 37 68 22c-1 13 2 16 7 17-2-13 5-22 14-28-2 10-1 15 5 20 8 8 13 22 1 30Z" fill="url(#${id}-bone)" stroke="#344947" stroke-width="1.7"/>
    <path d="M78 53c-8-7-6-15 6-29 0 11 13 12 9 23-2 8-10 9-15 6Z" fill="url(#${id}-tide)" stroke="#bffbfa" stroke-width="1.4"/>
    <path d="M85 32c-8 10-9 13-5 16" fill="none" stroke="#f1ffff" stroke-width="2"/>
    <path d="m67 60 17 7-3 7-18-7Z" fill="url(#${id}-metal)" stroke="#90c7ba" stroke-width="1.5"/>
    ${tier > 1 ? `<path d="M62 42 49 29l1 19 12 8m32-20 16-8-6 20-9 7" fill="url(#${id}-blade)" stroke="#72afaf" stroke-width="2"/><path d="M51 35 56 47m49-13-7 11" stroke="#e1ffef" stroke-width="2"/><circle cx="80" cy="46" r="16" fill="none" stroke="#9eefe8" stroke-width="1" stroke-dasharray="4 5"/>` : ''}
    <path d="M17 63c-9 7-8 12-2 13 7 2 7-5 2-13Zm81 10c-8 9-8 14-1 15 8-1 5-8 1-15Z" fill="url(#${id}-tide)" stroke="#92e5e4" stroke-width="1"/>
    <g class="ember-mote" fill="#b9fff5"><circle cx="32" cy="54" r="2"/><circle cx="59" cy="25" r="1.5"/><path d="m83 92 3 5-3 4-3-4Z"/></g>
  </g>`;
}

function elementalBurst(id, element) {
  if (element === 'lightning') return `<g class="icon-art">
    <ellipse cx="64" cy="65" rx="45" ry="29" transform="rotate(-20 64 65)" fill="#776bb2" opacity=".2"/>
    <ellipse cx="64" cy="65" rx="45" ry="29" transform="rotate(-20 64 65)" stroke="#9edbff" stroke-width="2" stroke-dasharray="37 8 3 7"/>
    <path d="m68 6-27 41 17-3-8 25 33-39-19 4Z" fill="#e6f6ff" stroke="#b8956b" stroke-width="1"/>
    <path d="m25 22 12 14-7 3 15 16M109 32 94 45l7 8-20 10M11 70l19-4-6 9 20 1M101 87l-16-7 2 12-17-12" stroke="#d9f2ff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M44 104 45 87 38 72q-2-4 2-6t6 4l7 8-5-23q0-5 4-5t5 5l4 19 1-27q1-5 5-4t4 5l-1 27 7-22q1-4 5-3t3 6l-5 23 8-12q3-4 6-1t0 7L80 94l-3 17Z" fill="url(#${id}-hand)" stroke="#725841" stroke-width="1.8"/>
    <path d="m44 102 34 7-2 13-34-8Z" fill="url(#${id}-metal)" stroke="#d4c088" stroke-width="1.6"/><path d="m61 75 3 10 9-5" fill="none" stroke="#7d684d" stroke-width="1.5"/>
    <g class="ember-mote" fill="#eeffff"><path d="m15 38 3 5-3 4-3-4Zm92 25 3 5-3 4-3-4Z"/><circle cx="88" cy="16" r="2"/></g>
  </g>`;
  return `<g class="icon-art">
    <path d="M109 69c-4 27-41 46-68 25C19 77 30 50 47 49c-5-8-22-6-29 10 0-27 22-41 44-28 8 5 13 16 9 26 16-11 14-25 5-36 24 8 34 33 17 53 8 2 13-1 16-5Z" fill="url(#${id}-tide)" stroke="#71c5d0" stroke-width="1.7"/>
    <path d="M22 53c13-16 34-12 36 4-12-3-24 14-7 26 13 9 39 0 45-20" fill="none" stroke="#c5f8e7" stroke-width="3" stroke-linecap="round"/>
    <path d="M58 88c-7-10 8-21 11-29 3 11 18 15 15 25-3 11-21 14-26 4Z" fill="#92e5e6" opacity=".6"/>
    <path d="M58 108 56 91l-15-8q-4-3-2-6t6-1l13 5-5-18q-1-4 3-5t6 4l6 18 15-7 14-1q5 0 5 4t-5 5l-10 2-10 13-1 13Z" fill="url(#${id}-hand)" stroke="#5d7564" stroke-width="1.8"/>
    <path d="m54 105 25-1 2 15-28 0Z" fill="url(#${id}-metal)" stroke="#a7c0a4" stroke-width="1.5"/>
    <path d="M54 23C40 39 37 45 45 49c10 5 18-10 9-26Zm47 18c-4 7-7 10-3 13 6 4 8-4 3-13Z" fill="url(#${id}-tide)" stroke="#abf1ed" stroke-width="1.4"/>
    <g class="ember-mote" fill="#c5fff1"><circle cx="31" cy="24" r="2.3"/><circle cx="17" cy="77" r="2"/><circle cx="89" cy="16" r="1.6"/></g>
  </g>`;
}

export function skillIcon(kind, options = {}) {
  const { element = 'fire', tier = 1 } = typeof options === 'string' ? { element: options } : options;
  const id = `skill-art-${kind}-${serial++}`;
  const [accent, deep] = kind === 'heal' ? PALETTES.heal : ELEMENT_PALETTES[element] || ELEMENT_PALETTES.fire;
  let artwork = (art[kind] || art.attack)(id);
  if (kind === 'attack' && element === 'lightning') artwork = lightningWeapon(id, tier);
  if (kind === 'attack' && element === 'water') artwork = waterWeapon(id, tier);
  if (kind === 'burst' && element !== 'fire') artwork = elementalBurst(id, element);
  if (kind === 'attack' && element === 'fire' && tier > 1) artwork = artwork.replace('<path d="m43 75', `<path d="m43 74 36-55 23-12-4 28-39 54Z" fill="url(#${id}-blade)" stroke="#694a2b" stroke-width="3"/><path d="m60 69 26-37-18 41Z" fill="#d6773b"/><path d="m43 75`);
  if (kind === 'dash' && element !== 'water') {
    artwork = artwork.replaceAll('#72c3bd', accent).replaceAll('#92d9ce', accent).replaceAll('#b8f9d8', accent);
  }
  const crest = tier > 1 && kind === 'attack' ? `<path d="m89 103 3-5 3 5 6-1-3 5 4 4-6 1-1 6-4-4-5 3 1-6-5-3Z" fill="${accent}" stroke="#5d4733" stroke-width="1.2"/>` : '';
  return `<svg class="skill-illustration" viewBox="0 0 128 128" fill="none" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="${id}-metal" x1="26" y1="14" x2="95" y2="116" gradientUnits="userSpaceOnUse"><stop stop-color="#b6a486"/><stop offset=".22" stop-color="#55584a"/><stop offset=".5" stop-color="#25332f"/><stop offset=".72" stop-color="#796346"/><stop offset="1" stop-color="#171e1d"/></linearGradient>
      <radialGradient id="${id}-well"><stop stop-color="${deep}" stop-opacity=".7"/><stop offset=".58" stop-color="#1b2925"/><stop offset="1" stop-color="#071414"/></radialGradient>
      <linearGradient id="${id}-bone" x1="42" y1="16" x2="75" y2="116" gradientUnits="userSpaceOnUse"><stop stop-color="#f3e5be"/><stop offset=".45" stop-color="#bbaa7e"/><stop offset=".6" stop-color="#857455"/><stop offset="1" stop-color="#d7bd85"/></linearGradient>
      <linearGradient id="${id}-blade" x1="42" y1="31" x2="88" y2="93" gradientUnits="userSpaceOnUse"><stop stop-color="#fff4c5"/><stop offset=".4" stop-color="#d2d8c0"/><stop offset=".55" stop-color="#819c94"/><stop offset="1" stop-color="#416568"/></linearGradient>
      <linearGradient id="${id}-glow" x1="15" y1="92" x2="81" y2="13" gradientUnits="userSpaceOnUse"><stop stop-color="#bd421a" stop-opacity="0"/><stop offset=".6" stop-color="#f58a36"/><stop offset="1" stop-color="#ffde8c"/></linearGradient>
      <linearGradient id="${id}-cloak" x1="72" y1="44" x2="12" y2="83" gradientUnits="userSpaceOnUse"><stop stop-color="${accent}"/><stop offset=".43" stop-color="#448c8b"/><stop offset="1" stop-color="#244a53" stop-opacity=".05"/></linearGradient>
      <linearGradient id="${id}-fire" x1="64" y1="9" x2="64" y2="100" gradientUnits="userSpaceOnUse"><stop stop-color="#ffdc8b"/><stop offset=".48" stop-color="#ef973b"/><stop offset=".77" stop-color="#c94d20"/><stop offset="1" stop-color="#973126" stop-opacity=".15"/></linearGradient>
      <linearGradient id="${id}-hand" x1="62" y1="32" x2="62" y2="111" gradientUnits="userSpaceOnUse"><stop stop-color="#fff0bf"/><stop offset=".4" stop-color="#e3b575"/><stop offset="1" stop-color="#9a6744"/></linearGradient>
      <linearGradient id="${id}-glass" x1="32" y1="56" x2="96" y2="73" gradientUnits="userSpaceOnUse"><stop stop-color="#88b0a2" stop-opacity=".65"/><stop offset=".35" stop-color="#b6d6c0" stop-opacity=".2"/><stop offset=".76" stop-color="#16282d" stop-opacity=".8"/><stop offset="1" stop-color="#a6c3a7" stop-opacity=".6"/></linearGradient>
      <linearGradient id="${id}-liquid" x1="41" y1="65" x2="85" y2="106" gradientUnits="userSpaceOnUse"><stop stop-color="#fa826e"/><stop offset=".35" stop-color="#c93842"/><stop offset=".8" stop-color="#701d37"/><stop offset="1" stop-color="#b34447"/></linearGradient>
    <linearGradient id="${id}-tide" x1="35" y1="20" x2="85" y2="100" gradientUnits="userSpaceOnUse"><stop stop-color="#c8fff0"/><stop offset=".35" stop-color="#6ddcd6"/><stop offset=".7" stop-color="#267f9d"/><stop offset="1" stop-color="#233b69"/></linearGradient>
    </defs>${frame(id, accent)}${artwork}${crest}</svg>`;
}

export function utilityIcon(name) {
  const paths = {
    pause: '<path d="M7 5h3v14H7zm7 0h3v14h-3z" fill="currentColor" stroke="none"/>',
    sound: '<path d="m4 9 4 0 5-4v14l-5-4H4z"/><path d="M16 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14"/>',
    mute: '<path d="m4 9 4 0 5-4v14l-5-4H4z"/><path d="m17 9 5 6m0-6-5 6"/>',
    bag: '<path d="m7 7-3 13h16L17 7Zm1 0V5a4 4 0 0 1 8 0v2M9 12h6m-4-2v4"/>',
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.bag}</svg>`;
}

export function boonIcon(name) {
  const glyphs = {
    sword: '<path d="m8 24 18-19 1 7-14 17m-7-9 10 10M5 33l8-9m-9 6 5 5"/>',
    heart: '<path d="M20 32S5 24 5 14c0-10 12-11 15-2 3-9 15-8 15 2 0 10-15 18-15 18Z"/><path d="m10 19 5 0 3-7 4 15 3-8h6"/>',
    bolt: '<path d="M23 4 9 22h10l-3 14 16-21H22Z"/>',
    eye: '<path d="M3 20S10 9 20 9s17 11 17 11-7 11-17 11S3 20 3 20Z"/><circle cx="20" cy="20" r="5"/>',
    shield: '<path d="m20 4 14 6-2 14-12 12L8 24 6 10Z"/><path d="m20 10 0 18m-7-12 14 0"/>',
    flame: '<path d="M22 3c-9 12-4 13-10 18l-3-8C-2 35 34 39 33 21c-1-6-5-8-4-14-4 4-2 8-6 10-3-4 1-9-1-14Z"/>',
    wing: '<path d="M5 30C7 10 17 10 34 5c-4 10-11 18-24 23m-3-6 19-7m-9 11 7-6m-19 9-1 6"/>',
    drop: '<path d="M20 4C18 12 7 17 7 25a13 13 0 0 0 26 0c0-8-11-13-13-21Z"/><path d="M13 24c-1 5 2 8 6 8"/>',
    sun: '<circle cx="20" cy="20" r="8"/><path d="M20 2v5m0 26v5M2 20h5m26 0h5M7 7l4 4m18 18 4 4M7 33l4-4m18-18 4-4"/>',
    potion: '<path d="M15 5h10v10c12 7 13 22-5 22S3 22 15 15Zm-2 0h14v5H13Z"/><path d="M10 25c7-3 12 3 20 0"/>',
    thorn: '<path d="M8 35 29 5M15 24 5 20l12-1m5-8 0-8m0 18 11-3-7 9m-12 5-3-6"/>',
  };
  return `<svg class="boon-icon" viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${glyphs[name] || glyphs.flame}</svg>`;
}

/** Small etched symbols for the persistent camp interface. */
export function campIcon(name) {
  const paths = {
    camp: '<path d="M5 22 16 5l11 17M7 20h18M12 22l4-8 4 8M6 27l19-3M8 24l16 3"/>',
    armory: '<path d="m8 24 15-17 3-2-1 5-14 17M5 21l9 8M7 24l-3 4m0-3 3 3M20 20l6 7m-2-9 5 5M9 11 6 5l6 3 9 10"/>',
    bag: '<path d="M9 9 5 27h22L23 9ZM11 9V6a5 5 0 0 1 10 0v3M12 16h8m-4-4v8M8 23h16"/>',
    quest: '<path d="M7 5h15l3 3v19H7ZM11 11h9m-9 5h7m-7 5h5m7-16v6h5"/><path d="m19 24 2 2 5-5"/>',
    coin: '<circle cx="16" cy="16" r="12"/><circle cx="16" cy="16" r="9"/><path d="m16 8 5 8-5 8-5-8Z"/>',
    arrow: '<path d="M4 16h23m-8-8 8 8-8 8M6 13v6"/>',
    lock: '<path d="M9 14V9a7 7 0 0 1 14 0v5M7 14h18v14H7Z"/><circle cx="16" cy="20" r="2"/><path d="M16 22v3"/>',
    check: '<path d="m6 16 7 7L27 8"/>',
    plus: '<path d="M16 6v20M6 16h20"/>',
    help: '<circle cx="16" cy="16" r="12"/><path d="M12 12a4 4 0 0 1 8 0c0 3-4 3-4 6m0 5v.1"/>',
    shield: '<path d="m16 3 11 5-2 13-9 8-9-8L5 8Z"/><path d="M16 9v13m-5-9h10"/>',
    flame: '<path d="M17 3c-7 9-3 11-7 15l-3-7c-8 19 22 22 19 6-1-5-4-5-4-10-4 4-2 7-5 9-2-4 1-7 0-13Z"/>',
    heart: '<path d="M16 27S4 20 4 12c0-8 9-10 12-3 3-7 12-5 12 3 0 8-12 15-12 15Z"/><path d="m8 16 5 0 2-5 3 10 2-5h4"/>',
  };
  return `<svg class="camp-icon" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.camp}</svg>`;
}
