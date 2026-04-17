let selectedStyle = "yellow";

// ── Color option selection ───────────────────────────────────────────────────
document.querySelectorAll(".style-option").forEach((option) => {
  option.addEventListener("click", function () {
    document
      .querySelectorAll(".style-option")
      .forEach((o) => o.classList.remove("selected"));
    this.classList.add("selected");
    selectedStyle = this.dataset.style;
  });
});

// ── Render list ─────────────────────────────────────────────────────────────
function loadWatchList() {
  chrome.storage.local.get(["watchedStrings"], function (result) {
    displayWatchList(result.watchedStrings || []);
  });
}

function displayWatchList(watchList) {
  const container = document.getElementById("listContent");
  document.getElementById("listCount").textContent = watchList.length;
  container.innerHTML = "";

  if (watchList.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML =
      '<div class="empty-icon">🔍</div>' +
      '<div class="empty-text">Nothing being watched</div>' +
      '<div class="empty-sub">Add some text above to get started</div>';
    container.appendChild(empty);
    return;
  }

  const list = document.createElement("div");
  list.className = "items-list";

  watchList.forEach((item, index) => {
    const enabled = item.enabled !== false;
    const div = document.createElement("div");
    div.className = "watch-item" + (enabled ? "" : " disabled-item");

    // Toggle switch
    const label = document.createElement("label");
    label.className = "toggle";
    label.title = enabled ? "Disable" : "Enable";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = enabled;
    checkbox.addEventListener("change", function () {
      toggleString(index, this.checked);
    });

    const track = document.createElement("div");
    track.className = "toggle-track";

    label.appendChild(checkbox);
    label.appendChild(track);

    // Color dot
    const dot = document.createElement("div");
    dot.className = "color-dot dot-" + item.style;

    // Text
    const textEl = document.createElement("span");
    textEl.className = "item-text";
    textEl.textContent = item.text;
    textEl.title = item.text;

    // Remove button
    const removeBtn = document.createElement("button");
    removeBtn.className = "remove-btn";
    removeBtn.textContent = "×";
    removeBtn.title = "Remove";
    removeBtn.addEventListener("click", function () {
      removeString(index);
    });

    div.appendChild(label);
    div.appendChild(dot);
    div.appendChild(textEl);
    div.appendChild(removeBtn);
    list.appendChild(div);
  });

  container.appendChild(list);
}

// ── CRUD ────────────────────────────────────────────────────────────────────
function addString(text, style) {
  chrome.storage.local.get(["watchedStrings"], function (result) {
    const watchList = result.watchedStrings || [];
    const exists = watchList.some(
      (item) => item.text.toLowerCase() === text.toLowerCase(),
    );
    if (!exists) {
      watchList.push({ text, style, enabled: true });
      chrome.storage.local.set({ watchedStrings: watchList }, function () {
        loadWatchList();
        document.getElementById("stringInput").value = "";
      });
    }
  });
}

function removeString(index) {
  chrome.storage.local.get(["watchedStrings"], function (result) {
    const watchList = result.watchedStrings || [];
    watchList.splice(index, 1);
    chrome.storage.local.set({ watchedStrings: watchList }, loadWatchList);
  });
}

function toggleString(index, enabled) {
  chrome.storage.local.get(["watchedStrings"], function (result) {
    const watchList = result.watchedStrings || [];
    if (watchList[index]) {
      watchList[index].enabled = enabled;
      chrome.storage.local.set({ watchedStrings: watchList }, loadWatchList);
    }
  });
}

// ── Add button & Enter key ───────────────────────────────────────────────────
document.getElementById("addBtn").addEventListener("click", function () {
  const text = document.getElementById("stringInput").value.trim();
  if (text) addString(text, selectedStyle);
});

document
  .getElementById("stringInput")
  .addEventListener("keypress", function (e) {
    if (e.key === "Enter") {
      const text = this.value.trim();
      if (text) addString(text, selectedStyle);
    }
  });

// ── Export ───────────────────────────────────────────────────────────────────
document.getElementById("exportBtn").addEventListener("click", function () {
  chrome.storage.local.get(["watchedStrings"], function (result) {
    const data = result.watchedStrings || [];
    if (data.length === 0) {
      alert("Nothing to export — add some strings first.");
      return;
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "highlightkit-export.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
});

// ── Import ───────────────────────────────────────────────────────────────────
document.getElementById("importBtn").addEventListener("click", function () {
  document.getElementById("fileInput").click();
});

document.getElementById("fileInput").addEventListener("change", function (e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (event) {
    try {
      const parsed = JSON.parse(event.target.result);
      if (!Array.isArray(parsed)) throw new Error("Not an array");

      const valid = parsed
        .filter(
          (item) =>
            item &&
            typeof item.text === "string" &&
            item.text.trim() !== "" &&
            typeof item.style === "string",
        )
        .map((item) => ({
          text: item.text.trim(),
          style: item.style,
          enabled: item.enabled !== false,
        }));

      if (valid.length === 0) {
        alert("No valid entries found in the file.");
        return;
      }

      chrome.storage.local.get(["watchedStrings"], function (result) {
        const current = result.watchedStrings || [];
        // Merge — skip duplicates
        const merged = [...current];
        valid.forEach((item) => {
          if (
            !merged.some(
              (m) => m.text.toLowerCase() === item.text.toLowerCase(),
            )
          ) {
            merged.push(item);
          }
        });
        chrome.storage.local.set({ watchedStrings: merged }, function () {
          loadWatchList();
          alert("Imported " + valid.length + " entries.");
        });
      });
    } catch {
      alert("Invalid file. Please import a valid HighlightKit JSON export.");
    }
  };

  reader.readAsText(file);
  this.value = ""; // Reset so the same file can be re-imported
});

// ── Clear all ────────────────────────────────────────────────────────────────
document.getElementById("clearBtn").addEventListener("click", function () {
  chrome.storage.local.get(["watchedStrings"], function (result) {
    const count = (result.watchedStrings || []).length;
    if (count === 0) return;
    if (confirm("Remove all " + count + " watched string(s)?")) {
      chrome.storage.local.set({ watchedStrings: [] }, loadWatchList);
    }
  });
});

// ── Init ─────────────────────────────────────────────────────────────────────
loadWatchList();
