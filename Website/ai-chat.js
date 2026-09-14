/**
 * Screen Armors floating AI chat widget (static site frontend).
 * Talks to POST /api/chat. Conversational estimate leads via server tool + Resend.
 * No React / Jobber / visible lead form / uploads.
 */
(function () {
  if (window.__SA_AI_CHAT_BOOTED) return;
  window.__SA_AI_CHAT_BOOTED = true;

  var STORAGE_HISTORY = "sa-ai-chat-history";
  var STORAGE_OPEN = "sa-ai-chat-open";
  var STORAGE_LEAD = "sa-ai-chat-lead-submitted";
  var STORAGE_WELCOME = "sa-ai-chat-welcome-dismissed";
  var MAX_HISTORY = 12;
  var API_URL = "/api/chat";
  var GREETING =
    "Hi! \uD83D\uDC4B Welcome to Screen Armors.\nI'm the Screen Armors virtual assistant. I can answer questions about your screen project, help you choose the right service, and help you request an estimate with our team.";
  var FALLBACK =
    "Sorry — I couldn't reply just now. Please try again in a moment, or call Screen Armors at (941) 404-9699.";

  var QUICK_ACTIONS = [
    { id: "estimate", label: "Get an Estimate", message: "I'd like to request an estimate." },
    { id: "repair", label: "Screen Repair", message: "I need help with screen repair." },
    { id: "rescreen", label: "Full Rescreen", message: "I'm interested in a full rescreen." },
    { id: "enclosure", label: "New Enclosure", message: "I'm interested in a new screen enclosure." },
    { id: "ask", label: "Ask a Question", message: null },
  ];

  var state = {
    history: [],
    open: false,
    sending: false,
    leadSubmitted: false,
    welcomeDismissed: false,
  };

  var els = {};

  function safeJsonParse(raw) {
    try {
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function loadSession() {
    var storedHistory = safeJsonParse(sessionStorage.getItem(STORAGE_HISTORY) || "");
    if (Array.isArray(storedHistory)) {
      state.history = storedHistory
        .filter(function (m) {
          return (
            m &&
            (m.role === "user" || m.role === "assistant") &&
            typeof m.content === "string" &&
            m.content.trim()
          );
        })
        .map(function (m) {
          var entry = { role: m.role, content: String(m.content).trim() };
          var links = sanitizeLinks(m.links);
          if (links.length) entry.links = links;
          return entry;
        })
        .slice(-MAX_HISTORY);
    }

    if (!state.history.length) {
      state.history = [{ role: "assistant", content: GREETING }];
    }

    state.open = sessionStorage.getItem(STORAGE_OPEN) === "1";
    state.leadSubmitted = sessionStorage.getItem(STORAGE_LEAD) === "1";
    state.welcomeDismissed = sessionStorage.getItem(STORAGE_WELCOME) === "1";
  }

  function sanitizeLinks(raw) {
    if (!Array.isArray(raw)) return [];
    var out = [];
    for (var i = 0; i < raw.length && out.length < 2; i++) {
      var item = raw[i];
      if (!item || typeof item !== "object") continue;
      var href = String(item.href || "").trim();
      var label = String(item.label || "").trim();
      if (!label || !href) continue;
      // Internal paths only — never protocols or protocol-relative URLs
      if (href.charAt(0) !== "/") continue;
      if (href.indexOf("//") !== -1) continue;
      if (/^[a-z]+:/i.test(href)) continue;
      out.push({ label: label.slice(0, 80), href: href.slice(0, 200) });
    }
    return out;
  }

  function persistSession() {
    try {
      sessionStorage.setItem(STORAGE_HISTORY, JSON.stringify(state.history.slice(-MAX_HISTORY)));
      sessionStorage.setItem(STORAGE_OPEN, state.open ? "1" : "0");
      sessionStorage.setItem(STORAGE_LEAD, state.leadSubmitted ? "1" : "0");
      sessionStorage.setItem(STORAGE_WELCOME, state.welcomeDismissed ? "1" : "0");
    } catch (e) {
      /* private mode / quota — ignore */
    }
  }

  function historyForApi() {
    return state.history.slice(-MAX_HISTORY).map(function (m) {
      return { role: m.role, content: m.content };
    });
  }

  function hasUserMessage() {
    for (var i = 0; i < state.history.length; i++) {
      if (state.history[i].role === "user") return true;
    }
    return false;
  }

  function createEl(tag, className, attrs) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        if (key === "text") el.textContent = attrs[key];
        else el.setAttribute(key, attrs[key]);
      });
    }
    return el;
  }

  function iconChat() {
    return (
      '<svg class="sa-ai-chat__launcher-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<path fill="currentColor" d="M4.5 4.75A2.75 2.75 0 0 1 7.25 2h9.5A2.75 2.75 0 0 1 19.5 4.75v8.5A2.75 2.75 0 0 1 16.75 16H9.06l-3.4 2.72a.9.9 0 0 1-1.41-.75V16A2.75 2.75 0 0 1 4.5 13.25v-8.5Zm2.75-.75c-.69 0-1.25.56-1.25 1.25v8.5c0 .69.56 1.25 1.25 1.25h.75v1.56l1.94-1.55a.75.75 0 0 1 .47-.16h7.54c.69 0 1.25-.56 1.25-1.25v-8.5c0-.69-.56-1.25-1.25-1.25h-9.5Z"/>' +
      '<path fill="currentColor" d="M8 7.25h8a.75.75 0 0 1 0 1.5H8a.75.75 0 0 1 0-1.5Zm0 3.5h5.5a.75.75 0 0 1 0 1.5H8a.75.75 0 0 1 0-1.5Z"/>' +
      "</svg>"
    );
  }

  function iconClose() {
    return (
      '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<path fill="currentColor" d="M6.7 6.7a1 1 0 0 1 1.4 0L12 10.6l3.9-3.9a1 1 0 1 1 1.4 1.4L13.4 12l3.9 3.9a1 1 0 1 1-1.4 1.4L12 13.4l-3.9 3.9a1 1 0 1 1-1.4-1.4L10.6 12 6.7 8.1a1 1 0 0 1 0-1.4Z"/>' +
      "</svg>"
    );
  }

  function iconWelcomeDismiss() {
    return (
      '<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<path fill="currentColor" d="M6.7 6.7a1 1 0 0 1 1.4 0L12 10.6l3.9-3.9a1 1 0 1 1 1.4 1.4L13.4 12l3.9 3.9a1 1 0 1 1-1.4 1.4L12 13.4l-3.9 3.9a1 1 0 1 1-1.4-1.4L10.6 12 6.7 8.1a1 1 0 0 1 0-1.4Z"/>' +
      "</svg>"
    );
  }

  function buildDom() {
    if (document.getElementById("saAiChatRoot")) return null;

    var root = createEl("div", "sa-ai-chat", { id: "saAiChatRoot", "data-open": "false" });

    var dock = createEl("div", "sa-ai-chat__dock", {
      id: "saAiChatDock",
    });

    var welcome = createEl("div", "sa-ai-chat__welcome", {
      id: "saAiChatWelcome",
    });

    var welcomeDismiss = createEl("button", "sa-ai-chat__welcome-dismiss", {
      type: "button",
      id: "saAiChatWelcomeDismiss",
      "aria-label": "Dismiss chat greeting",
    });
    welcomeDismiss.innerHTML = iconWelcomeDismiss();

    var welcomeOpen = createEl("button", "sa-ai-chat__welcome-open", {
      type: "button",
      id: "saAiChatWelcomeOpen",
      "aria-label": "Open Screen Armors Assistant — We're Online!",
      "aria-controls": "saAiChatPanel",
      "aria-expanded": "false",
    });
    var welcomeTitle = createEl("span", "sa-ai-chat__welcome-title", {
      text: "We're Online!",
    });
    var welcomeSubtitle = createEl("span", "sa-ai-chat__welcome-subtitle", {
      text: "How can we help with your screen project?",
    });
    welcomeOpen.appendChild(welcomeTitle);
    welcomeOpen.appendChild(welcomeSubtitle);

    welcome.appendChild(welcomeDismiss);
    welcome.appendChild(welcomeOpen);

    var launcher = createEl("button", "sa-ai-chat__launcher", {
      type: "button",
      id: "saAiChatLauncher",
      "aria-label": "Open Screen Armors Assistant",
      "aria-controls": "saAiChatPanel",
      "aria-expanded": "false",
    });
    launcher.innerHTML = iconChat();

    dock.appendChild(welcome);
    dock.appendChild(launcher);

    var panel = createEl("div", "sa-ai-chat__panel", {
      id: "saAiChatPanel",
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "saAiChatTitle",
      "aria-describedby": "saAiChatSubtitle",
      hidden: "true",
    });

    var header = createEl("div", "sa-ai-chat__header");
    var headerText = createEl("div", "sa-ai-chat__header-text");
    var title = createEl("h2", "sa-ai-chat__title", {
      id: "saAiChatTitle",
      text: "Screen Armors Assistant",
    });
    var subtitle = createEl("p", "sa-ai-chat__subtitle", {
      id: "saAiChatSubtitle",
      text: "Ask about screens, repairs, or enclosures",
    });
    headerText.appendChild(title);
    headerText.appendChild(subtitle);

    var closeBtn = createEl("button", "sa-ai-chat__close", {
      type: "button",
      id: "saAiChatClose",
      "aria-label": "Close chat",
    });
    closeBtn.innerHTML = iconClose();
    header.appendChild(headerText);
    header.appendChild(closeBtn);

    var messages = createEl("div", "sa-ai-chat__messages", {
      id: "saAiChatMessages",
      role: "log",
      "aria-live": "polite",
      "aria-relevant": "additions",
    });

    var quick = createEl("div", "sa-ai-chat__quick", {
      id: "saAiChatQuick",
      role: "group",
      "aria-label": "Quick actions",
    });

    QUICK_ACTIONS.forEach(function (action) {
      var chip = createEl("button", "sa-ai-chat__chip", {
        type: "button",
        "data-action": action.id,
        "aria-label": action.label,
        text: action.label,
      });
      quick.appendChild(chip);
    });

    var form = createEl("form", "sa-ai-chat__composer", {
      id: "saAiChatForm",
    });
    var input = createEl("textarea", "sa-ai-chat__input", {
      id: "saAiChatInput",
      rows: "1",
      maxlength: "2000",
      placeholder: "Type your message…",
      "aria-label": "Message",
      autocomplete: "off",
    });
    var send = createEl("button", "sa-ai-chat__send", {
      type: "submit",
      id: "saAiChatSend",
      "aria-label": "Send message",
      text: "Send",
    });
    form.appendChild(input);
    form.appendChild(send);

    var footer = createEl("div", "sa-ai-chat__powered", {
      "aria-label": "Powered by ChatGPT",
    });
    var logo = document.createElement("img");
    logo.className = "sa-ai-chat__powered-logo";
    logo.src = "/public/icons8-chatgpt-50.png";
    logo.alt = "";
    logo.width = 16;
    logo.height = 16;
    logo.decoding = "async";
    logo.setAttribute("aria-hidden", "true");
    var poweredText = createEl("span", "sa-ai-chat__powered-text", {
      text: "Powered by ChatGPT \u00B7 GPT-5.6 Luna",
    });
    footer.appendChild(logo);
    footer.appendChild(poweredText);

    panel.appendChild(header);
    panel.appendChild(messages);
    panel.appendChild(quick);
    panel.appendChild(form);
    panel.appendChild(footer);

    root.appendChild(dock);
    root.appendChild(panel);
    document.body.appendChild(root);

    return {
      root: root,
      dock: dock,
      welcome: welcome,
      welcomeOpen: welcomeOpen,
      welcomeDismiss: welcomeDismiss,
      launcher: launcher,
      panel: panel,
      closeBtn: closeBtn,
      messages: messages,
      quick: quick,
      form: form,
      input: input,
      send: send,
    };
  }

  function appendBubble(role, content, opts) {
    opts = opts || {};
    var row = createEl("div", "sa-ai-chat__msg sa-ai-chat__msg--" + role);
    var bubble = createEl("div", "sa-ai-chat__bubble");
    bubble.textContent = content;
    if (opts.id) row.id = opts.id;
    row.appendChild(bubble);

    var links = sanitizeLinks(opts.links);
    if (role === "assistant" && links.length) {
      var nav = createEl("div", "sa-ai-chat__nav-links", {
        role: "group",
        "aria-label": "Suggested pages",
      });
      links.forEach(function (link) {
        var a = createEl("a", "sa-ai-chat__nav-link", {
          href: link.href,
          text: link.label,
        });
        nav.appendChild(a);
      });
      row.appendChild(nav);
    }

    els.messages.appendChild(row);
    return row;
  }

  function renderMessages() {
    els.messages.innerHTML = "";
    state.history.forEach(function (m) {
      appendBubble(m.role, m.content, { links: m.links });
    });
    syncQuickVisibility();
    scrollToBottom();
  }

  function syncQuickVisibility() {
    if (!els.quick) return;
    els.quick.hidden = hasUserMessage();
  }

  function scrollToBottom() {
    if (!els.messages) return;
    requestAnimationFrame(function () {
      els.messages.scrollTop = els.messages.scrollHeight;
    });
  }

  function setSending(isSending) {
    state.sending = !!isSending;
    els.send.disabled = state.sending || !els.input.value.trim();
    els.input.disabled = state.sending;
    var chips = els.quick.querySelectorAll(".sa-ai-chat__chip");
    for (var i = 0; i < chips.length; i++) {
      chips[i].disabled = state.sending;
    }

    var existing = document.getElementById("saAiChatTyping");
    if (state.sending) {
      if (!existing) {
        appendBubble("status", "Assistant is typing…", { id: "saAiChatTyping" });
        scrollToBottom();
      }
    } else if (existing) {
      existing.remove();
    }
  }

  function syncSendEnabled() {
    els.send.disabled = state.sending || !els.input.value.trim();
  }

  function autosizeInput() {
    var el = els.input;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }

  function syncWelcomeVisibility() {
    if (!els.welcome) return;
    var show = !state.open && !state.welcomeDismissed;
    els.welcome.hidden = !show;
    els.root.setAttribute("data-welcome", show ? "true" : "false");
    if (els.welcomeOpen) {
      els.welcomeOpen.setAttribute("aria-expanded", state.open ? "true" : "false");
    }
  }

  function dismissWelcome() {
    state.welcomeDismissed = true;
    persistSession();
    syncWelcomeVisibility();
  }

  function setOpen(open, opts) {
    opts = opts || {};
    state.open = !!open;
    els.root.setAttribute("data-open", state.open ? "true" : "false");
    els.launcher.setAttribute("aria-expanded", state.open ? "true" : "false");
    syncWelcomeVisibility();
    if (state.open) {
      els.panel.removeAttribute("hidden");
    } else {
      els.panel.setAttribute("hidden", "true");
    }
    document.body.classList.toggle("sa-ai-chat-open", state.open && isMobile());
    persistSession();

    if (state.open) {
      scrollToBottom();
      if (!opts.skipFocus) {
        window.setTimeout(function () {
          els.input.focus();
        }, 30);
      }
    } else if (!opts.skipFocus) {
      els.launcher.focus();
    }
  }

  function isMobile() {
    return window.matchMedia && window.matchMedia("(max-width: 640px)").matches;
  }

  function syncKeyboardInset() {
    var inset = 0;
    if (window.visualViewport) {
      var vv = window.visualViewport;
      inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    }
    els.root.style.setProperty("--sa-ai-keyboard-inset", inset + "px");
    if (state.open) scrollToBottom();
  }

  function focusInput() {
    setOpen(true);
    window.setTimeout(function () {
      els.input.focus();
    }, 30);
  }

  async function sendMessage(rawText) {
    if (state.sending) return;

    var text = String(rawText || "").trim();
    if (!text) return;
    if (text.length > 2000) {
      appendBubble("error", "That message is too long. Please keep it under 2000 characters.");
      scrollToBottom();
      return;
    }

    state.history.push({ role: "user", content: text });
    persistSession();
    appendBubble("user", text);
    syncQuickVisibility();
    els.input.value = "";
    autosizeInput();
    syncSendEnabled();
    scrollToBottom();
    setSending(true);

    var payload = {
      message: text,
      history: historyForApi().slice(0, -1),
      currentPath: window.location.pathname || "/",
      leadSubmitted: state.leadSubmitted === true,
    };

    try {
      var res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      var data = null;
      try {
        data = await res.json();
      } catch (e) {
        data = null;
      }

      var reply =
        data && typeof data.message === "string" && data.message.trim()
          ? data.message.trim()
          : FALLBACK;

      if (!res.ok || !(data && data.success)) {
        appendBubble("error", reply || FALLBACK);
      } else {
        if (data.leadSubmitted === true) {
          state.leadSubmitted = true;
        }
        var links = sanitizeLinks(data.links);
        var assistantEntry = { role: "assistant", content: reply };
        if (links.length) assistantEntry.links = links;
        state.history.push(assistantEntry);
        persistSession();
        appendBubble("assistant", reply, { links: links });
      }
    } catch (err) {
      appendBubble("error", FALLBACK);
    } finally {
      setSending(false);
      syncSendEnabled();
      scrollToBottom();
    }
  }

  function onQuickClick(e) {
    var btn = e.target.closest(".sa-ai-chat__chip");
    if (!btn || state.sending) return;
    var id = btn.getAttribute("data-action");
    var action = null;
    for (var i = 0; i < QUICK_ACTIONS.length; i++) {
      if (QUICK_ACTIONS[i].id === id) {
        action = QUICK_ACTIONS[i];
        break;
      }
    }
    if (!action) return;
    if (!action.message) {
      focusInput();
      return;
    }
    sendMessage(action.message);
  }

  function onKeyDown(e) {
    if (e.key === "Escape" && state.open) {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (e.target !== els.input) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!state.sending && els.input.value.trim()) {
        sendMessage(els.input.value);
      }
    }
  }

  function bindEvents() {
    els.launcher.addEventListener("click", function () {
      setOpen(true);
    });
    if (els.welcomeOpen) {
      els.welcomeOpen.addEventListener("click", function () {
        setOpen(true);
      });
    }
    if (els.welcomeDismiss) {
      els.welcomeDismiss.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        dismissWelcome();
      });
    }
    els.closeBtn.addEventListener("click", function () {
      setOpen(false);
    });
    els.form.addEventListener("submit", function (e) {
      e.preventDefault();
      sendMessage(els.input.value);
    });
    els.input.addEventListener("input", function () {
      autosizeInput();
      syncSendEnabled();
    });
    els.quick.addEventListener("click", onQuickClick);
    document.addEventListener("keydown", onKeyDown);

    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", syncKeyboardInset);
      window.visualViewport.addEventListener("scroll", syncKeyboardInset);
    }
    window.addEventListener("resize", syncKeyboardInset);
  }

  function init() {
    if (!document.body) return;
    if (document.getElementById("saAiChatRoot")) return;

    var path = (window.location.pathname || "").replace(/\\/g, "/");
    if (path.indexOf("/admin/") !== -1) return;

    loadSession();
    els = buildDom();
    if (!els) return;

    renderMessages();
    bindEvents();
    syncKeyboardInset();
    syncSendEnabled();
    syncWelcomeVisibility();

    if (state.open) {
      setOpen(true, { skipFocus: true });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
