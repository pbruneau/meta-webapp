import * as pdfjsLib from "/pdf-reader/vendor/pdfjs/build/pdf.mjs";
import {
  EventBus,
  PDFFindController,
  PDFLinkService,
  PDFViewer,
} from "/pdf-reader/vendor/pdfjs/web/pdf_viewer.mjs";


pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf-reader/vendor/pdfjs/build/pdf.worker.mjs";

const API_ROOT = "/pdf-reader/api";
const ANCHOR_VIEWPORT_RATIO = 0.25;
const SAVE_DELAY_MS = 900;
const ZOOM_DRAWING_DELAY_MS = 250;
const MIN_READER_SCALE = 0.25;
const MAX_READER_SCALE = 5;

const elements = {
  appLoading: document.getElementById("appLoading"),
  libraryView: document.getElementById("libraryView"),
  readerView: document.getElementById("readerView"),
  continueSection: document.getElementById("continueSection"),
  continueButton: document.getElementById("continueButton"),
  librarySearch: document.getElementById("librarySearch"),
  librarySort: document.getElementById("librarySort"),
  refreshLibrary: document.getElementById("refreshLibrary"),
  breadcrumbs: document.getElementById("breadcrumbs"),
  libraryListHeading: document.getElementById("libraryListHeading"),
  libraryGrid: document.getElementById("libraryGrid"),
  emptyLibrary: document.getElementById("emptyLibrary"),
  backToLibrary: document.getElementById("backToLibrary"),
  closeDocument: document.getElementById("closeDocument"),
  toggleSidebar: document.getElementById("toggleSidebar"),
  readerBody: document.getElementById("readerBody"),
  readerSidebar: document.getElementById("readerSidebar"),
  sidebarScrim: document.getElementById("sidebarScrim"),
  thumbnailsTab: document.getElementById("thumbnailsTab"),
  outlineTab: document.getElementById("outlineTab"),
  thumbnailPanel: document.getElementById("thumbnailPanel"),
  outlinePanel: document.getElementById("outlinePanel"),
  outlineView: document.getElementById("outlineView"),
  readerTitle: document.getElementById("readerTitle"),
  previousPage: document.getElementById("previousPage"),
  nextPage: document.getElementById("nextPage"),
  pageNumber: document.getElementById("pageNumber"),
  pageCount: document.getElementById("pageCount"),
  zoomOut: document.getElementById("zoomOut"),
  zoomIn: document.getElementById("zoomIn"),
  scaleMode: document.getElementById("scaleMode"),
  findForm: document.getElementById("findForm"),
  findInput: document.getElementById("findInput"),
  findPrevious: document.getElementById("findPrevious"),
  findStatus: document.getElementById("findStatus"),
  viewerContainer: document.getElementById("viewerContainer"),
  viewer: document.getElementById("viewer"),
  thumbnailView: document.getElementById("thumbnailView"),
  readerLoading: document.getElementById("readerLoading"),
  readerLoadingText: document.getElementById("readerLoadingText"),
  toast: document.getElementById("toast"),
};

const eventBus = new EventBus();
const linkService = new PDFLinkService({ eventBus, ignoreDestinationZoom: true });
const findController = new PDFFindController({ eventBus, linkService });
const pdfViewer = new PDFViewer({
  container: elements.viewerContainer,
  viewer: elements.viewer,
  eventBus,
  linkService,
  findController,
  textLayerMode: 2,
  annotationMode: 2,
});
linkService.setViewer(pdfViewer);

let documents = [];
let currentFolder = "";
let currentDocument = null;
let pdfDocument = null;
let loadingTask = null;
let pendingRestore = null;
let restoringPosition = false;
let saveTimer = null;
let pendingSave = null;
let saveLoop = null;
let lastKnownUpdate = null;
let toastTimer = null;
let documentGeneration = 0;
let thumbnailObserver = null;
let lastLocalPosition = null;
let resizeTimer = null;
let selectedLibraryRow = null;
let wheelUnusedFactor = 1;
let touchUnusedFactor = 1;
let touchPinch = null;


