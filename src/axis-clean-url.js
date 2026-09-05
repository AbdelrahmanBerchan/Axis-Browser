'use strict';

/**
 * Strip common tracking / analytics query params from http(s) URLs when copying.
 * Pure helper — used by the shell and security unit tests.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.AxisCleanUrl = api;
  if (typeof globalThis !== 'undefined') globalThis.AxisCleanUrl = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  /** Exact query keys (case-insensitive). */
  const EXACT = new Set(
    [
      'fbclid',
      'gclid',
      'gclsrc',
      'dclid',
      'gbraid',
      'wbraid',
      'msclkid',
      'twclid',
      'li_fat_id',
      'mc_eid',
      'mc_cid',
      'igshid',
      'igsh',
      'si',
      'feature',
      'pp',
      'ref_src',
      'ref_url',
      'mkt_tok',
      'vero_id',
      'yclid',
      'ymclid',
      'ysclid',
      'spm',
      'scm',
      'ncid',
      'nr_email_referer',
      'hash',
      'pk_campaign',
      'pk_kwd',
      'pk_source',
      'pk_medium',
      'mtm_campaign',
      'mtm_kwd',
      'mtm_source',
      'mtm_medium',
      'mtm_content',
      'mtm_cid',
      'mtm_group',
      'mtm_placement',
      'oly_anon_id',
      'oly_enc_id',
      '__hssc',
      '__hstc',
      '__hsfp',
      '_hsenc',
      '_hsmi',
      'hsa_cam',
      'hsa_grp',
      'hsa_mt',
      'hsa_src',
      'hsa_ad',
      'hsa_acc',
      'hsa_net',
      'hsa_kw',
      'hsa_tgt',
      'hsa_ver',
      's_kwcid',
      'sscid',
      'icid',
      'zanpid',
      'guccounter',
      'guce_referrer',
      'guce_referrer_sig',
      'spReportId',
      'spJobID',
      'spUserID',
      'spMailingID',
      'spm_id_from',
      'from_spm_id',
      'share_source',
      'share_medium',
      'share_campaign',
      'share_id',
      'tt_medium',
      'tt_content',
      'trk',
      'trkCampaign',
      'sc_campaign',
      'sc_channel',
      'sc_content',
      'sc_medium',
      'sc_outcome',
      'sc_geo',
      'sc_country'
    ].map((s) => s.toLowerCase())
  );

  /** Prefixes (case-insensitive), e.g. utm_source. */
  const PREFIXES = [
    'utm_',
    'mtm_',
    'pk_',
    'mc_',
    'mkt_',
    'ga_',
    'hsa_',
    'vero_',
    'yclid',
    'spm_',
    'scm_',
    'oly_',
    '__hs',
    '_hs',
    'ns_',
    'cm_',
    'sms_',
    'at_',
    'campaign_',
    'ad_',
    'aff_',
    'ref_'
  ];

  function isTrackingParam(name) {
    const key = String(name || '').toLowerCase();
    if (!key) return false;
    if (EXACT.has(key)) return true;
    // _ga / _gl analytics
    if (key === '_ga' || key === '_gl' || key.startsWith('_ga_')) return true;
    return PREFIXES.some((p) => key.startsWith(p));
  }

  /**
   * @param {string} input
   * @returns {string} cleaned URL, or original input if not a cleanable http(s) URL
   */
  function stripTrackingParams(input) {
    if (!input || typeof input !== 'string') return input;
    const raw = input.trim();
    if (!raw) return input;
    let u;
    try {
      u = new URL(raw);
    } catch (_) {
      return input;
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return input;
    if (![...u.searchParams.keys()].length) return u.toString();

    const kept = [];
    for (const [k, v] of u.searchParams.entries()) {
      if (!isTrackingParam(k)) kept.push([k, v]);
    }
    // Rebuild search to drop empty `?` when nothing left.
    u.search = '';
    for (const [k, v] of kept) u.searchParams.append(k, v);
    return u.toString();
  }

  return {
    isTrackingParam,
    stripTrackingParams
  };
});
