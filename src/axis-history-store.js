'use strict';

/** Max browsing history entries kept per profile (import + day-to-day browsing). */
const AXIS_PROFILE_HISTORY_MAX = 10000;

function trimProfileHistoryItems(items, max = AXIS_PROFILE_HISTORY_MAX) {
  if (!Array.isArray(items)) return [];
  if (items.length <= max) return items;
  return items.slice(0, max);
}

module.exports = {
  AXIS_PROFILE_HISTORY_MAX,
  trimProfileHistoryItems
};