async function api(path, options = {}) {
  const response = await fetch(`${API_ROOT}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const payload = await response.json();
      message = payload.error || message;
    } catch (_error) {
      // The status message remains sufficient when no JSON body is available.
    }
    throw new Error(message);
  }

  return response.json();
}


function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  toastTimer = setTimeout(() => {
    elements.toast.hidden = true;
  }, 4500);
}


function formatBytes(bytes) {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}


function documentDisplayName(documentRecord) {
  return documentRecord.name.replace(/\.pdf$/i, "");
}


function createMark(className) {
  const mark = document.createElement("span");
  mark.className = className;
  mark.textContent = "PDF";
  mark.setAttribute("aria-hidden", "true");
  return mark;
}


function renderContinue(currentDocumentId) {
  const documentRecord = documents.find((item) => item.id === currentDocumentId);
  if (!documentRecord) {
    elements.continueSection.hidden = true;
    elements.continueButton.replaceChildren();
    return;
  }

  const copy = document.createElement("span");
  const title = document.createElement("strong");
  const meta = document.createElement("span");
  const action = document.createElement("span");
  copy.className = "continue-copy";
  title.className = "continue-title";
  meta.className = "continue-meta";
  action.className = "continue-action";
  title.textContent = documentDisplayName(documentRecord);
  meta.textContent = documentRecord.lastPage
    ? `Resume at page ${documentRecord.lastPage}`
    : "Start reading";
  action.textContent = "Open";
  copy.append(title, meta);
  elements.continueButton.replaceChildren(createMark("continue-mark"), copy, action);
  elements.continueButton.onclick = () => navigateToDocument(documentRecord);
  elements.continueSection.hidden = false;
}


function selectLibraryRow(row) {
  selectedLibraryRow?.classList.remove("selected");
  selectedLibraryRow = row;
  selectedLibraryRow.classList.add("selected");
}


function bindLibraryRow(row, activate) {
  let pointerType = "";
  row.addEventListener("pointerdown", (event) => {
    pointerType = event.pointerType;
  });
  row.addEventListener("click", (event) => {
    if (event.detail === 0 || (pointerType && pointerType !== "mouse")) {
      activate();
    } else {
      selectLibraryRow(row);
    }
    pointerType = "";
  });
  row.addEventListener("dblclick", (event) => {
    event.preventDefault();
    activate();
  });
}


function createLibraryDetails(...values) {
  const details = document.createElement("span");
  details.className = "library-row-details";
  for (const { className, value } of values) {
    const field = document.createElement("span");
    field.className = `library-row-value ${className}`;
    field.textContent = value;
    details.append(field);
  }
  return details;
}


function renderBreadcrumbs() {
  elements.breadcrumbs.replaceChildren();
  const parts = currentFolder ? currentFolder.split("/") : [];
  const locations = [{ label: "Magazines", path: "" }];
  let accumulated = "";
  for (const part of parts) {
    accumulated = accumulated ? `${accumulated}/${part}` : part;
    locations.push({ label: part, path: accumulated });
  }

  locations.forEach((location, index) => {
    if (index > 0) {
      const separator = document.createElement("span");
      separator.className = "breadcrumb-separator";
      separator.textContent = "/";
      elements.breadcrumbs.append(separator);
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = "breadcrumb-button";
    button.textContent = location.label;
    button.addEventListener("click", () => {
      currentFolder = location.path;
      elements.librarySearch.value = "";
      renderLibraryGrid();
    });
    elements.breadcrumbs.append(button);
  });
}


function createDocumentCard(documentRecord, showPath = false) {
  const button = document.createElement("button");
  const copy = document.createElement("span");
  const title = document.createElement("strong");
  const path = document.createElement("span");
  button.type = "button";
  button.className = "library-row document-row";
  button.title = "Double-click to open";
  copy.className = "document-copy";
  title.className = "document-title";
  path.className = "document-path";
  title.textContent = documentDisplayName(documentRecord);
  path.textContent = showPath && documentRecord.folder ? documentRecord.folder : "";
  path.hidden = !path.textContent;
  copy.append(title, path);
  button.append(
    createMark("document-mark"),
    copy,
    createLibraryDetails(
      { className: "document-size", value: formatBytes(documentRecord.size) },
      {
        className: "document-progress",
        value: documentRecord.lastPage ? `Page ${documentRecord.lastPage}` : "Not started",
      }
    )
  );
  bindLibraryRow(button, () => navigateToDocument(documentRecord));
  return button;
}


function createFolderCard(name, path, count) {
  const button = document.createElement("button");
  const icon = document.createElement("span");
  const copy = document.createElement("span");
  const title = document.createElement("strong");
  button.type = "button";
  button.className = "library-row folder-row";
  button.title = "Double-click to open";
  icon.className = "folder-icon";
  icon.setAttribute("aria-hidden", "true");
  copy.className = "folder-copy";
  title.className = "folder-title";
  title.textContent = name;
  copy.append(title);
  button.append(
    icon,
    copy,
    createLibraryDetails(
      { className: "folder-size", value: "" },
      {
        className: "folder-count",
        value: `${count} ${count === 1 ? "magazine" : "magazines"}`,
      }
    )
  );
  bindLibraryRow(button, () => {
    currentFolder = path;
    renderLibraryGrid();
  });
  return button;
}


function sortDocuments(items) {
  if (elements.librarySort.value === "recent") {
    return [...items].sort((left, right) => {
      const leftTime = left.lastReadAt || "";
      const rightTime = right.lastReadAt || "";
      return rightTime.localeCompare(leftTime) || left.name.localeCompare(right.name);
    });
  }
  return [...items].sort((left, right) =>
    left.name.localeCompare(right.name, undefined, { sensitivity: "base" })
  );
}


function renderLibraryGrid() {
  const query = elements.librarySearch.value.trim().toLocaleLowerCase();
  elements.libraryGrid.replaceChildren();
  selectedLibraryRow = null;

  if (query) {
    const matches = sortDocuments(
      documents.filter((item) => item.path.toLocaleLowerCase().includes(query))
    );
    for (const documentRecord of matches) {
      elements.libraryGrid.append(createDocumentCard(documentRecord, true));
    }
    elements.libraryListHeading.hidden = matches.length === 0;
    elements.libraryGrid.hidden = matches.length === 0;
    elements.emptyLibrary.hidden = matches.length > 0;
    renderBreadcrumbs();
    return;
  }

  const prefix = currentFolder ? `${currentFolder}/` : "";
  const directDocuments = [];
  const folders = new Map();

  for (const documentRecord of documents) {
    if (!documentRecord.path.startsWith(prefix)) {
      continue;
    }
    const remainder = documentRecord.path.slice(prefix.length);
    const separatorIndex = remainder.indexOf("/");
    if (separatorIndex === -1) {
      directDocuments.push(documentRecord);
    } else {
      const folderName = remainder.slice(0, separatorIndex);
      const folderPath = prefix ? `${currentFolder}/${folderName}` : folderName;
      const existing = folders.get(folderName) || { path: folderPath, count: 0 };
      existing.count += 1;
      folders.set(folderName, existing);
    }
  }

  const sortedFolders = [...folders.entries()].sort(([left], [right]) =>
    left.localeCompare(right, undefined, { sensitivity: "base" })
  );
  for (const [name, folder] of sortedFolders) {
    elements.libraryGrid.append(createFolderCard(name, folder.path, folder.count));
  }
  for (const documentRecord of sortDocuments(directDocuments)) {
    elements.libraryGrid.append(createDocumentCard(documentRecord));
  }

  const hasItems = sortedFolders.length + directDocuments.length > 0;
  elements.libraryListHeading.hidden = !hasItems;
  elements.libraryGrid.hidden = !hasItems;
  elements.emptyLibrary.hidden = hasItems;
  renderBreadcrumbs();
}


async function loadLibrary({ autoOpen = false } = {}) {
  try {
    const payload = await api("/library");
    documents = payload.documents;
    renderContinue(payload.currentDocumentId);
    renderLibraryGrid();

    if (autoOpen) {
      const documentId = payload.currentDocumentId;
      const documentRecord = documents.find((item) => item.id === documentId);
      if (documentRecord) {
        await openDocument(documentRecord, { updateHistory: false });
        window.history.replaceState(
          { view: "reader", documentId: documentRecord.id },
          "",
          `/pdf-reader/?document=${encodeURIComponent(documentRecord.id)}`
        );
      } else {
        showLibrary({ updateHistory: false });
        window.history.replaceState({ view: "library" }, "", "/pdf-reader/");
      }
    }
  } catch (error) {
    showToast(`Library unavailable: ${error.message}`);
    showLibrary({ updateHistory: false });
  } finally {
    elements.appLoading.hidden = true;
  }
}


function showLibrary({ updateHistory = true } = {}) {
  elements.readerView.hidden = true;
  elements.libraryView.hidden = false;
  closeSidebar();
  if (updateHistory) {
    window.history.pushState({ view: "library" }, "", "/pdf-reader/");
  }
  renderLibraryGrid();
}


function navigateToDocument(documentRecord) {
  openDocument(documentRecord, { updateHistory: true }).catch((error) => {
    showToast(`Magazine could not be opened: ${error.message}`);
    showLibrary({ updateHistory: false });
  });
}


async function closeCurrentDocument() {
  elements.closeDocument.disabled = true;
  try {
    documentGeneration += 1;
    await disposeCurrentDocument();
    await api("/current-document", {
      method: "PUT",
      body: JSON.stringify({ documentId: null }),
    });
    currentDocument = null;
    renderContinue(null);
    showLibrary({ updateHistory: false });
    window.history.replaceState({ view: "library" }, "", "/pdf-reader/");
    await loadLibrary();
  } catch (error) {
    showToast(`Magazine could not be closed: ${error.message}`);
    showLibrary({ updateHistory: false });
    window.history.replaceState({ view: "library" }, "", "/pdf-reader/");
    await loadLibrary();
  } finally {
    elements.closeDocument.disabled = false;
  }
}


async function disposeCurrentDocument() {
  clearTimeout(saveTimer);
  saveTimer = null;
  await flushCapturedPosition();
  pendingRestore = null;
  restoringPosition = false;
  lastKnownUpdate = null;
  lastLocalPosition = null;

  if (loadingTask) {
    try {
      await loadingTask.destroy();
    } catch (_error) {
      // A partially loaded document can already be destroyed.
    }
  }
  loadingTask = null;
  pdfDocument = null;
  pdfViewer.setDocument(null);
  linkService.setDocument(null);
  thumbnailObserver?.disconnect();
  thumbnailObserver = null;
  elements.thumbnailView.replaceChildren();
  elements.outlineView.replaceChildren();
}


async function openDocument(documentRecord, { updateHistory = true } = {}) {
  if (currentDocument?.id === documentRecord.id && pdfDocument) {
    elements.libraryView.hidden = true;
    elements.readerView.hidden = false;
    if (updateHistory) {
      window.history.pushState(
        { view: "reader", documentId: documentRecord.id },
        "",
        `/pdf-reader/?document=${encodeURIComponent(documentRecord.id)}`
      );
    }
    await synchronizeVisibleTab();
    return;
  }
  const generation = ++documentGeneration;
  await disposeCurrentDocument();

  currentDocument = documentRecord;
  elements.libraryView.hidden = true;
  elements.readerView.hidden = false;
  elements.readerLoading.hidden = false;
  elements.readerLoadingText.textContent = "Opening magazine";
  elements.readerTitle.textContent = documentDisplayName(documentRecord);
  elements.readerTitle.title = documentRecord.path;
  elements.pageNumber.value = "1";
  elements.pageCount.textContent = "/ 0";
  elements.findInput.value = "";
  elements.findStatus.textContent = "";
  elements.scaleMode.value = "page-width";

  if (updateHistory) {
    window.history.pushState(
      { view: "reader", documentId: documentRecord.id },
      "",
      `/pdf-reader/?document=${encodeURIComponent(documentRecord.id)}`
    );
  }

  const stateRequest = api(`/documents/${documentRecord.id}/state`);
  const currentRequest = api("/current-document", {
    method: "PUT",
    body: JSON.stringify({ documentId: documentRecord.id }),
  });

  loadingTask = pdfjsLib.getDocument({
    url: `/pdf-reader/content/${encodeURIComponent(documentRecord.id)}`,
    cMapUrl: "/pdf-reader/vendor/pdfjs/cmaps/",
    cMapPacked: true,
    iccUrl: "/pdf-reader/vendor/pdfjs/iccs/",
    standardFontDataUrl: "/pdf-reader/vendor/pdfjs/standard_fonts/",
    wasmUrl: "/pdf-reader/vendor/pdfjs/wasm/",
  });

  const [statePayload, loadedDocument] = await Promise.all([
    stateRequest,
    loadingTask.promise,
    currentRequest,
  ]);
  if (generation !== documentGeneration) {
    return;
  }

  pdfDocument = loadedDocument;
  pendingRestore = statePayload.state || {
    pageNumber: 1,
    anchorX: 0.5,
    anchorY: 0,
    updatedAt: null,
  };
  lastKnownUpdate = pendingRestore.updatedAt;
  elements.pageNumber.max = String(pdfDocument.numPages);
  elements.pageCount.textContent = `/ ${pdfDocument.numPages}`;

  linkService.setDocument(pdfDocument, null);
  pdfViewer.setDocument(pdfDocument);
  renderThumbnails(pdfDocument, generation);
  renderOutline(pdfDocument, generation);
}


function waitForAnimationFrames(count = 1) {
  return new Promise((resolve) => {
    const advance = () => {
      if (count <= 0) {
        resolve();
        return;
      }
      count -= 1;
      requestAnimationFrame(advance);
    };
    advance();
  });
}


async function restorePosition(state) {
  if (!pdfDocument || !state) {
    return;
  }
  restoringPosition = true;
  clearTimeout(saveTimer);
  pdfViewer.currentScaleValue = "page-width";
  const pageNumber = Math.min(pdfDocument.numPages, Math.max(1, state.pageNumber || 1));
  pdfViewer.currentPageNumber = pageNumber;
  await waitForAnimationFrames(3);

  const pageElement = elements.viewer.querySelector(
    `.page[data-page-number="${pageNumber}"]`
  );
  if (pageElement) {
    const containerRect = elements.viewerContainer.getBoundingClientRect();
    const pageRect = pageElement.getBoundingClientRect();
    const targetViewportY =
      containerRect.top + elements.viewerContainer.clientHeight * ANCHOR_VIEWPORT_RATIO;
    const targetViewportX =
      containerRect.left + elements.viewerContainer.clientWidth * 0.5;
    const actualY = pageRect.top + pageRect.height * clamp(state.anchorY ?? 0, 0, 1);
    const actualX = pageRect.left + pageRect.width * clamp(state.anchorX ?? 0.5, 0, 1);
    elements.viewerContainer.scrollTop += actualY - targetViewportY;
    elements.viewerContainer.scrollLeft += actualX - targetViewportX;
  }

  await waitForAnimationFrames(1);
  lastLocalPosition = {
    pageNumber,
    anchorX: clamp(state.anchorX ?? 0.5, 0, 1),
    anchorY: clamp(state.anchorY ?? 0, 0, 1),
  };
  updatePageControls(pageNumber);
  elements.readerLoading.hidden = true;
  restoringPosition = false;
}


function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}


function capturePosition() {
  if (!currentDocument || !pdfDocument || restoringPosition) {
    return null;
  }

  const containerRect = elements.viewerContainer.getBoundingClientRect();
  const anchorViewportY =
    containerRect.top + elements.viewerContainer.clientHeight * ANCHOR_VIEWPORT_RATIO;
  const anchorViewportX =
    containerRect.left + elements.viewerContainer.clientWidth * 0.5;
  const pageElements = [...elements.viewer.querySelectorAll(".page[data-page-number]")];
  let selectedPage = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const pageElement of pageElements) {
    const rect = pageElement.getBoundingClientRect();
    if (rect.top <= anchorViewportY && rect.bottom >= anchorViewportY) {
      selectedPage = { pageElement, rect };
      break;
    }
    const distance = Math.min(
      Math.abs(rect.top - anchorViewportY),
      Math.abs(rect.bottom - anchorViewportY)
    );
    if (distance < nearestDistance) {
      nearestDistance = distance;
      selectedPage = { pageElement, rect };
    }
  }

  if (!selectedPage || selectedPage.rect.width <= 0 || selectedPage.rect.height <= 0) {
    return null;
  }

  const position = {
    pageNumber: Number(selectedPage.pageElement.dataset.pageNumber),
    anchorX: clamp(
      (anchorViewportX - selectedPage.rect.left) / selectedPage.rect.width,
      0,
      1
    ),
    anchorY: clamp(
      (anchorViewportY - selectedPage.rect.top) / selectedPage.rect.height,
      0,
      1
    ),
  };
  lastLocalPosition = position;
  return position;
}


function updatePageControls(pageNumber) {
  elements.pageNumber.value = String(pageNumber);
  elements.previousPage.disabled = pageNumber <= 1;
  elements.nextPage.disabled = !pdfDocument || pageNumber >= pdfDocument.numPages;
  highlightCurrentThumbnail(pageNumber);
}


function queueCapturedPosition(delay = SAVE_DELAY_MS) {
  if (restoringPosition || !currentDocument) {
    return;
  }
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const position = capturePosition();
    if (position) {
      enqueueSave(position);
    }
  }, delay);
}


function enqueueSave(position) {
  if (!currentDocument) {
    return;
  }
  pendingSave = { documentId: currentDocument.id, position };
  if (!saveLoop) {
    saveLoop = runSaveLoop();
  }
}


async function runSaveLoop() {
  while (pendingSave) {
    const save = pendingSave;
    pendingSave = null;
    try {
      const payload = await api(`/documents/${save.documentId}/state`, {
        method: "PUT",
        body: JSON.stringify(save.position),
      });
      lastKnownUpdate = payload.state.updatedAt;
      const documentRecord = documents.find((item) => item.id === save.documentId);
      if (documentRecord) {
        documentRecord.lastPage = payload.state.pageNumber;
        documentRecord.lastReadAt = payload.state.updatedAt;
      }
    } catch (error) {
      showToast(`Reading position was not saved: ${error.message}`);
    }
  }
  saveLoop = null;
}


async function flushCapturedPosition() {
  clearTimeout(saveTimer);
  saveTimer = null;
  const position = capturePosition();
  if (position) {
    enqueueSave(position);
  }
  if (saveLoop) {
    await saveLoop;
  }
}


function saveForPageExit() {
  clearTimeout(saveTimer);
  saveTimer = null;
  const position = capturePosition();
  if (!position || !currentDocument) {
    return;
  }
  fetch(`${API_ROOT}/documents/${currentDocument.id}/state`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(position),
    keepalive: true,
  }).catch(() => {});
}


async function synchronizeVisibleTab() {
  if (!currentDocument || restoringPosition || pendingSave || saveLoop) {
    return;
  }
  try {
    const payload = await api(`/documents/${currentDocument.id}/state`);
    const remote = payload.state;
    if (remote?.updatedAt && remote.updatedAt !== lastKnownUpdate) {
      lastKnownUpdate = remote.updatedAt;
      await restorePosition(remote);
    }
  } catch (error) {
    showToast(`Reading position could not be synchronized: ${error.message}`);
  }
}


function setSidebar(open) {
  elements.readerSidebar.hidden = !open;
  elements.sidebarScrim.hidden = !open;
  elements.readerBody.classList.toggle("sidebar-open", open);
  elements.toggleSidebar.setAttribute("aria-expanded", String(open));
}


function closeSidebar() {
  setSidebar(false);
}


function selectSidebarTab(tab) {
  const showThumbnails = tab === "thumbnails";
  elements.thumbnailsTab.classList.toggle("active", showThumbnails);
  elements.outlineTab.classList.toggle("active", !showThumbnails);
  elements.thumbnailsTab.setAttribute("aria-selected", String(showThumbnails));
  elements.outlineTab.setAttribute("aria-selected", String(!showThumbnails));
  elements.thumbnailPanel.hidden = !showThumbnails;
  elements.outlinePanel.hidden = showThumbnails;
}


async function renderThumbnail(pageNumber, canvas, generation) {
  if (!pdfDocument || generation !== documentGeneration || canvas.dataset.rendered) {
    return;
  }
  canvas.dataset.rendered = "pending";
  try {
    const page = await pdfDocument.getPage(pageNumber);
    if (generation !== documentGeneration) {
      return;
    }
    const initialViewport = page.getViewport({ scale: 1 });
    const cssScale = 138 / initialViewport.width;
    const viewport = page.getViewport({ scale: cssScale });
    const outputScale = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;
    await page.render({
      canvasContext: canvas.getContext("2d", { alpha: false }),
      viewport,
      transform: outputScale === 1 ? null : [outputScale, 0, 0, outputScale, 0, 0],
    }).promise;
    canvas.dataset.rendered = "true";
  } catch (_error) {
    delete canvas.dataset.rendered;
  }
}


function renderThumbnails(loadedDocument, generation) {
  elements.thumbnailView.replaceChildren();
  thumbnailObserver?.disconnect();

  thumbnailObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) {
          continue;
        }
        const canvas = entry.target.querySelector("canvas");
        const pageNumber = Number(entry.target.dataset.pageNumber);
        thumbnailObserver.unobserve(entry.target);
        renderThumbnail(pageNumber, canvas, generation);
      }
    },
    { root: elements.thumbnailPanel, rootMargin: "320px 0px" }
  );

  const fragment = document.createDocumentFragment();
  for (let pageNumber = 1; pageNumber <= loadedDocument.numPages; pageNumber += 1) {
    const button = document.createElement("button");
    const canvas = document.createElement("canvas");
    const label = document.createElement("span");
    button.type = "button";
    button.className = "thumbnail-button";
    button.dataset.pageNumber = String(pageNumber);
    button.setAttribute("aria-label", `Open page ${pageNumber}`);
    canvas.setAttribute("aria-hidden", "true");
    label.textContent = String(pageNumber);
    button.append(canvas, label);
    button.addEventListener("click", () => {
      pdfViewer.currentPageNumber = pageNumber;
      queueCapturedPosition(150);
      if (window.matchMedia("(max-width: 900px)").matches) {
        closeSidebar();
      }
    });
    fragment.append(button);
    thumbnailObserver.observe(button);
  }
  elements.thumbnailView.append(fragment);
}


function highlightCurrentThumbnail(pageNumber) {
  const previous = elements.thumbnailView.querySelector(".thumbnail-button.current");
  previous?.classList.remove("current");
  const current = elements.thumbnailView.querySelector(
    `.thumbnail-button[data-page-number="${pageNumber}"]`
  );
  current?.classList.add("current");
  if (!elements.readerSidebar.hidden && !elements.thumbnailPanel.hidden) {
    current?.scrollIntoView({ block: "nearest" });
  }
}


async function renderOutline(loadedDocument, generation) {
  const outline = await loadedDocument.getOutline();
  if (generation !== documentGeneration) {
    return;
  }
  elements.outlineView.replaceChildren();
  if (!outline?.length) {
    const empty = document.createElement("p");
    empty.className = "outline-empty";
    empty.textContent = "No outline is included in this PDF.";
    elements.outlineView.append(empty);
    return;
  }

  const buildList = (items, root = false) => {
    const list = document.createElement("ul");
    list.className = root ? "outline-list root-list" : "outline-list";
    for (const item of items) {
      const listItem = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "outline-item-button";
      button.textContent = item.title || "Untitled section";
      button.addEventListener("click", async () => {
        if (item.dest) {
          await linkService.goToDestination(item.dest);
          queueCapturedPosition(150);
          if (window.matchMedia("(max-width: 900px)").matches) {
            closeSidebar();
          }
        }
      });
      listItem.append(button);
      if (item.items?.length) {
        listItem.append(buildList(item.items));
      }
      list.append(listItem);
    }
    return list;
  };

  elements.outlineView.append(buildList(outline, true));
}


function runFind({ previous = false, again = false } = {}) {
  const query = elements.findInput.value;
  if (!query) {
    elements.findStatus.textContent = "";
    return;
  }
  eventBus.dispatch("find", {
    source: window,
    type: again ? "again" : "",
    query,
    phraseSearch: true,
    caseSensitive: false,
    entireWord: false,
    highlightAll: true,
    findPrevious: previous,
    matchDiacritics: true,
  });
}


function setCustomScale(multiplier) {
  if (!pdfDocument || !pdfViewer.currentScale) {
    return;
  }
  const scale = clamp(
    pdfViewer.currentScale * multiplier,
    MIN_READER_SCALE,
    MAX_READER_SCALE
  );
  pdfViewer.currentScaleValue = String(Math.round(scale * 100) / 100);
  elements.scaleMode.value = "custom";
  queueCapturedPosition(250);
}


function accumulateScaleFactor(previousScale, factor, source) {
  let unusedFactor = source === "touch" ? touchUnusedFactor : wheelUnusedFactor;
  if ((unusedFactor > 1 && factor < 1) || (unusedFactor < 1 && factor > 1)) {
    unusedFactor = 1;
  }

  const accumulatedFactor =
    Math.floor(previousScale * factor * unusedFactor * 100) / (100 * previousScale);
  if (!Number.isFinite(accumulatedFactor) || accumulatedFactor <= 0) {
    return 1;
  }

  if (source === "touch") {
    touchUnusedFactor = factor / accumulatedFactor;
  } else {
    wheelUnusedFactor = factor / accumulatedFactor;
  }
  return accumulatedFactor;
}


function applyGestureScale(scaleFactor, origin) {
  if (!pdfDocument || !pdfViewer.currentScale || scaleFactor <= 0) {
    return;
  }
  const targetScale = clamp(
    pdfViewer.currentScale * scaleFactor,
    MIN_READER_SCALE,
    MAX_READER_SCALE
  );
  const boundedFactor = targetScale / pdfViewer.currentScale;
  if (Math.abs(boundedFactor - 1) < 0.0001) {
    return;
  }
  pdfViewer.updateScale({
    drawingDelay: ZOOM_DRAWING_DELAY_MS,
    scaleFactor: boundedFactor,
    origin,
  });
  elements.scaleMode.value = "custom";
  queueCapturedPosition(ZOOM_DRAWING_DELAY_MS + 100);
}


function touchGeometry(touches) {
  const first = touches[0];
  const second = touches[1];
  return {
    distance: Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY),
    origin: [(first.clientX + second.clientX) / 2, (first.clientY + second.clientY) / 2],
  };
}


function handleTouchStart(event) {
  if (!pdfDocument || elements.readerView.hidden || event.touches.length !== 2) {
    return;
  }
  event.preventDefault();
  touchUnusedFactor = 1;
  touchPinch = touchGeometry(event.touches);
}


function handleTouchMove(event) {
  if (!touchPinch || event.touches.length !== 2) {
    return;
  }
  event.preventDefault();
  const geometry = touchGeometry(event.touches);
  if (geometry.distance <= 0 || touchPinch.distance <= 0) {
    return;
  }
  const factor = accumulateScaleFactor(
    pdfViewer.currentScale,
    geometry.distance / touchPinch.distance,
    "touch"
  );
  touchPinch = geometry;
  applyGestureScale(factor, geometry.origin);
}


function handleTouchEnd(event) {
  if (!touchPinch || event.touches.length >= 2) {
    return;
  }
  if (event.cancelable) {
    event.preventDefault();
  }
  touchPinch = null;
  touchUnusedFactor = 1;
  pdfViewer.refresh();
  queueCapturedPosition(150);
}


function handleTrackpadPinch(event) {
  if (!event.ctrlKey || !pdfDocument || elements.readerView.hidden) {
    return;
  }
  event.preventDefault();
  const origin = [event.clientX, event.clientY];
  if (event.deltaMode === WheelEvent.DOM_DELTA_PIXEL) {
    const factor = accumulateScaleFactor(
      pdfViewer.currentScale,
      Math.exp(-event.deltaY / 100),
      "wheel"
    );
    applyGestureScale(factor, origin);
    return;
  }
  applyGestureScale(event.deltaY < 0 ? 1.1 : 1 / 1.1, origin);
}


eventBus.on("pagesinit", async () => {
  pdfViewer.currentScaleValue = "page-width";
  if (pendingRestore) {
    const restore = pendingRestore;
    pendingRestore = null;
    await restorePosition(restore);
  } else {
    elements.readerLoading.hidden = true;
  }
});

eventBus.on("pagechanging", ({ pageNumber }) => {
  if (!lastLocalPosition) {
    updatePageControls(pageNumber);
  }
  queueCapturedPosition(250);
});

eventBus.on("updateviewarea", () => {
  const position = capturePosition();
  if (position) {
    updatePageControls(position.pageNumber);
  }
  queueCapturedPosition();
});

eventBus.on("scalechanging", ({ presetValue }) => {
  const knownModes = ["page-width", "page-fit", "auto"];
  elements.scaleMode.value = knownModes.includes(presetValue) ? presetValue : "custom";
});

eventBus.on("updatefindmatchescount", ({ matchesCount }) => {
  if (!matchesCount?.total) {
    elements.findStatus.textContent = "No matches";
    return;
  }
  elements.findStatus.textContent = `${matchesCount.current || 0}/${matchesCount.total}`;
});

elements.librarySearch.addEventListener("input", renderLibraryGrid);
elements.librarySort.addEventListener("change", renderLibraryGrid);
elements.refreshLibrary.addEventListener("click", async () => {
  elements.refreshLibrary.disabled = true;
  try {
    await loadLibrary();
  } finally {
    elements.refreshLibrary.disabled = false;
  }
});

elements.backToLibrary.addEventListener("click", async () => {
  await flushCapturedPosition();
  showLibrary();
  await loadLibrary();
});
elements.closeDocument.addEventListener("click", closeCurrentDocument);

elements.toggleSidebar.addEventListener("click", () => {
  setSidebar(elements.readerSidebar.hidden);
});
elements.sidebarScrim.addEventListener("click", closeSidebar);
elements.thumbnailsTab.addEventListener("click", () => selectSidebarTab("thumbnails"));
elements.outlineTab.addEventListener("click", () => selectSidebarTab("outline"));

elements.previousPage.addEventListener("click", () => {
  const displayedPage = Number.parseInt(elements.pageNumber.value, 10) || 1;
  if (pdfDocument && displayedPage > 1) {
    pdfViewer.currentPageNumber = displayedPage - 1;
  }
});
elements.nextPage.addEventListener("click", () => {
  const displayedPage = Number.parseInt(elements.pageNumber.value, 10) || 1;
  if (pdfDocument && displayedPage < pdfDocument.numPages) {
    pdfViewer.currentPageNumber = displayedPage + 1;
  }
});
function applyRequestedPage() {
  if (!pdfDocument) {
    return;
  }
  const requested = Number.parseInt(elements.pageNumber.value, 10);
  const page = clamp(Number.isFinite(requested) ? requested : 1, 1, pdfDocument.numPages);
  pdfViewer.currentPageNumber = page;
  elements.pageNumber.value = String(page);
}

elements.pageNumber.addEventListener("change", applyRequestedPage);
elements.pageNumber.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    applyRequestedPage();
    elements.viewerContainer.focus();
  }
});

elements.scaleMode.addEventListener("change", () => {
  if (elements.scaleMode.value !== "custom") {
    pdfViewer.currentScaleValue = elements.scaleMode.value;
    queueCapturedPosition(250);
  }
});
elements.zoomOut.addEventListener("click", () => setCustomScale(1 / 1.1));
elements.zoomIn.addEventListener("click", () => setCustomScale(1.1));
elements.viewerContainer.addEventListener("wheel", handleTrackpadPinch, { passive: false });
elements.viewerContainer.addEventListener("touchstart", handleTouchStart, { passive: false });
elements.viewerContainer.addEventListener("touchmove", handleTouchMove, { passive: false });
elements.viewerContainer.addEventListener("touchend", handleTouchEnd, { passive: false });
elements.viewerContainer.addEventListener("touchcancel", handleTouchEnd, { passive: false });

elements.findForm.addEventListener("submit", (event) => {
  event.preventDefault();
  runFind({ again: true });
});
elements.findPrevious.addEventListener("click", () => runFind({ previous: true, again: true }));
elements.findInput.addEventListener("input", () => runFind());

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    saveForPageExit();
  } else {
    synchronizeVisibleTab();
  }
});
window.addEventListener("pagehide", saveForPageExit);
window.addEventListener("resize", () => {
  if (!pdfDocument || pendingRestore || restoringPosition) {
    return;
  }
  const position = lastLocalPosition || capturePosition();
  if (!position) {
    return;
  }
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    restorePosition(position);
  }, 180);
});

window.addEventListener("popstate", async () => {
  const documentId = new URL(window.location.href).searchParams.get("document");
  if (!documentId) {
    await flushCapturedPosition();
    showLibrary({ updateHistory: false });
    return;
  }
  const documentRecord = documents.find((item) => item.id === documentId);
  if (documentRecord && currentDocument?.id !== documentRecord.id) {
    try {
      await openDocument(documentRecord, { updateHistory: false });
    } catch (error) {
      showToast(`Magazine could not be opened: ${error.message}`);
      showLibrary({ updateHistory: false });
    }
  } else if (documentRecord) {
    elements.libraryView.hidden = true;
    elements.readerView.hidden = false;
  }
});

loadLibrary({ autoOpen: true });
