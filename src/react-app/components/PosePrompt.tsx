import { useEffect, useRef, useState } from "react";
import "../styles/Clipboard.css";

type PosePromptEntry = {
	id: number;
	title: string | null;
	content: string | null;
	updated_at: string;
	order: number;
};

const SAMPLE_DATA: PosePromptEntry[] = [
	{
		id: 1,
		title: "Portrait Pose",
		content: "Elegant standing pose, slight head tilt, soft smile, studio key light.",
		updated_at: "2026-08-27T10:30:00Z",
		order: 3,
	},
	{
		id: 2,
		title: "Action Pose",
		content: "Dynamic running pose, low camera angle, motion blur in background.",
		updated_at: "2026-08-27T09:15:00Z",
		order: 2,
	},
	{
		id: 3,
		title: "Product Pose",
		content: "Hands presenting product at chest height, neutral backdrop, crisp shadows.",
		updated_at: "2026-08-27T08:45:00Z",
		order: 1,
	},
];

const ENVIRONMENT = import.meta.env.VITE_ENVIRONMENT?.trim() || "production";
const JSON_SOURCE_URL = "/pose-prompt/entries.json";
const API_SOURCE_URL = "/api/pose-prompt";
const isLocalMode = ENVIRONMENT === "local";
const SYSTEM: 0 | 1 = isLocalMode ? 0 : 1;

type PosePromptProps = {
	embedded?: boolean;
};

