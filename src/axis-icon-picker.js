/**
 * Sidebar icon picker — same popover language as Tab Ancestry.
 */
(function (global) {
  const EMOJI_CATEGORIES = [
    {
      id: 'smileys',
      icon: 'face-smile',
      emojis:
        '😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😗 ☺️ 😚 😙 🥲 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 🤥 😌 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🤮 🤧 🥵 🥶 🥴 😵 🤯 🤠 🥳 🥸 😎 🤓 🧐 😕 😟 🙁 ☹️ 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬'
    },
    {
      id: 'nature',
      icon: 'sun',
      emojis:
        '🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🐔 🐧 🐦 🐤 🦆 🦅 🦉 🦇 🐺 🐗 🐴 🦄 🐝 🪱 🐛 🦋 🐌 🐞 🐜 🪰 🪲 🪳 🦟 🦗 🕷 🦂 🐢 🐍 🦎 🐙 🦑 🦐 🦞 🦀 🐡 🐠 🐟 🐬 🐳 🐋 🦈 🐊 🐅 🐆 🦓 🦍 🦧 🐘 🦛 🦏 🐪 🐫 🦒 🦘 🐃 🐂 🐄 🐎 🐖 🐏 🐑 🦙 🐐 🦌 🐕 🐩 🦮 🐕‍🦺 🐈 🐈‍⬛ 🐓 🦃 🦚 🦜 🦢 🦩 🕊 🐇 🦝 🦨 🦡 🦫 🦦 🦥 🐁 🐀 🐿 🦔 🌸 🌼 🌻 🌺 🌷 🌹 🪷 🌱 🌿 🍀 🍃 🍂 🍁 🌾 🌵 🌴 🌳 🌲 ☀️ 🌤 ⛅️ 🌥 ☁️ 🌦 🌧 ⛈ 🌩 🌨 ❄️ ☃️ ⛄️ 🌬 💨 🌪 🌫 🌈'
    },
    {
      id: 'food',
      icon: 'mug-hot',
      emojis:
        '🍎 🍏 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍈 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🍆 🥑 🥦 🥬 🥒 🌶 🫑 🌽 🥕 🫒 🧄 🧅 🥔 🍠 🥐 🥯 🍞 🥖 🥨 🧀 🥚 🍳 🧈 🥞 🧇 🥓 🥩 🍗 🍖 🦴 🌭 🍔 🍟 🍕 🫓 🥪 🥙 🧆 🌮 🌯 🫔 🥗 🥘 🫕 🍝 🍜 🍲 🍛 🍣 🍱 🥟 🦪 🍤 🍙 🍚 🍘 🍥 🥠 🥮 🍢 🍡 🍧 🍨 🍦 🥧 🧁 🍰 🎂 🍮 🍭 🍬 🍫 🍿 🍩 🍪 🌰 🥜 🍯 🥛 🍼 ☕️ 🫖 🍵 🧃 🥤 🧋 🍶 🍺 🍻 🥂 🍷 🥃 🍸 🍹 🧉 🍾 🧊 🥄 🍴 🍽 🥣 🥡 🧂'
    },
    {
      id: 'activity',
      icon: 'medal',
      emojis:
        '⚽️ 🏀 🏈 ⚾️ 🥎 🎾 🏐 🏉 🥏 🎱 🪀 🏓 🏸 🏒 🏑 🥍 🏏 🪃 🥅 ⛳️ 🪁 🏹 🎣 🤿 🥊 🥋 🎽 🛹 🛼 🛷 ⛸ 🥌 🎿 ⛷ 🏂 🪂 🏋️ 🤼 🤸 ⛹️ 🤺 🤾 🏌️ 🏇 🧘 🏄 🏊 🤽 🚣 🧗 🚵 🚴 🏆 🥇 🥈 🥉 🏅 🎖 🎗 🎫 🎟 🎪 🤹 🎭 🩰 🎨 🎬 🎤 🎧 🎼 🎹 🥁 🪘 🎷 🎺 🪗 🎸 🪕 🎻 🎲 ♟ 🎯 🎳 🎮 🎰 🧩'
    },
    {
      id: 'travel',
      icon: 'truck',
      emojis:
        '🚗 🚕 🚙 🚌 🚎 🏎 🚓 🚑 🚒 🚐 🛻 🚚 🚛 🚜 🦯 🦽 🦼 🛴 🚲 🛵 🏍 🛺 🚨 🚔 🚍 🚘 🚖 🚡 🚠 🚟 🚃 🚋 🚞 🚝 🚄 🚅 🚈 🚂 🚆 🚇 🚊 🚉 ✈️ 🛫 🛬 🛩 💺 🛰 🚀 🛸 🚁 🛶 ⛵️ 🚤 🛥 🛳 ⛴ 🚢 ⚓️ 🪝 ⛽️ 🚧 🚦 🚥 🗺 🗿 🗽 🗼 🏰 🏯 🏟 🎡 🎢 🎠 ⛲️ ⛱ 🏖 🏝 🏜 🌋 ⛰ 🏔 🗻 🏕 ⛺️ 🛖 🏠 🏡 🏘 🏚 🏗 🏭 🏢 🏬 🏣 🏤 🏥 🏦 🏨 🏪 🏫 🏩 💒 🏛 ⛪️ 🕌 🕍 🛕 🕋 ⛩ 🛤 🛣 🗾 🎑 🏞 🌅 🌄 🌠 🎇 🎆 🌇 🌆 🏙 🌃 🌉 🌌 🌁'
    },
    {
      id: 'objects',
      icon: 'gift',
      emojis:
        '⌚️ 📱 📲 💻 ⌨️ 🖥 🖨 🖱 🖲 🕹 💽 💾 💿 📀 📼 📷 📸 📹 🎥 📽 🎞 📞 ☎️ 📟 📠 📺 📻 🎙 🎚 🎛 🧭 ⏱ ⏲ ⏰ 🕰 ⌛️ ⏳ 📡 🔋 🔌 💡 🔦 🕯 🪔 🧯 🛢 💸 💵 💴 💶 💷 🪙 💰 💳 💎 ⚖️ 🪜 🧰 🪛 🔧 🔨 ⚒ 🛠 ⛏ 🪚 🔩 ⚙️ 🪤 🧱 ⛓ 🧲 🔫 💣 🧨 🪓 🔪 🗡 ⚔️ 🛡 🚬 ⚰️ 🪦 ⚱️ 🏺 🔮 📿 🧿 💈 ⚗️ 🔭 🔬 🕳 🩹 🩺 💊 💉 🩸 🧬 🦠 🧫 🧪 🌡 🧹 🪠 🧺 🧻 🚽 🚰 🚿 🛁 🛀 🧼 🪥 🪒 🧽 🪣 🧴 🛎 🔑 🗝 🚪 🪑 🛋 🛏 🛌 🧸 🪆 🖼 🪞 🪟 🛍 🛒 🎁 🎈 🎏 🎀 🪄 🪅 🎊 🎉 🎎 🏮 🎐 🧧 ✉️ 📩 📨 📧 💌 📥 📤 📦 🏷 🪧 📪 📫 📬 📭 📮 📯 📜 📃 📄 📑 🧾 📊 📈 📉 🗒 🗓 📆 📅 🗑 📇 🗃 🗳 🗄 📋 📁 📂 🗂 🗞 📰 📓 📔 📒 📕 📗 📘 📙 📚 📖 🔖 🧷 🔗 📎 🖇 📐 📏 🧮 📌 📍 ✂️ 🖊 🖋 ✒️ 🖌 🖍 📝 ✏️ 🔍 🔎 🔏 🔐 🔒 🔓'
    },
    {
      id: 'symbols',
      icon: 'heart',
      emojis:
        '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ☮️ ✝️ ☪️ 🕉 ☸️ ✡️ 🔯 🕎 ☯️ ☦️ 🛐 ⛎ ♈️ ♉️ ♊️ ♋️ ♌️ ♍️ ♎️ ♏️ ♐️ ♑️ ♒️ ♓️ 🆔 ⚛️ 🉑 ☢️ ☣️ 📴 📳 🈶 🈚️ 🈸 🈺 🈷️ ✴️ 🆚 💮 🉐 ㊙️ ㊗️ 🈴 🈵 🈹 🈲 🅰️ 🅱️ 🆎 🆑 🅾️ 🆘 ❌ ⭕️ 🛑 ⛔️ 📛 🚫 💯 💢 ♨️ 🚷 🚯 🚳 🚱 🔞 📵 🚭 ❗️ ❕ ❓ ❔ ‼️ ⁉️ 🔅 🔆 〽️ ⚠️ 🚸 🔱 ⚜️ 🔰 ♻️ ✅ 🈯️ 💹 ❇️ ✳️ ❎ 🌐 💠 Ⓜ️ 🌀 💤 🏧 🚾 ♿️ 🅿️ 🛗 🈳 🈂️ 🛂 🛃 🛄 🛅 🚹 🚺 🚼 ⚧ 🚻 🚮 🎦 📶 🈁 🔣 ℹ️ 🔤 🔡 🔠 🆖 🆗 🆙 🆒 🆕 🆓 0️⃣ 1️⃣ 2️⃣ 3️⃣ 4️⃣ 5️⃣ 6️⃣ 7️⃣ 8️⃣ 9️⃣ 🔟 🔢 #️⃣ *️⃣ ⏏️ ▶️ ⏸ ⏯ ⏹ ⏺ ⏭ ⏮ ⏩ ⏪ ⏫ ⏬ ◀️ 🔼 🔽 ➡️ ⬅️ ⬆️ ⬇️ ↗️ ↘️ ↙️ ↖️ ↕️ ↔️ ↪️ ↩️ ⤴️ ⤵️ 🔀 🔁 🔂 🔄 🔃 🎵 🎶 ➕ ➖ ➗ ✖️ 🟰 ♾ 💲 💱 ™️ ©️ ®️ 〰️ ➰ ➿ 🔚 🔙 🔛 🔝 🔜 ✔️ ☑️ 🔘 🔴 🟠 🟡 🟢 🔵 🟣 ⚫️ ⚪️ 🟤 🔺 🔻 🔸 🔹 🔶 🔷 🔳 🔲 ▪️ ▫️ ◾️ ◽️ ◼️ ◻️ 🟥 🟧 🟨 🟩 🟦 🟪 ⬛️ ⬜️ 🟫 🔈 🔇 🔉 🔊 🔔 🔕 📣 📢 👁‍🗨 💬 💭 🗯 ♠️ ♣️ ♥️ ♦️ 🃏 🎴 🀄️ 🕐 🕑 🕒 🕓 🕔 🕕 🕖 🕗 🕘 🕙 🕚 🕛'
    },
    {
      id: 'flags',
      icon: 'flag',
      emojis:
        '🏁 🚩 🎌 🏴 🏳 🏳️‍🌈 🏳️‍⚧️ 🏴‍☠️ 🇺🇸 🇬🇧 🇨🇦 🇦🇺 🇩🇪 🇫🇷 🇪🇸 🇮🇹 🇯🇵 🇰🇷 🇨🇳 🇮🇳 🇧🇷 🇲🇽 🇷🇺 🇺🇦 🇸🇦 🇦🇪 🇹🇷 🇵🇰 🇮🇩 🇵🇭 🇻🇳 🇹🇭 🇸🇬 🇲🇾 🇳🇿 🇿🇦 🇪🇬 🇳🇬 🇰🇪 🇦🇷 🇨🇱 🇨🇴 🇵🇪 🇵🇱 🇳🇱 🇧🇪 🇨🇭 🇦🇹 🇸🇪 🇳🇴 🇩🇰 🇫🇮 🇮🇪 🇵🇹 🇬🇷 🇮🇱 🇭🇰 🇹🇼'
    }
  ];

  const FA_ICONS = [
    'star', 'bookmark', 'heart', 'flag', 'bolt', 'triangle-exclamation', 'asterisk', 'bell',
    'folder', 'calendar', 'envelope', 'terminal', 'hammer', 'sun', 'moon', 'globe',
    'dumbbell', 'plane', 'music', 'palette', 'video', 'bandage', 'code', 'pizza-slice',
    'skull', 'thumbs-up', 'house', 'briefcase', 'graduation-cap', 'gamepad', 'rocket', 'leaf',
    'car', 'bicycle', 'camera', 'book', 'pen', 'gift', 'key', 'lock',
    'fire', 'cloud', 'snowflake', 'seedling', 'paw', 'fish', 'cat', 'dog',
    'apple-whole', 'mug-hot', 'utensils', 'cake-candles', 'martini-glass', 'football', 'basketball', 'chess',
    'layer-group', 'gear', 'wrench', 'shield-halved', 'cart-shopping', 'flask', 'microphone', 'headphones'
  ];

  function splitEmojis(str) {
    return String(str || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
  }

  function t(key, fallback) {
    try {
      const v = global.AxisI18n?.t?.(key);
      if (v && v !== key) return v;
    } catch (_) {}
    return fallback || key;
  }

  const CATEGORY_LOOKUP = Object.fromEntries(
    EMOJI_CATEGORIES.map((c) => [c.id, { ...c, list: splitEmojis(c.emojis) }])
  );

  class AxisIconPicker {
    constructor() {
      this.el = null;
      this.backdrop = null;
      this.onSelect = null;
      this.activeTab = 'emoji';
      this.activeCategory = EMOJI_CATEGORIES[0].id;
      this._outsideHandler = null;
      this._keyHandler = null;
      this._closeTimer = null;
      this._scrollFadeBound = false;
    }

    ensure() {
      if (this.el) return this.el;

      const backdrop = document.createElement('div');
      backdrop.id = 'axis-icon-picker-backdrop';
      backdrop.className = 'tab-ancestry-backdrop hidden';
      backdrop.setAttribute('aria-hidden', 'true');
      backdrop.addEventListener('click', () => this.close());
      document.body.appendChild(backdrop);
      this.backdrop = backdrop;

      const root = document.createElement('div');
      root.id = 'axis-icon-picker';
      root.className = 'axis-icon-picker tab-ancestry-panel hidden';
      root.setAttribute('role', 'dialog');
      root.setAttribute('aria-label', t('iconPicker.title', 'Choose icon'));
      root.innerHTML = `
        <div class="tab-ancestry-arrow axis-icon-picker-arrow" aria-hidden="true"></div>
        <div class="tab-ancestry-card axis-icon-picker-card">
          <div class="tab-ancestry-header axis-icon-picker-header">
            <h3 class="tab-ancestry-heading axis-icon-picker-heading" data-i18n="iconPicker.title">Choose icon</h3>
            <div class="axis-icon-picker-tabs" role="tablist">
              <button type="button" class="axis-icon-picker-tab is-active" data-tab="emoji" role="tab" aria-selected="true" data-i18n="iconPicker.emoji">Emoji</button>
              <button type="button" class="axis-icon-picker-tab" data-tab="icon" role="tab" aria-selected="false" data-i18n="iconPicker.icon">Icon</button>
            </div>
          </div>
          <div class="axis-icon-picker-body">
            <div class="axis-icon-picker-emoji-pane">
              <div class="axis-icon-picker-grid axis-icon-picker-emoji-grid"></div>
            </div>
            <div class="axis-icon-picker-icon-pane hidden">
              <div class="axis-icon-picker-grid axis-icon-picker-fa-grid"></div>
            </div>
            <div class="axis-icon-picker-categories"></div>
          </div>
        </div>
      `;
      document.body.appendChild(root);
      this.el = root;
      this.bind();
      this.renderFaGrid();
      return root;
    }

    bind() {
      this.el.querySelectorAll('.axis-icon-picker-tab').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.setTab(btn.dataset.tab || 'emoji');
        });
      });

      this.el.querySelector('.axis-icon-picker-emoji-grid')?.addEventListener('click', (e) => {
        const cell = e.target.closest('.axis-icon-picker-cell');
        if (!cell?.dataset.emoji) return;
        e.stopPropagation();
        this.pick(cell.dataset.emoji, 'emoji');
      });

      this.el.querySelector('.axis-icon-picker-fa-grid')?.addEventListener('click', (e) => {
        const cell = e.target.closest('.axis-icon-picker-cell');
        if (!cell?.dataset.icon) return;
        e.stopPropagation();
        this.pick(`fa-${cell.dataset.icon}`, 'fa');
      });
    }

    syncTheme() {
      if (!this.el) return;
      const light =
        document.documentElement.getAttribute('data-ui-theme') === 'light' ||
        document.body.classList.contains('light-theme');
      const theme = light ? 'light' : 'dark';
      this.el.setAttribute('data-ui-theme', theme);
    }

    applyLabels() {
      if (!this.el) return;
      const heading = this.el.querySelector('.axis-icon-picker-heading');
      if (heading) heading.textContent = t('iconPicker.title', 'Choose icon');
      this.el.querySelectorAll('.axis-icon-picker-tab').forEach((btn) => {
        const key = btn.dataset.tab === 'icon' ? 'iconPicker.icon' : 'iconPicker.emoji';
        btn.textContent = t(key, btn.dataset.tab === 'icon' ? 'Icon' : 'Emoji');
      });
      this.el.setAttribute('aria-label', t('iconPicker.title', 'Choose icon'));
      try {
        global.AxisI18n?.applyToDom?.(this.el);
      } catch (_) {}
    }

    setTab(tab) {
      this.activeTab = tab === 'icon' ? 'icon' : 'emoji';
      this.el.querySelectorAll('.axis-icon-picker-tab').forEach((btn) => {
        const on = btn.dataset.tab === this.activeTab;
        btn.classList.toggle('is-active', on);
        btn.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      this.el.querySelector('.axis-icon-picker-emoji-pane')?.classList.toggle('hidden', this.activeTab !== 'emoji');
      this.el.querySelector('.axis-icon-picker-icon-pane')?.classList.toggle('hidden', this.activeTab !== 'icon');
      const cats = this.el.querySelector('.axis-icon-picker-categories');
      if (cats) cats.classList.toggle('hidden', this.activeTab !== 'emoji');
      this._updateScrollFade();
    }

    _getActiveScrollEl() {
      if (!this.el) return null;
      if (this.activeTab === 'icon') {
        return this.el.querySelector('.axis-icon-picker-fa-grid');
      }
      return this.el.querySelector('.axis-icon-picker-emoji-grid');
    }

    _updateScrollFade() {
      const scrollEl = this._getActiveScrollEl();
      if (!this.el || !scrollEl) return;
      this.el.classList.toggle('is-scrolled', scrollEl.scrollTop > 1);
    }

    _bindScrollFade() {
      if (this._scrollFadeBound) return;
      const handler = () => this._updateScrollFade();
      this.el?.querySelector('.axis-icon-picker-emoji-grid')?.addEventListener('scroll', handler, {
        passive: true
      });
      this.el?.querySelector('.axis-icon-picker-fa-grid')?.addEventListener('scroll', handler, {
        passive: true
      });
      this._scrollFadeBound = true;
    }

    _resetScroll() {
      this.el?.querySelector('.axis-icon-picker-emoji-grid')?.scrollTo?.(0, 0);
      this.el?.querySelector('.axis-icon-picker-fa-grid')?.scrollTo?.(0, 0);
      this.el?.classList.remove('is-scrolled');
    }

    renderCategories() {
      const wrap = this.el.querySelector('.axis-icon-picker-categories');
      if (!wrap) return;
      wrap.innerHTML = EMOJI_CATEGORIES.map(
        (c) =>
          `<button type="button" class="axis-icon-picker-category${c.id === this.activeCategory ? ' is-active' : ''}" data-category="${c.id}" title="${c.id}" aria-label="${c.id}">
            <i class="fas fa-${c.icon}" aria-hidden="true"></i>
          </button>`
      ).join('');
      wrap.querySelectorAll('.axis-icon-picker-category').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.activeCategory = btn.dataset.category || EMOJI_CATEGORIES[0].id;
          this.renderCategories();
          this.renderEmojiGrid();
        });
      });
    }

    renderEmojiGrid() {
      const grid = this.el.querySelector('.axis-icon-picker-emoji-grid');
      if (!grid) return;
      const items = CATEGORY_LOOKUP[this.activeCategory]?.list || [];
      grid.innerHTML = items
        .map((em) => `<button type="button" class="axis-icon-picker-cell" data-emoji="${em}" aria-label="Emoji">${em}</button>`)
        .join('');
    }

    renderFaGrid() {
      const grid = this.el.querySelector('.axis-icon-picker-fa-grid');
      if (!grid) return;
      grid.innerHTML = FA_ICONS.map(
        (id) =>
          `<button type="button" class="axis-icon-picker-cell axis-icon-picker-cell--fa" data-icon="${id}" aria-label="${id.replace(/-/g, ' ')}">
            <i class="fas fa-${id}" aria-hidden="true"></i>
          </button>`
      ).join('');
    }

    position(anchorRect) {
      const panel = this.el;
      const arrow = panel?.querySelector('.axis-icon-picker-arrow');
      if (!panel) return;

      const inset = 8;
      const viewportH = window.innerHeight || document.documentElement.clientHeight;
      const sidebar = document.getElementById('sidebar');
      const sideRect = sidebar?.getBoundingClientRect?.();
      const sideLeft = sideRect ? sideRect.left + inset : inset;
      const sideRight = sideRect ? sideRect.right - inset : (window.innerWidth || 320) - inset;
      const maxW = Math.max(180, sideRight - sideLeft);
      const panelW = Math.min(248, maxW);

      let anchorX;
      let top;
      if (anchorRect && anchorRect.width > 0) {
        anchorX = anchorRect.left + anchorRect.width / 2;
        top = anchorRect.bottom + 2;
      } else if (anchorRect && Number.isFinite(anchorRect.left)) {
        anchorX = anchorRect.left;
        top = (anchorRect.bottom || anchorRect.top || 80) + 6;
      } else if (sideRect) {
        anchorX = sideRect.left + sideRect.width / 2;
        top = Math.max(inset, sideRect.top + 80);
      } else {
        anchorX = panelW / 2 + inset;
        top = 80;
      }

      let left = anchorX - panelW / 2;
      left = Math.max(sideLeft, Math.min(left, sideRight - panelW));
      const maxTop = Math.max(inset, viewportH - 140);
      top = Math.max(inset, Math.min(top, maxTop));

      panel.style.width = `${panelW}px`;
      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
      if (arrow) {
        const arrowX = Math.max(14, Math.min(anchorX - left, panelW - 14));
        arrow.style.left = `${arrowX}px`;
        arrow.style.marginLeft = '-7px';
        panel.style.transformOrigin = `${arrowX}px 0`;
        panel.style.setProperty('--ta-arrow-x', `${arrowX}px`);
      }
    }

    attachDismissHandlers() {
      this.detachDismissHandlers();
      this._keyHandler = (e) => {
        if (e.key === 'Escape') this.close();
      };
      setTimeout(() => {
        document.addEventListener('keydown', this._keyHandler, true);
      }, 0);
    }

    detachDismissHandlers() {
      if (this._keyHandler) {
        document.removeEventListener('keydown', this._keyHandler, true);
        this._keyHandler = null;
      }
    }

    open({ anchorRect, onSelect } = {}) {
      this.ensure();
      this._bindScrollFade();
      if (this._closeTimer) {
        clearTimeout(this._closeTimer);
        this._closeTimer = null;
      }
      this.onSelect = typeof onSelect === 'function' ? onSelect : null;
      this.activeTab = 'emoji';
      this.activeCategory = EMOJI_CATEGORIES[0].id;

      this.syncTheme();
      this.applyLabels();
      this.setTab('emoji');
      this.renderCategories();
      this.renderEmojiGrid();
      this._resetScroll();

      this.el.classList.remove('hidden', 'is-closing', 'is-open', 'is-scrolled');
      this.backdrop?.classList.remove('hidden');
      this.backdrop?.setAttribute('aria-hidden', 'false');
      this.position(anchorRect);
      void this.el.offsetWidth;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this.el.classList.add('is-open');
        });
      });
      this.attachDismissHandlers();
    }

    close() {
      if (!this.el) return;
      if (this.el.classList.contains('hidden')) {
        this.backdrop?.classList.add('hidden');
        this.backdrop?.setAttribute('aria-hidden', 'true');
        this.onSelect = null;
        return;
      }
      if (this.el.classList.contains('is-closing')) return;

      if (this._closeTimer) {
        clearTimeout(this._closeTimer);
        this._closeTimer = null;
      }

      this.detachDismissHandlers();
      this.el.classList.remove('is-open');
      this.el.classList.add('is-closing');
      this.backdrop?.classList.add('hidden');
      this.backdrop?.setAttribute('aria-hidden', 'true');

      const finish = () => {
        this.el.classList.remove('is-closing', 'is-open', 'is-scrolled');
        this.el.classList.add('hidden');
        this.onSelect = null;
        this._closeTimer = null;
      };

      const onEnd = (e) => {
        if (e.target !== this.el || (e.propertyName !== 'opacity' && e.propertyName !== 'transform')) {
          return;
        }
        this.el.removeEventListener('transitionend', onEnd);
        finish();
      };
      this.el.addEventListener('transitionend', onEnd);
      this._closeTimer = setTimeout(() => {
        this.el.removeEventListener('transitionend', onEnd);
        finish();
      }, 160);
    }

    pick(value, type) {
      const cb = this.onSelect;
      this.close();
      if (cb && value) cb({ value, type });
    }
  }

  global.AXIS_ICON_PICKER = new AxisIconPicker();
  global.AXIS_ICON_PICKER_DATA = { EMOJI_CATEGORIES, FA_ICONS };
})(typeof window !== 'undefined' ? window : global);
