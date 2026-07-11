/**
 * macOS-style Emoji + Icon picker popover (tabs, tab groups, favorites).
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

  const CATEGORY_LOOKUP = Object.fromEntries(
    EMOJI_CATEGORIES.map((c) => [c.id, { ...c, list: splitEmojis(c.emojis) }])
  );

  class AxisIconPicker {
    constructor() {
      this.el = null;
      this.onSelect = null;
      this.activeTab = 'emoji';
      this.activeCategory = EMOJI_CATEGORIES[0].id;
      this._outsideHandler = null;
      this._keyHandler = null;
    }

    ensure() {
      if (this.el) return this.el;

      const root = document.createElement('div');
      root.id = 'axis-icon-picker';
      root.className = 'axis-icon-picker hidden';
      root.setAttribute('role', 'dialog');
      root.setAttribute('aria-label', 'Choose icon');
      root.innerHTML = `
        <div class="axis-icon-picker-panel">
          <div class="axis-icon-picker-segments" role="tablist">
            <button type="button" class="axis-icon-picker-segment is-active" data-tab="emoji" role="tab" aria-selected="true">Emoji</button>
            <button type="button" class="axis-icon-picker-segment" data-tab="icon" role="tab" aria-selected="false">Icon</button>
          </div>
          <div class="axis-icon-picker-emoji-pane">
            <div class="axis-icon-picker-grid axis-icon-picker-emoji-grid"></div>
            <div class="axis-icon-picker-categories"></div>
          </div>
          <div class="axis-icon-picker-icon-pane hidden">
            <div class="axis-icon-picker-grid axis-icon-picker-fa-grid"></div>
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
      this.el.querySelectorAll('.axis-icon-picker-segment').forEach((btn) => {
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

    setTab(tab) {
      this.activeTab = tab === 'icon' ? 'icon' : 'emoji';
      this.el.querySelectorAll('.axis-icon-picker-segment').forEach((btn) => {
        const on = btn.dataset.tab === this.activeTab;
        btn.classList.toggle('is-active', on);
        btn.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      this.el.querySelector('.axis-icon-picker-emoji-pane')?.classList.toggle('hidden', this.activeTab !== 'emoji');
      this.el.querySelector('.axis-icon-picker-icon-pane')?.classList.toggle('hidden', this.activeTab !== 'icon');
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
      const panel = this.el.querySelector('.axis-icon-picker-panel');
      if (!panel) return;

      const w = panel.offsetWidth || 320;
      const h = panel.offsetHeight || 360;
      const pad = 10;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      let left = anchorRect ? anchorRect.left : (vw - w) / 2;
      let top = anchorRect ? anchorRect.bottom + 8 : (vh - h) / 2;

      if (left + w + pad > vw) left = vw - w - pad;
      if (left < pad) left = pad;
      if (top + h + pad > vh) {
        top = anchorRect ? anchorRect.top - h - 8 : vh - h - pad;
      }
      if (top < pad) top = pad;

      this.el.style.left = `${Math.round(left)}px`;
      this.el.style.top = `${Math.round(top)}px`;
    }

    attachDismissHandlers() {
      this.detachDismissHandlers();
      this._outsideHandler = (e) => {
        if (this.el?.contains(e.target)) return;
        this.close();
      };
      this._keyHandler = (e) => {
        if (e.key === 'Escape') this.close();
      };
      setTimeout(() => {
        document.addEventListener('mousedown', this._outsideHandler, true);
        document.addEventListener('keydown', this._keyHandler, true);
      }, 0);
    }

    detachDismissHandlers() {
      if (this._outsideHandler) {
        document.removeEventListener('mousedown', this._outsideHandler, true);
        this._outsideHandler = null;
      }
      if (this._keyHandler) {
        document.removeEventListener('keydown', this._keyHandler, true);
        this._keyHandler = null;
      }
    }

    open({ anchorRect, onSelect } = {}) {
      this.ensure();
      this.onSelect = typeof onSelect === 'function' ? onSelect : null;
      this.activeTab = 'emoji';
      this.activeCategory = EMOJI_CATEGORIES[0].id;

      this.setTab('emoji');
      this.renderCategories();
      this.renderEmojiGrid();

      this.el.classList.remove('hidden');
      this.el.style.display = 'block';
      this.position(anchorRect);
      requestAnimationFrame(() => {
        this.el.classList.add('is-open');
      });
      this.attachDismissHandlers();
    }

    close() {
      if (!this.el) return;
      this.el.classList.remove('is-open');
      this.el.classList.add('hidden');
      this.el.style.display = 'none';
      this.onSelect = null;
      this.detachDismissHandlers();
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
