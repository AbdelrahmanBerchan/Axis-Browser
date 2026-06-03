'use strict';

/** Font Awesome icon ids allowed for profile avatars (fa-solid names without fa- prefix). */
const AXIS_PROFILE_ICON_IDS = new Set([
  'user',
  'briefcase',
  'house',
  'graduation-cap',
  'gamepad',
  'code',
  'heart',
  'star',
  'rocket',
  'palette',
  'music',
  'cart-shopping',
  'plane',
  'shield-halved',
  'leaf',
  'flask'
]);

const AXIS_PROFILE_ICON_OPTIONS = [
  { id: 'user', label: 'Person' },
  { id: 'briefcase', label: 'Work' },
  { id: 'house', label: 'Home' },
  { id: 'graduation-cap', label: 'School' },
  { id: 'gamepad', label: 'Games' },
  { id: 'code', label: 'Dev' },
  { id: 'heart', label: 'Personal' },
  { id: 'star', label: 'Favorites' },
  { id: 'rocket', label: 'Projects' },
  { id: 'palette', label: 'Creative' },
  { id: 'music', label: 'Music' },
  { id: 'cart-shopping', label: 'Shopping' },
  { id: 'plane', label: 'Travel' },
  { id: 'shield-halved', label: 'Secure' },
  { id: 'leaf', label: 'Life' },
  { id: 'flask', label: 'Science' }
];

function sanitizeProfileIcon(raw) {
  const id = String(raw || 'user')
    .trim()
    .toLowerCase()
    .replace(/^fa-/, '');
  return AXIS_PROFILE_ICON_IDS.has(id) ? id : 'user';
}

function profileIconFaClass(iconId) {
  return `fa-${sanitizeProfileIcon(iconId)}`;
}

const exportsObj = {
  AXIS_PROFILE_ICON_IDS,
  AXIS_PROFILE_ICON_OPTIONS,
  sanitizeProfileIcon,
  profileIconFaClass
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = exportsObj;
}
if (typeof window !== 'undefined') {
  window.AXIS_PROFILE_ICONS = exportsObj;
}