export function PosePrompt({ embedded }: PosePromptProps) {
	const [rows, setRows] = useState<PosePromptEntry[]>([]);
	const [selectedId, setSelectedId] = useState<number | null>(null);
	const [title, setTitle] = useState("");
	const [content, setContent] = useState("");
	const [status, setStatus] = useState("");
	const [statusKind, setStatusKind] = useState("");
	const [updatedAt, setUpdatedAt] = useState("Not saved");
	const [formTitle, setFormTitle] = useState("New Entry");
	const [draggedItem, setDraggedItem] = useState<number | null>(null);
	const [showEditorFields, setShowEditorFields] = useState(true);
	const [copiedSentenceMemory, setCopiedSentenceMemory] = useState<Record<string, number[]>>({});
	const contentTextareaRef = useRef<HTMLTextAreaElement | null>(null);

	useEffect(() => {
		fetchList();
	}, []);

	const autoResizeContentTextarea = () => {
		const textarea = contentTextareaRef.current;
		if (!textarea) return;
		textarea.style.height = "auto";
		textarea.style.height = `${textarea.scrollHeight}px`;
	};

	useEffect(() => {
		autoResizeContentTextarea();
	}, [content, showEditorFields]);

	const formatDate = (value: string | null | undefined) => {
		if (!value) return "Not saved";
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return String(value);
		return `Updated ${date.toLocaleString()}`;
	};

	const setStatusMessage = (message: string, kind: string = "") => {
		setStatus(message);
		setStatusKind(kind);
	};

	const fetchList = async () => {
		setStatusMessage("Loading...", "");
		try {
			let data: PosePromptEntry[];

			if (SYSTEM === 0) {
				const res = await fetch(JSON_SOURCE_URL, { cache: "no-store" });
				const text = await res.text();

				let jsonData;
				try {
					jsonData = JSON.parse(text);
				} catch {
					throw new Error(`Invalid JSON from local file: ${text.substring(0, 50)}`);
				}

				if (!res.ok) {
					throw new Error(`${res.status} Error loading from local JSON`);
				}

				data = Array.isArray(jsonData) ? jsonData : [];
			} else {
				const res = await fetch(API_SOURCE_URL, { cache: "no-store" });
				const text = await res.text();

				let jsonData;
				try {
					jsonData = JSON.parse(text);
				} catch {
					throw new Error(`Invalid JSON from API: ${text.substring(0, 50)}`);
				}

				if (!res.ok) throw new Error(jsonData.error || "Failed to load entries");
				data = Array.isArray(jsonData) ? jsonData : [];
			}

			setRows(data);

			if (data.length && selectedId === null) {
				selectRowById(data[0].id);
			} else if (selectedId !== null) {
				const exists = data.some((r) => r.id === selectedId);
				if (exists) selectRowById(selectedId);
				else clearForm();
			}

			setStatusMessage("Loaded.", "ok");
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			setStatusMessage(message, "error");
		}
	};

	const selectRowById = (id: number) => {
		const row = rows.find((r) => r.id === id);
		if (!row) return;
		setSelectedId(row.id);
		setTitle(row.title || "");
		setContent(row.content || "");
		setUpdatedAt(formatDate(row.updated_at));
		setFormTitle(`Editing #${row.id}`);
	};

	const clearForm = () => {
		setSelectedId(null);
		setTitle("");
		setContent("");
		setUpdatedAt("Not saved");
		setFormTitle("New Entry");
	};

	const addEntry = async () => {
		setStatusMessage("Adding...", "");
		try {
			let data: PosePromptEntry;

			if (SYSTEM === 0) {
				const newId = Math.max(...SAMPLE_DATA.map((r) => r.id), 0) + 1;
				const newOrder = Math.max(...SAMPLE_DATA.map((r) => r.order || 0), 0) + 1;
				data = {
					id: newId,
					title: title || null,
					content: content || null,
					updated_at: new Date().toISOString(),
					order: newOrder,
				};
				SAMPLE_DATA.push(data);
			} else {
				const res = await fetch(API_SOURCE_URL, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						title: title || null,
						content: content || null,
					}),
				});
				const jsonData = await res.json();
				if (!res.ok) throw new Error(jsonData.error || "Failed to add entry");
				data = jsonData;
			}

			await fetchList();
			selectRowById(data.id);
			setStatusMessage("Added successfully.", "ok");
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			setStatusMessage(message, "error");
		}
	};

	const updateEntry = async () => {
		if (!selectedId) {
			setStatusMessage("Select an entry to update.", "error");
			return;
		}

		setStatusMessage("Updating...", "");
		try {
			let data: PosePromptEntry;

			if (SYSTEM === 0) {
				const entry = SAMPLE_DATA.find((r) => r.id === selectedId);
				if (!entry) throw new Error("Entry not found");
				entry.title = title || null;
				entry.content = content || null;
				entry.updated_at = new Date().toISOString();
				data = entry;
			} else {
				const res = await fetch(`${API_SOURCE_URL}/${selectedId}`, {
					method: "PUT",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						title: title || null,
						content: content || null,
					}),
				});
				const jsonData = await res.json();
				if (!res.ok) throw new Error(jsonData.error || "Failed to update entry");
				data = jsonData;
			}

			await fetchList();
			selectRowById(data.id);
			setStatusMessage("Updated successfully.", "ok");
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			setStatusMessage(message, "error");
		}
	};

	const deleteEntry = async () => {
		if (!selectedId) {
			setStatusMessage("Select an entry to delete.", "error");
			return;
		}
		if (!confirm("Delete this pose prompt entry?")) return;

		setStatusMessage("Deleting...", "");
		try {
			if (SYSTEM === 0) {
				const index = SAMPLE_DATA.findIndex((r) => r.id === selectedId);
				if (index === -1) throw new Error("Entry not found");
				SAMPLE_DATA.splice(index, 1);
			} else {
				const res = await fetch(`${API_SOURCE_URL}/${selectedId}`, {
					method: "DELETE",
				});
				const jsonData = await res.json();
				if (!res.ok) throw new Error(jsonData.error || "Failed to delete entry");
			}

			clearForm();
			await fetchList();
			setStatusMessage("Deleted successfully.", "ok");
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			setStatusMessage(message, "error");
		}
	};

	const copyContent = async () => {
		try {
			await navigator.clipboard.writeText(content || "");
			setStatusMessage("Content copied.", "ok");
		} catch {
			setStatusMessage("Clipboard access is blocked by the browser.", "error");
		}
	};

	const copySentence = async (sentence: string, index: number) => {
		try {
			await navigator.clipboard.writeText(sentence);
			const memoryKey = selectedId !== null
				? `id:${selectedId}`
				: `title:${title.trim().toLowerCase() || "draft"}`;
			setCopiedSentenceMemory((prev) => {
				const current = prev[memoryKey] || [];
				if (current.includes(index)) {
					return prev;
				}
				return {
					...prev,
					[memoryKey]: [...current, index],
				};
			});
			setStatusMessage("Sentence copied.", "ok");
		} catch {
			setStatusMessage("Clipboard access is blocked by the browser.", "error");
		}
	};

	const undoSentenceStrike = (index: number) => {
		const memoryKey = selectedId !== null
			? `id:${selectedId}`
			: `title:${title.trim().toLowerCase() || "draft"}`;
		setCopiedSentenceMemory((prev) => {
			const current = prev[memoryKey] || [];
			if (!current.includes(index)) {
				return prev;
			}
			const nextIndexes = current.filter((item) => item !== index);
			return {
				...prev,
				[memoryKey]: nextIndexes,
			};
		});
		setStatusMessage("Sentence unmarked.", "ok");
	};

	const parseCompletedSentences = (value: string) => {
		const normalized = value.replace(/\r\n/g, "\n").trim();
		if (!normalized) return [] as string[];

		const indexedPattern = /(?:^|\n)\s*\d+\.\s*[\s\S]*?(?=(?:\n\s*\d+\.\s)|$)/g;
		const indexedMatches = normalized.match(indexedPattern);
		if (indexedMatches && indexedMatches.length > 0) {
			return indexedMatches
				.map((block) => block.replace(/^\s*\d+\.\s*/, "").trim())
				.filter(Boolean);
		}

		const lineBlocks = normalized
			.split(/\n+/)
			.map((line) => line.trim())
			.filter(Boolean);

		const sentenceBlocks = lineBlocks.flatMap((line) => {
			const matches = line.match(/[^.!?]+[.!?]+(?:["')\]]+)?/g);
			if (matches && matches.length > 0) {
				return matches.map((sentence) => sentence.trim()).filter(Boolean);
			}
			return [line];
		});

		return sentenceBlocks;
	};

	const completedSentences = parseCompletedSentences(content);
	const activeMemoryKey = selectedId !== null
		? `id:${selectedId}`
		: `title:${title.trim().toLowerCase() || "draft"}`;
	const copiedSentenceIndexes = new Set(copiedSentenceMemory[activeMemoryKey] || []);

	const handleDragStart = (id: number) => {
		setDraggedItem(id);
	};

	const handleDragOver = (e: React.DragEvent) => {
		e.preventDefault();
		e.dataTransfer.dropEffect = "move";
	};

	const handleDrop = (targetId: number) => {
		if (!draggedItem || draggedItem === targetId) {
			setDraggedItem(null);
			return;
		}

		const draggedIndex = rows.findIndex((r) => r.id === draggedItem);
		const targetIndex = rows.findIndex((r) => r.id === targetId);

		if (draggedIndex !== -1 && targetIndex !== -1) {
			const newRows = [...rows];
			const [removed] = newRows.splice(draggedIndex, 1);
			newRows.splice(targetIndex, 0, removed);
			setRows(newRows);
			updateRowOrders(newRows);
		}

		setDraggedItem(null);
	};

	const updateRowOrders = async (updatedRows: PosePromptEntry[]) => {
		const updates = updatedRows.map((row, index) => ({
			id: row.id,
			order: updatedRows.length - index,
		}));

		for (const update of updates) {
			try {
				if (SYSTEM === 0) {
					const entry = SAMPLE_DATA.find((r) => r.id === update.id);
					if (entry) {
						entry.order = update.order;
					}
				} else {
					const rowData = updatedRows.find((r) => r.id === update.id);
					if (rowData) {
						await fetch(`${API_SOURCE_URL}/${update.id}`, {
							method: "PUT",
							headers: { "content-type": "application/json" },
							body: JSON.stringify({
								title: rowData.title,
								content: rowData.content,
								order: update.order,
							}),
						});
					}
				}
			} catch {
				// keep same behavior as clipboard UI (ignore row-level order update errors)
			}
		}
	};

	return (
		<div className={`clipboard-wrapper ${embedded ? "embedded" : ""}`}>
			<div className="clipboard-container">
				<header className="page-head">
					<div>
						<h1 className="page-title">Pose Prompt Workspace</h1>
						<p className="page-sub">Editing workspace with add, update, delete and copy actions.</p>
						<small style={{ marginTop: "8px", display: "block", color: "#8f9aaa" }}>
							Mode: <strong>{isLocalMode ? "Local JSON File" : "Production API"}</strong>
						</small>
					</div>
				</header>

				<div className="shell">
					<aside className="panel left">
						<div className="toolbar">
							<button type="button" className="btn secondary" onClick={fetchList}>
								Refresh
							</button>
							<button type="button" className="btn primary" onClick={clearForm}>
								New
							</button>
						</div>

						<div className="list">
							{rows.length === 0 ? (
								<div className="empty-state">No pose prompt entries yet.</div>
							) : (
								rows.map((row) => (
									<button
										key={row.id}
										type="button"
										className={`item ${selectedId === row.id ? "active" : ""} ${draggedItem === row.id ? "dragging" : ""}`}
										draggable
										onDragStart={() => handleDragStart(row.id)}
										onDragOver={handleDragOver}
										onDrop={() => handleDrop(row.id)}
										onClick={() => selectRowById(row.id)}
									>
										<div className="item-title">{row.title || "(untitled)"}</div>
									</button>
								))
							)}
						</div>
					</aside>

					<section className="panel right">
						<div className="form-header">
							<strong className="form-title">{formTitle}</strong>
							<div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
								<button
									type="button"
									className="btn secondary"
									onClick={() => setShowEditorFields((prev) => !prev)}
								>
									{showEditorFields ? "Hide Fields" : "Show Fields"}
								</button>
								<span className="chip">{updatedAt}</span>
							</div>
						</div>

						<div className="form">
							<div className="actions">
								<button type="button" className="btn primary" onClick={addEntry}>
									Add
								</button>
								<button type="button" className="btn secondary" onClick={updateEntry}>
									Update
								</button>
								<button type="button" className="btn danger" onClick={deleteEntry}>
									Delete
								</button>
								<button type="button" className="btn secondary" onClick={copyContent}>
									Copy
								</button>
							</div>

							{showEditorFields ? (
								<>
									<div className="form-group">
										<label htmlFor="pose-prompt-title">Title</label>
										<input
											id="pose-prompt-title"
											type="text"
											placeholder="Optional title"
											value={title}
											onChange={(e) => setTitle(e.target.value)}
										/>
									</div>

									<div className="form-group">
										<label htmlFor="pose-prompt-content">Content</label>
										<textarea
											id="pose-prompt-content"
											ref={contentTextareaRef}
											placeholder="Paste or write content here..."
											value={content}
											onChange={(e) => setContent(e.target.value)}
											onInput={autoResizeContentTextarea}
										/>
									</div>
								</>
							) : null}

							{completedSentences.length > 0 ? (
								<div className="sentence-list" aria-label="Completed sentences">
									{completedSentences.map((sentence, index) => (
										<div key={`${sentence}-${index}`} className={`sentence-item ${copiedSentenceIndexes.has(index) ? "copied" : ""}`}>
											<div className="sentence-row">
												<div className="sentence-text">{`${index + 1}. ${sentence}`}</div>
												{copiedSentenceIndexes.has(index) ? (
													<button
														type="button"
														className="btn secondary sentence-copy-btn"
														onClick={() => undoSentenceStrike(index)}
													>
														Undo
													</button>
												) : (
													<button
														type="button"
														className="btn secondary sentence-copy-btn"
														onClick={() => copySentence(sentence, index)}
													>
														Copy
													</button>
												)}
											</div>
											<hr className="sentence-divider" />
										</div>
									))}
								</div>
							) : null}

							<div className={`status ${statusKind}`}>{status}</div>
						</div>
					</section>
				</div>
			</div>
		</div>
	);
}
