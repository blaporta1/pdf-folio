import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  ChevronDown,
  Download,
  FileImage,
  FilePlus2,
  FileText,
  ImagePlus,
  Info,
  LockKeyhole,
  Minus,
  Plus,
  Redo2,
  Search,
  ShieldCheck,
  Trash2,
  Type,
  Undo2,
  Upload,
  X,
} from "lucide-react";
import { PdfEngine, PasswordRequiredError } from "./pdf/engine";
import {
  canPreserveOriginal,
  suggestedFontId,
  validateAndCreateUploadedFont,
} from "./pdf/fonts";
import type {
  DocumentModel,
  EditOperation,
  FontDefinition,
  ImageElement,
  ImageOperation,
  PageElement,
  Rect,
  RenderedPage,
  TextElement,
  TextOperation,
} from "./pdf/types";

type BusyState = "" | "Opening PDF…" | "Rendering…" | "Exporting…";

function App() {
  const engine = useMemo(() => new PdfEngine(), []);
  const [documentModel, setDocumentModel] = useState<DocumentModel | null>(
    null,
  );
  const [pageIndex, setPageIndex] = useState(0);
  const [rendered, setRendered] = useState<RenderedPage | null>(null);
  const [thumbnails, setThumbnails] = useState<Record<number, string>>({});
  const [operations, setOperations] = useState<EditOperation[]>([]);
  const [past, setPast] = useState<EditOperation[][]>([]);
  const [future, setFuture] = useState<EditOperation[][]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(0.74);
  const [busy, setBusy] = useState<BusyState>("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [password, setPassword] = useState("");
  const pendingFile = useRef<{ bytes: Uint8Array; name: string } | null>(null);
  const [licenseOpen, setLicenseOpen] = useState(false);
  const [fontVersion, setFontVersion] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const fontInput = useRef<HTMLInputElement>(null);
  const replaceImageInput = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLElement>(null);
  const fittedPage = useRef("");

  const currentPage = documentModel?.pages[pageIndex];
  const selected = useMemo(() => {
    if (!selectedId || !currentPage) return null;
    return (
      operations.find((item) => item.id === selectedId) ??
      currentPage.elements.find((item) => item.id === selectedId) ??
      null
    );
  }, [selectedId, currentPage, operations]);

  const commit = useCallback(
    (next: EditOperation[]) => {
      setPast((items) => [...items, operations]);
      setOperations(next);
      setFuture([]);
    },
    [operations],
  );

  const undo = useCallback(() => {
    if (!past.length) return;
    const previous = past[past.length - 1];
    setFuture((items) => [operations, ...items]);
    setPast((items) => items.slice(0, -1));
    setOperations(previous);
    setSelectedId(null);
  }, [past, operations]);

  const redo = useCallback(() => {
    if (!future.length) return;
    const next = future[0];
    setPast((items) => [...items, operations]);
    setFuture((items) => items.slice(1));
    setOperations(next);
    setSelectedId(null);
  }, [future, operations]);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select, [contenteditable="true"]'))
        return;
      if (event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [undo, redo]);

  const fitWidth = useCallback(() => {
    if (!rendered || !stageRef.current) return;
    const available = Math.max(220, stageRef.current.clientWidth - 72);
    setZoom(Math.max(0.32, Math.min(1.25, available / rendered.width)));
  }, [rendered]);

  useEffect(() => {
    if (!rendered || !documentModel) return;
    const key = `${documentModel.name}:${pageIndex}`;
    if (fittedPage.current === key) return;
    fittedPage.current = key;
    requestAnimationFrame(fitWidth);
  }, [documentModel, pageIndex, rendered, fitWidth]);

  useEffect(() => {
    if (!documentModel) return;
    let cancelled = false;
    setBusy("Rendering…");
    setRendered((old) => {
      if (old) URL.revokeObjectURL(old.url);
      return null;
    });
    engine
      .renderPage(pageIndex, operations)
      .then((page) => {
        if (cancelled) {
          URL.revokeObjectURL(page.url);
          return;
        }
        setRendered((old) => {
          if (old) URL.revokeObjectURL(old.url);
          return page;
        });
        setBusy("");
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(messageOf(reason));
          setBusy("");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [documentModel, pageIndex, operations, engine]);

  const loadBytes = useCallback(
    async (bytes: Uint8Array, name: string, suppliedPassword = "") => {
      setBusy("Opening PDF…");
      setError("");
      setNotice("");
      try {
        const model = await engine.open(bytes, name, suppliedPassword);
        setDocumentModel(model);
        setFontVersion((version) => version + 1);
        fittedPage.current = "";
        setPageIndex(0);
        setOperations([]);
        setPast([]);
        setFuture([]);
        setSelectedId(null);
        setPasswordOpen(false);
        setPassword("");
        pendingFile.current = null;
        const scanned = model.pages.filter((page) => page.scanned).length;
        if (scanned) {
          setNotice(
            `${scanned} page${scanned === 1 ? "" : "s"} appear to be scanned. PDF Folio can edit detected images, but it does not perform OCR, so text inside scans is not selectable.`,
          );
        }
        const pairs = await Promise.all(
          model.pages.map(async (page) => {
            const thumb = await engine.renderPage(page.index, [], 0.28);
            return [page.index, thumb.url] as const;
          }),
        );
        setThumbnails((old) => {
          Object.values(old).forEach(URL.revokeObjectURL);
          return Object.fromEntries(pairs);
        });
      } catch (reason) {
        if (reason instanceof PasswordRequiredError) {
          pendingFile.current = { bytes, name };
          setPasswordOpen(true);
          if (reason.invalid) setError(reason.message);
        } else {
          setError(messageOf(reason));
        }
      } finally {
        setBusy("");
      }
    },
    [engine],
  );

  const openFile = async (file: File) => {
    if (
      file.type !== "application/pdf" &&
      !file.name.toLowerCase().endsWith(".pdf")
    ) {
      setError("Choose a PDF file.");
      return;
    }
    await loadBytes(new Uint8Array(await file.arrayBuffer()), file.name);
  };

  const openSample = async () => {
    const response = await fetch("/samples/pdf-folio-sample.pdf");
    if (!response.ok) {
      setError("The sample PDF could not be loaded.");
      return;
    }
    await loadBytes(
      new Uint8Array(await response.arrayBuffer()),
      "PDF Folio sample.pdf",
    );
  };

  const exportPdf = async () => {
    if (!documentModel) return;
    setBusy("Exporting…");
    setError("");
    try {
      const bytes = await engine.export(operations);
      const url = URL.createObjectURL(
        new Blob([bytes.slice().buffer as ArrayBuffer], {
          type: "application/pdf",
        }),
      );
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = `${documentModel.name.replace(/\.pdf$/i, "")}-edited.pdf`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice(
        `Exported ${operations.length} edit${operations.length === 1 ? "" : "s"}. Unchanged page content remains in its original PDF structure.`,
      );
    } catch (reason) {
      setError(messageOf(reason));
    } finally {
      setBusy("");
    }
  };

  const addText = () => {
    if (!currentPage) return;
    if (!currentPage.insertable) {
      setError(
        currentPage.insertionLimitation ??
          "This page does not support safe content insertion.",
      );
      return;
    }
    const [x0, y0, x1] = currentPage.bounds;
    const width = Math.min(250, x1 - x0 - 96);
    const operation: TextOperation = {
      id: crypto.randomUUID(),
      kind: "add-text",
      pageIndex,
      rect: [x0 + 48, y0 + 48, x0 + 48 + width, y0 + 72],
      text: "New text",
      fontId: "inter",
      fontName: "Inter",
      fontSize: 16,
      baseline: y0 + 64,
      color: "#163f3b",
    };
    commit([...operations, operation]);
    setSelectedId(operation.id);
  };

  const addImageFromFile = async (file: File) => {
    if (!currentPage) return;
    if (!currentPage.insertable) {
      setError(
        currentPage.insertionLimitation ??
          "This page does not support safe content insertion.",
      );
      return;
    }
    if (!/^image\/(png|jpeg)$/.test(file.type)) {
      setError("PDF Folio accepts PNG and JPEG images.");
      return;
    }
    const [x0, y0, x1, y1] = currentPage.bounds;
    const width = Math.min(180, x1 - x0 - 96);
    const operation: ImageOperation = {
      id: crypto.randomUUID(),
      kind: "add-image",
      pageIndex,
      rect: [
        x0 + 48,
        y0 + 48,
        x0 + 48 + width,
        Math.min(y1 - 48, y0 + 48 + width * 0.67),
      ],
      fileName: file.name,
      imageBytes: new Uint8Array(await file.arrayBuffer()),
    };
    commit([...operations, operation]);
    setSelectedId(operation.id);
  };

  const addCustomFont = async (file: File) => {
    if (!/\.(ttf|otf)$/i.test(file.name)) {
      setError("Choose a TTF or OTF font file.");
      return;
    }
    try {
      const definition = validateAndCreateUploadedFont(
        file.name,
        new Uint8Array(await file.arrayBuffer()),
      );
      engine.addFont(definition);
      if (definition.bytes && "FontFace" in window) {
        const url = URL.createObjectURL(
          new Blob([definition.bytes.slice().buffer as ArrayBuffer]),
        );
        void new FontFace(definition.family, `url(${url})`)
          .load()
          .then((face) => {
            document.fonts.add(face);
            URL.revokeObjectURL(url);
          });
      }
      setFontVersion((version) => version + 1);
      setNotice(
        `${definition.family} is available for this browser session and will be embedded when used.`,
      );
    } catch {
      setError(
        "That font could not be read. Choose a valid, unencrypted TTF or OTF file.",
      );
    }
  };

  if (!documentModel) {
    return (
      <div className="welcome-shell">
        <Header
          onOpen={() => fileInput.current?.click()}
          onExport={exportPdf}
          disabled
          undo={undo}
          redo={redo}
          canUndo={false}
          canRedo={false}
          onInfo={() => setLicenseOpen(true)}
        />
        <main className="welcome-main">
          <section className="welcome-card">
            <div className="welcome-mark">
              <FileText size={30} />
            </div>
            <p className="eyebrow">Private PDF editing</p>
            <h1>
              Edit the page.
              <br />
              Keep the document.
            </h1>
            <p className="welcome-copy">
              Select existing text and images, make precise changes, and export
              a real PDF. Your file stays in this browser.
            </p>
            <div className="welcome-actions">
              <button
                className="primary large"
                onClick={() => fileInput.current?.click()}
              >
                <Upload size={18} /> Open a PDF
              </button>
              <button className="secondary large" onClick={openSample}>
                <FilePlus2 size={18} /> Try the sample
              </button>
            </div>
            <div className="trust-row">
              <ShieldCheck size={16} />
              <span>Browser-local editing</span>
              <span className="dot" /> <span>No upload</span>
              <span className="dot" />
              <span>Real content redaction</span>
            </div>
            {error && <Alert message={error} onClose={() => setError("")} />}
          </section>
          <section className="feature-strip">
            <div>
              <span>01</span>
              <strong>Open</strong>
              <p>PDFs up to 150 MB, including password-protected files.</p>
            </div>
            <div>
              <span>02</span>
              <strong>Edit</strong>
              <p>Text spans and image regions with undo and redo.</p>
            </div>
            <div>
              <span>03</span>
              <strong>Export</strong>
              <p>
                Changes baked into a new PDF; your source remains untouched.
              </p>
            </div>
          </section>
        </main>
        {busy && <Busy label={busy} />}
        {passwordOpen && (
          <PasswordDialog
            password={password}
            setPassword={setPassword}
            error={error}
            onCancel={() => setPasswordOpen(false)}
            onUnlock={() =>
              pendingFile.current &&
              loadBytes(
                pendingFile.current.bytes,
                pendingFile.current.name,
                password,
              )
            }
          />
        )}
        {licenseOpen && <AboutDialog onClose={() => setLicenseOpen(false)} />}
        <input
          ref={fileInput}
          type="file"
          accept="application/pdf,.pdf"
          hidden
          onChange={(event) =>
            event.target.files?.[0] && openFile(event.target.files[0])
          }
        />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Header
        onOpen={() => fileInput.current?.click()}
        onExport={exportPdf}
        disabled={Boolean(busy)}
        undo={undo}
        redo={redo}
        canUndo={Boolean(past.length)}
        canRedo={Boolean(future.length)}
        onInfo={() => setLicenseOpen(true)}
        fileName={documentModel.name}
      />
      <div className="tool-row">
        <div className="tool-group">
          <button onClick={() => fileInput.current?.click()}>
            <Upload size={16} /> Open
          </button>
          <button
            onClick={addText}
            disabled={!currentPage?.insertable}
            title={currentPage?.insertionLimitation}
          >
            <Type size={16} /> Add text
          </button>
          <button
            onClick={() => imageInput.current?.click()}
            disabled={!currentPage?.insertable}
            title={currentPage?.insertionLimitation}
          >
            <ImagePlus size={16} /> Add image
          </button>
        </div>
        <div className="tool-hint">
          <ShieldCheck size={15} /> Changes stay on this device
        </div>
      </div>
      <div className="workspace-grid">
        <aside className="pages-panel">
          <div className="panel-title">
            <span>Pages</span>
            <span>{documentModel.pageCount}</span>
          </div>
          <div className="thumbnail-list">
            {documentModel.pages.map((page) => (
              <button
                key={page.index}
                className={`thumbnail ${page.index === pageIndex ? "active" : ""}`}
                onClick={() => {
                  setPageIndex(page.index);
                  setSelectedId(null);
                }}
              >
                <div className="thumbnail-paper">
                  {thumbnails[page.index] ? (
                    <img
                      src={thumbnails[page.index]}
                      alt={`Page ${page.index + 1}`}
                    />
                  ) : (
                    <div className="thumb-skeleton" />
                  )}
                </div>
                <span>{page.index + 1}</span>
              </button>
            ))}
          </div>
        </aside>
        <main
          ref={stageRef}
          className="document-stage"
          onClick={() => setSelectedId(null)}
        >
          {notice && (
            <Alert
              message={notice}
              kind="notice"
              onClose={() => setNotice("")}
            />
          )}
          {error && <Alert message={error} onClose={() => setError("")} />}
          <div
            className="page-wrap"
            style={
              rendered
                ? {
                    width: rendered.width * zoom,
                    height: rendered.height * zoom,
                  }
                : undefined
            }
          >
            {rendered && (
              <img
                className="page-image"
                src={rendered.url}
                alt={`Page ${pageIndex + 1}`}
              />
            )}
            {rendered && currentPage && (
              <SelectionLayer
                page={currentPage}
                operations={operations.filter(
                  (operation) => operation.pageIndex === pageIndex,
                )}
                selectedId={selectedId}
                onSelect={setSelectedId}
                rendered={rendered}
              />
            )}
          </div>
        </main>
        <aside className="inspector-panel">
          <div className="inspector-head">
            <div>
              <span className="eyebrow">Inspector</span>
              <h2>
                {selected
                  ? selected.kind.includes("text") || selected.kind === "text"
                    ? "Text"
                    : "Image"
                  : "Select an object"}
              </h2>
            </div>
            {selected && (
              <button
                className="icon-button"
                aria-label="Clear selection"
                onClick={() => setSelectedId(null)}
              >
                <X size={17} />
              </button>
            )}
          </div>
          {!selected && <EmptyInspector />}
          {selected &&
            (selected.kind === "text" ||
              selected.kind === "replace-text" ||
              selected.kind === "add-text") && (
              <TextInspector
                key={`${selectedId}-${fontVersion}`}
                selected={selected as TextElement | TextOperation}
                operations={operations}
                fonts={engine.getFonts()}
                commit={commit}
                onSelect={setSelectedId}
                onUploadFont={() => fontInput.current?.click()}
                validateText={(fontId, text, width, size) =>
                  engine.validateText(fontId, text, width, size)
                }
              />
            )}
          {selected &&
            (selected.kind === "image" ||
              selected.kind === "replace-image" ||
              selected.kind === "add-image" ||
              selected.kind === "delete-image") && (
              <ImageInspector
                selected={selected as ImageElement | ImageOperation}
                operations={operations}
                commit={commit}
                onReplace={() => replaceImageInput.current?.click()}
                onSelect={setSelectedId}
              />
            )}
        </aside>
      </div>
      <footer className="status-bar">
        <div>
          <span>
            Page {pageIndex + 1} of {documentModel.pageCount}
          </span>
          <span className="status-separator" />
          <span>
            {operations.length} unsaved edit{operations.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="zoom-control">
          <button
            aria-label="Zoom out"
            onClick={() => setZoom((value) => Math.max(0.45, value - 0.1))}
          >
            <Minus size={15} />
          </button>
          <span>{Math.round(zoom * 135)}%</span>
          <button
            aria-label="Zoom in"
            onClick={() => setZoom((value) => Math.min(1.6, value + 0.1))}
          >
            <Plus size={15} />
          </button>
          <button className="fit-button" onClick={fitWidth}>
            Fit
          </button>
        </div>
      </footer>
      {busy && <Busy label={busy} />}
      {passwordOpen && (
        <PasswordDialog
          password={password}
          setPassword={setPassword}
          error={error}
          onCancel={() => setPasswordOpen(false)}
          onUnlock={() =>
            pendingFile.current &&
            loadBytes(
              pendingFile.current.bytes,
              pendingFile.current.name,
              password,
            )
          }
        />
      )}
      {licenseOpen && <AboutDialog onClose={() => setLicenseOpen(false)} />}
      <input
        ref={fileInput}
        type="file"
        accept="application/pdf,.pdf"
        hidden
        onChange={(event) =>
          event.target.files?.[0] && openFile(event.target.files[0])
        }
      />
      <input
        ref={imageInput}
        type="file"
        accept="image/png,image/jpeg"
        hidden
        onChange={(event) =>
          event.target.files?.[0] && addImageFromFile(event.target.files[0])
        }
      />
      <input
        ref={fontInput}
        type="file"
        accept=".ttf,.otf,font/ttf,font/otf"
        hidden
        onChange={(event) =>
          event.target.files?.[0] && addCustomFont(event.target.files[0])
        }
      />
      <input
        ref={replaceImageInput}
        type="file"
        accept="image/png,image/jpeg"
        hidden
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (
            !file ||
            !selected ||
            (selected.kind !== "image" &&
              selected.kind !== "replace-image" &&
              selected.kind !== "add-image")
          )
            return;
          const bytes = new Uint8Array(await file.arrayBuffer());
          const existing =
            selected.kind === "image"
              ? (operations.find(
                  (operation) =>
                    operation.kind === "replace-image" &&
                    operation.sourceId === selected.id,
                ) as ImageOperation | undefined)
              : (selected as ImageOperation);
          const operation: ImageOperation = existing
            ? {
                ...existing,
                imageBytes: bytes,
                fileName: file.name,
                kind:
                  existing.kind === "add-image" ? "add-image" : "replace-image",
              }
            : {
                id: crypto.randomUUID(),
                kind: "replace-image",
                pageIndex: selected.pageIndex,
                rect: selected.rect,
                sourceRect: selected.rect,
                sourceId: selected.id,
                imageBytes: bytes,
                fileName: file.name,
              };
          commit(
            existing
              ? operations.map((item) =>
                  item.id === existing.id ? operation : item,
                )
              : [...operations, operation],
          );
          setSelectedId(operation.id);
          event.target.value = "";
        }}
      />
    </div>
  );
}

function Header({
  onOpen,
  onExport,
  disabled,
  undo,
  redo,
  canUndo,
  canRedo,
  onInfo,
  fileName,
}: {
  onOpen: () => void;
  onExport: () => void;
  disabled: boolean;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onInfo: () => void;
  fileName?: string;
}) {
  return (
    <header className="app-header">
      <button className="brand" onClick={onOpen} aria-label="Open a PDF">
        <span className="brand-mark">PF</span>
        <span>PDF Folio</span>
        <small>EDITOR</small>
      </button>
      <div className="file-title">
        {fileName ?? "A quieter way to edit PDFs"}
      </div>
      <div className="header-actions">
        <button
          className="icon-button"
          onClick={undo}
          disabled={!canUndo}
          aria-label="Undo"
        >
          <Undo2 size={18} />
        </button>
        <button
          className="icon-button"
          onClick={redo}
          disabled={!canRedo}
          aria-label="Redo"
        >
          <Redo2 size={18} />
        </button>
        <button
          className="icon-button"
          onClick={onInfo}
          aria-label="About and licenses"
        >
          <Info size={18} />
        </button>
        {fileName && (
          <button className="primary" onClick={onExport} disabled={disabled}>
            <Download size={17} /> Export PDF
          </button>
        )}
      </div>
    </header>
  );
}

function SelectionLayer({
  page,
  operations,
  selectedId,
  onSelect,
  rendered,
}: {
  page: NonNullable<DocumentModel["pages"][number]>;
  operations: EditOperation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  rendered: RenderedPage;
}) {
  void rendered;
  const pageWidth = page.bounds[2] - page.bounds[0];
  const pageHeight = page.bounds[3] - page.bounds[1];
  const editedSources = new Set(
    operations.map((operation) => operation.sourceId).filter(Boolean),
  );
  const items: Array<PageElement | EditOperation> = [
    ...page.elements.filter((element) => !editedSources.has(element.id)),
    ...operations.filter((operation) => operation.kind !== "delete-image"),
  ];
  return (
    <div className="selection-layer">
      {items.map((item) => {
        const [x0, y0, x1, y1] = item.rect;
        const isText =
          item.kind === "text" ||
          item.kind === "replace-text" ||
          item.kind === "add-text";
        const disabled = item.kind === "text" && !item.editable;
        return (
          <button
            key={item.id}
            className={`object-hit ${isText ? "text-hit" : "image-hit"} ${selectedId === item.id ? "selected" : ""} ${disabled ? "locked" : ""}`}
            style={{
              left: `${((x0 - page.bounds[0]) / pageWidth) * 100}%`,
              top: `${((y0 - page.bounds[1]) / pageHeight) * 100}%`,
              width: `${Math.max(0.4, ((x1 - x0) / pageWidth) * 100)}%`,
              height: `${Math.max(0.4, ((y1 - y0) / pageHeight) * 100)}%`,
            }}
            onClick={(event) => {
              event.stopPropagation();
              onSelect(item.id);
            }}
            title={
              disabled ? item.limitation : `Select ${isText ? "text" : "image"}`
            }
          >
            <span>{isText ? "Text" : "Image"}</span>
          </button>
        );
      })}
    </div>
  );
}

function TextInspector({
  selected,
  operations,
  fonts,
  commit,
  onSelect,
  onUploadFont,
  validateText,
}: {
  selected: TextElement | TextOperation;
  operations: EditOperation[];
  fonts: FontDefinition[];
  commit: (items: EditOperation[]) => void;
  onSelect: (id: string) => void;
  onUploadFont: () => void;
  validateText: (
    fontId: string,
    text: string,
    width: number,
    size: number,
  ) => Promise<{ requiredHeight: number }>;
}) {
  const existing =
    selected.kind === "text"
      ? (operations.find(
          (operation) =>
            operation.kind === "replace-text" &&
            operation.sourceId === selected.id,
        ) as TextOperation | undefined)
      : selected;
  const original = selected.kind === "text" ? selected : undefined;
  const [text, setText] = useState(existing?.text ?? original?.text ?? "");
  const initialFont =
    existing?.fontId ??
    (original?.fontId ??
      (original ? suggestedFontId(original.fontName) : "inter") ??
      "");
  const [fontId, setFontId] = useState(initialFont);
  const [fontSize, setFontSize] = useState(
    existing?.fontSize ?? original?.fontSize ?? 16,
  );
  const [color, setColor] = useState(
    existing?.color ?? original?.color ?? "#1f2422",
  );
  const [draftRect, setDraftRect] = useState<Rect>(
    existing?.rect ?? selected.rect,
  );
  const [validationError, setValidationError] = useState("");
  const [validating, setValidating] = useState(false);
  const chosen = fonts.find((font) => font.id === fontId);
  const preserve = original
    ? Boolean(
        chosen &&
          (chosen.id === original.fontId ||
        canPreserveOriginal(original.fontName, fontId))
      )
    : false;
  if (original && !original.editable)
    return (
      <div className="limitation-card">
        <LockKeyhole size={20} />
        <strong>View-only text</strong>
        <p>{original.limitation}</p>
      </div>
    );
  const apply = async () => {
    if (!chosen) {
      setValidationError(
        "Choose a font. Upload the matching TTF/OTF to preserve an unavailable original face.",
      );
      return;
    }
    if (
      !Number.isFinite(fontSize) ||
      fontSize < 4 ||
      fontSize > 144 ||
      text.length > 5000
    )
      return;
    setValidating(true);
    setValidationError("");
    try {
      const currentRect = draftRect;
      const validation = await validateText(
        fontId,
        text,
        currentRect[2] - currentRect[0],
        fontSize,
      );
      const rect: Rect = [
        currentRect[0],
        currentRect[1],
        currentRect[2],
        Math.max(currentRect[3], currentRect[1] + validation.requiredHeight),
      ];
      const operation: TextOperation = existing
        ? {
            ...existing,
            rect,
            text,
            fontId,
            fontName: chosen.family,
            fontSize,
            color,
          }
        : {
            id: crypto.randomUUID(),
            kind: "replace-text",
            pageIndex: selected.pageIndex,
            rect,
            sourceRect: selected.rect,
            baseline: original?.baseline,
            sourceId: selected.id,
            text,
            fontId,
            fontName: chosen.family,
            fontSize,
            color,
          };
      commit(
        existing
          ? operations.map((item) =>
              item.id === existing.id ? operation : item,
            )
          : [...operations, operation],
      );
      onSelect(operation.id);
    } catch (reason) {
      setValidationError(messageOf(reason));
    } finally {
      setValidating(false);
    }
  };
  const removeAdded = () => {
    if (selected.kind === "add-text") {
      commit(operations.filter((item) => item.id !== selected.id));
      onSelect("");
    }
  };
  return (
    <div className="inspector-body">
      {original && (
        <div className="source-chip">
          Original: {original.fontName} · {original.fontSize.toFixed(1)} pt
        </div>
      )}
      <label className="field">
        <span>Text</span>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={4}
        />
      </label>
      <label className="field">
        <span>Font</span>
        <FontPicker fonts={fonts} value={fontId} onChange={setFontId} />
      </label>
      <button className="upload-font" onClick={onUploadFont}>
        <Plus size={15} /> Upload TTF / OTF
      </button>
      {original && (
        <div className={`font-status ${preserve ? "preserved" : ""}`}>
          {preserve ? <Check size={14} /> : <AlertCircle size={14} />}
          <span>
            {preserve
              ? chosen?.documentFontKey
                ? `${original.fontAvailabilityReason}. New text is checked against the exact embedded glyphs before applying.`
                : `Using the exact PDF base font for ${original.fontName}.`
              : chosen
                ? `Using ${chosen.family} as an explicit replacement for ${original.fontName}.`
                : original.fontAvailabilityReason}
          </span>
        </div>
      )}
      <div className="field-grid">
        <label className="field">
          <span>Size</span>
          <div className="suffix-input">
            <input
              type="number"
              min="4"
              max="144"
              step="0.5"
              value={fontSize}
              onChange={(event) => setFontSize(Number(event.target.value))}
            />
            <span>pt</span>
          </div>
        </label>
        <label className="field">
          <span>Color</span>
          <div className="color-input">
            <input
              type="color"
              value={color}
              onChange={(event) => setColor(event.target.value)}
            />
            <input
              value={color.toUpperCase()}
              readOnly
              aria-label="Hex color"
            />
          </div>
        </label>
      </div>
      <RectFields
        rect={draftRect}
        onChange={setDraftRect}
        disabled={!existing}
      />
      {(!Number.isFinite(fontSize) || fontSize < 4 || fontSize > 144) && (
        <p className="validation-error">Enter a font size from 4 to 144 pt.</p>
      )}
      {text.length > 5000 && (
        <p className="validation-error">
          Text boxes are limited to 5,000 characters.
        </p>
      )}
      {validationError && <p className="validation-error">{validationError}</p>}
      <button
        className="primary inspector-apply"
        disabled={
          validating ||
          !chosen ||
          !Number.isFinite(fontSize) ||
          fontSize < 4 ||
          fontSize > 144 ||
          text.length > 5000
        }
        onClick={apply}
      >
        <Check size={16} />{" "}
        {validating ? "Checking font…" : "Apply text change"}
      </button>
      {selected.kind === "add-text" && (
        <button className="danger-text" onClick={removeAdded}>
          <Trash2 size={15} /> Remove text box
        </button>
      )}
      <p className="session-note">
        Uploaded fonts remain in this session only. Fonts used in the document
        are embedded in the exported PDF.
      </p>
    </div>
  );
}

function ImageInspector({
  selected,
  operations,
  commit,
  onReplace,
  onSelect,
}: {
  selected: ImageElement | ImageOperation;
  operations: EditOperation[];
  commit: (items: EditOperation[]) => void;
  onReplace: () => void;
  onSelect: (id: string) => void;
}) {
  const existing =
    selected.kind === "image"
      ? (operations.find(
          (operation) =>
            (operation.kind === "replace-image" ||
              operation.kind === "delete-image") &&
            operation.sourceId === selected.id,
        ) as ImageOperation | undefined)
      : selected;
  const rect = existing?.rect ?? selected.rect;
  const updateRect = (next: Rect) => {
    if (existing) {
      commit(
        operations.map((item) =>
          item.id === existing.id ? { ...existing, rect: next } : item,
        ),
      );
    } else if (selected.kind === "image") {
      const operation: ImageOperation = {
        id: crypto.randomUUID(),
        kind: "replace-image",
        pageIndex: selected.pageIndex,
        sourceId: selected.id,
        sourceRect: selected.rect,
        rect: next,
        imageBytes: selected.imageBytes,
        fileName: "Original image",
      };
      commit([...operations, operation]);
      onSelect(operation.id);
    }
  };
  if (selected.kind === "image" && !selected.editable)
    return (
      <div className="limitation-card">
        <LockKeyhole size={20} />
        <strong>View-only image</strong>
        <p>{selected.limitation}</p>
      </div>
    );
  const remove = () => {
    if (selected.kind === "add-image") {
      commit(operations.filter((item) => item.id !== selected.id));
    } else {
      const source = selected.kind === "image" ? selected : undefined;
      const deletion: ImageOperation = existing
        ? { ...existing, kind: "delete-image", imageBytes: undefined }
        : {
            id: crypto.randomUUID(),
            kind: "delete-image",
            pageIndex: selected.pageIndex,
            rect: selected.rect,
            sourceRect: selected.rect,
            sourceId: source?.id,
          };
      commit(
        existing
          ? operations.map((item) =>
              item.id === existing.id ? deletion : item,
            )
          : [...operations, deletion],
      );
    }
    onSelect("");
  };
  return (
    <div className="inspector-body">
      <div className="image-summary">
        <FileImage size={22} />
        <div>
          <strong>
            {existing?.fileName ??
              (selected.kind === "image"
                ? `${selected.width} × ${selected.height} source image`
                : "Inserted image")}
          </strong>
          <span>
            {Math.round(rect[2] - rect[0])} × {Math.round(rect[3] - rect[1])} pt
            on page
          </span>
        </div>
      </div>
      <button className="secondary full" onClick={onReplace}>
        <Upload size={16} />{" "}
        {selected.kind === "add-image"
          ? "Choose another image"
          : "Replace image"}
      </button>
      <RectFields rect={rect} onChange={updateRect} />
      <button className="danger-text" onClick={remove}>
        <Trash2 size={15} /> Delete image
      </button>
    </div>
  );
}

function FontPicker({
  fonts,
  value,
  onChange,
}: {
  fonts: FontDefinition[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = fonts.find((font) => font.id === value);
  const matches = fonts.filter((font) =>
    `${font.family} ${font.category} ${font.coverage}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <div className="font-picker">
      <button
        type="button"
        className="font-picker-trigger"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        <span
          style={{
            fontFamily: selected?.documentFontKey ? undefined : selected?.family,
          }}
        >
          {selected?.family ?? "Choose or upload a font…"}
        </span>
        <ChevronDown size={15} />
      </button>
      {open && (
        <div className="font-menu">
          <div className="font-search">
            <Search size={14} />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Search ${fonts.length} fonts`}
            />
          </div>
          <div className="font-results">
            {matches.map((font) => (
              <button
                type="button"
                key={font.id}
                className={font.id === value ? "active" : ""}
                onClick={() => {
                  onChange(font.id);
                  setOpen(false);
                  setQuery("");
                }}
              >
                <span
                  style={{
                    fontFamily: font.documentFontKey ? undefined : font.family,
                  }}
                >
                  {font.family}
                </span>
                <small>
                  {font.documentFontKey
                    ? `Original PDF only · ${font.coverage}`
                    : `${font.category} · ${font.coverage}`}
                </small>
              </button>
            ))}
            {!matches.length && <p>No fonts match “{query}”.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function RectFields({
  rect,
  onChange,
  disabled,
}: {
  rect: Rect;
  onChange: (rect: Rect) => void;
  disabled?: boolean;
}) {
  const [x0, y0, x1, y1] = rect;
  const update = (key: "x" | "y" | "w" | "h", value: number) => {
    if (!Number.isFinite(value) || Math.abs(value) > 20_000) return;
    const width = x1 - x0;
    const height = y1 - y0;
    if (key === "x") onChange([value, y0, value + width, y1]);
    if (key === "y") onChange([x0, value, x1, value + height]);
    if (key === "w") onChange([x0, y0, x0 + Math.max(1, value), y1]);
    if (key === "h") onChange([x0, y0, x1, y0 + Math.max(1, value)]);
  };
  return (
    <fieldset className="position-grid" disabled={disabled}>
      <legend>Position & size</legend>
      {[
        ["X", "x", x0],
        ["Y", "y", y0],
        ["W", "w", x1 - x0],
        ["H", "h", y1 - y0],
      ].map(([label, key, value]) => (
        <label key={String(key)}>
          <span>{label}</span>
          <input
            type="number"
            value={Math.round(Number(value) * 10) / 10}
            onChange={(event) =>
              update(key as "x" | "y" | "w" | "h", Number(event.target.value))
            }
          />
        </label>
      ))}
    </fieldset>
  );
}

function EmptyInspector() {
  return (
    <div className="empty-inspector">
      <div className="selection-illustration">
        <span />
        <span />
        <span />
        <Search size={22} />
      </div>
      <strong>Choose text or an image</strong>
      <p>
        Hover the page to reveal editable regions, then select one to adjust it
        here.
      </p>
      <div className="legend">
        <span>
          <i className="text-legend" /> Text span
        </span>
        <span>
          <i className="image-legend" /> Image
        </span>
      </div>
    </div>
  );
}

function Alert({
  message,
  onClose,
  kind = "error",
}: {
  message: string;
  onClose: () => void;
  kind?: "error" | "notice";
}) {
  return (
    <div className={`alert ${kind}`}>
      <AlertCircle size={17} />
      <span>{message}</span>
      <button onClick={onClose} aria-label="Dismiss">
        <X size={15} />
      </button>
    </div>
  );
}

function Busy({ label }: { label: string }) {
  return (
    <div className="busy">
      <div className="spinner" />
      <span>{label}</span>
    </div>
  );
}

function PasswordDialog({
  password,
  setPassword,
  error,
  onCancel,
  onUnlock,
}: {
  password: string;
  setPassword: (value: string) => void;
  error: string;
  onCancel: () => void;
  onUnlock: () => void;
}) {
  return (
    <div className="modal-backdrop">
      <form
        className="dialog"
        onSubmit={(event) => {
          event.preventDefault();
          onUnlock();
        }}
      >
        <div className="dialog-icon">
          <LockKeyhole size={22} />
        </div>
        <h2>Password required</h2>
        <p>
          This PDF is encrypted. The password is used in memory and never leaves
          your browser.
        </p>
        <label className="field">
          <span>PDF password</span>
          <input
            autoFocus
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error && <small className="dialog-error">{error}</small>}
        <div className="dialog-actions">
          <button type="button" className="secondary" onClick={onCancel}>
            Cancel
          </button>
          <button className="primary" type="submit">
            Unlock PDF
          </button>
        </div>
      </form>
    </div>
  );
}

function AboutDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop">
      <div className="dialog about">
        <button className="dialog-close" onClick={onClose}>
          <X size={18} />
        </button>
        <p className="eyebrow">About PDF Folio</p>
        <h2>Private by design</h2>
        <p>
          PDF Folio opens, edits, and exports PDFs entirely in your browser. No
          document data is sent to a server.
        </p>
        <h3>Engine license</h3>
        <p>
          PDF Folio and MuPDF.js are distributed under the GNU Affero General
          Public License v3 or later. The complete application source and build
          instructions are publicly available. Artifex also offers commercial
          MuPDF licensing for deployments outside AGPL terms.
        </p>
        <a
          href="https://github.com/blaporta1/pdf-folio"
          target="_blank"
          rel="noreferrer"
        >
          PDF Folio corresponding source ↗
        </a>
        <br />
        <a href="/LICENSE.txt" target="_blank" rel="noreferrer">
          Read the GNU AGPLv3 license ↗
        </a>
        <br />
        <a
          href="https://www.mupdf.com/licensing/index.html"
          target="_blank"
          rel="noreferrer"
        >
          MuPDF licensing and source availability ↗
        </a>
        <h3>Bundled fonts</h3>
        <p>
          PDF Folio includes 18 curated open-source families under the SIL Open
          Font License 1.1, plus the standard PDF base fonts. Upload a TTF or
          OTF for another typeface or script.
        </p>
        <a href="/fonts/OFL-1.1.txt" target="_blank" rel="noreferrer">
          Read the SIL Open Font License ↗
        </a>
        <button className="primary full" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}

function messageOf(reason: unknown) {
  return reason instanceof Error
    ? reason.message
    : "Something went wrong while processing this PDF.";
}

export default App;
