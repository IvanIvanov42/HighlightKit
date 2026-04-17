let watchedStrings = [];
let observer = null;
let isHighlighting = false;

// ── Load from storage ────────────────────────────────────────────────────────
function loadWatchedStrings() {
  chrome.storage.local.get(["watchedStrings"], function (result) {
    watchedStrings = result.watchedStrings || [];
    highlightMatches();
  });
}

// ── Full re-highlight ────────────────────────────────────────────────────────
function highlightMatches() {
  if (isHighlighting) return;
  isHighlighting = true;

  if (observer) observer.disconnect();

  // Always start fresh so removed/disabled items are cleared
  removeAllHighlights();

  const active = watchedStrings.filter((item) => item.enabled !== false);

  if (active.length > 0) {
    processTextNodes(document.body, active);
  }

  reconnectObserver();
  isHighlighting = false;
}

// ── Walk text nodes and collect matches ──────────────────────────────────────
function processTextNodes(element, active) {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    acceptNode: function (node) {
      const parent = node.parentElement;
      if (
        !parent ||
        parent.tagName === "SCRIPT" ||
        parent.tagName === "STYLE" ||
        parent.tagName === "TEXTAREA" ||
        parent.tagName === "INPUT" ||
        parent.classList.contains("string-highlight")
      ) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const nodesToProcess = [];
  let node;

  while ((node = walker.nextNode())) {
    const textLower = node.textContent.toLowerCase();
    for (const item of active) {
      if (textLower.includes(item.text.toLowerCase())) {
        nodesToProcess.push({ node, item });
        break; // one style per text node
      }
    }
  }

  nodesToProcess.forEach(({ node, item }) => {
    highlightTextInNode(node, item.text, item.style);
  });
}

// ── Wrap matched substrings in a <span> ──────────────────────────────────────
function highlightTextInNode(textNode, searchString, style) {
  if (!textNode.parentNode) return;

  const text = textNode.textContent;
  const textLower = text.toLowerCase();
  const searchLower = searchString.toLowerCase();

  let startIndex = 0;
  const fragments = [];

  while (true) {
    const index = textLower.indexOf(searchLower, startIndex);
    if (index === -1) {
      if (startIndex < text.length) {
        fragments.push(document.createTextNode(text.substring(startIndex)));
      }
      break;
    }

    if (index > startIndex) {
      fragments.push(
        document.createTextNode(text.substring(startIndex, index)),
      );
    }

    const span = document.createElement("span");
    span.className = "string-highlight string-highlight-" + style;
    span.textContent = text.substring(index, index + searchString.length);
    fragments.push(span);

    startIndex = index + searchString.length;
  }

  if (fragments.length > 1) {
    const parent = textNode.parentNode;
    fragments.forEach((f) => parent.insertBefore(f, textNode));
    parent.removeChild(textNode);
  }
}

// ── Remove all highlights (unwrap spans) ─────────────────────────────────────
function removeAllHighlights() {
  document.querySelectorAll(".string-highlight").forEach((span) => {
    const parent = span.parentNode;
    if (parent) {
      parent.replaceChild(document.createTextNode(span.textContent), span);
      parent.normalize();
    }
  });
}

// ── Mutation observer for dynamic content ────────────────────────────────────
function reconnectObserver() {
  if (observer) {
    observer.observe(document.body, { childList: true, subtree: true });
  }
}

observer = new MutationObserver(function (mutations) {
  if (isHighlighting) return;

  const active = watchedStrings.filter((item) => item.enabled !== false);
  if (active.length === 0) return;

  isHighlighting = true;
  observer.disconnect();

  mutations.forEach((mutation) => {
    mutation.addedNodes.forEach((node) => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        processTextNodes(node, active);
      } else if (node.nodeType === Node.TEXT_NODE) {
        const textLower = node.textContent.toLowerCase();
        for (const item of active) {
          if (textLower.includes(item.text.toLowerCase())) {
            highlightTextInNode(node, item.text, item.style);
            break;
          }
        }
      }
    });
  });

  reconnectObserver();
  isHighlighting = false;
});

reconnectObserver();

// ── React to storage changes ─────────────────────────────────────────────────
chrome.storage.onChanged.addListener(function (changes) {
  if (changes.watchedStrings) {
    watchedStrings = changes.watchedStrings.newValue || [];
    highlightMatches();
  }
});

// ── Boot ─────────────────────────────────────────────────────────────────────
loadWatchedStrings();
