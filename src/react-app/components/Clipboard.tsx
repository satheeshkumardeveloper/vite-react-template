import { useEffect, useState } from "react";
import "../styles/Clipboard.css";

type ClipboardEntry = {
	id: number;
	title: string | null;
	content: string | null;
	updated_at: string;
	order: number;
};

const SAMPLE_DATA: ClipboardEntry[] = [
	{
		id: 1,
		title: "API Response",
		content: "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
		updated_at: "2026-08-27T10:30:00Z",
		order: 3,
	},
	{
		id: 2,
		title: "Quick Note",
		content: "Remember to update the documentation tomorrow.",
		updated_at: "2026-08-27T09:15:00Z",
		order: 2,
	},
	{
		id: 3,
		title: "Code Snippet",
		content: 'const hello = () => console.log("Hello, world!");',
		updated_at: "2026-08-27T08:45:00Z",
		order: 1,
	},
];

// 0 = Local/Dev (use sample data), 1 = Production (use API)
const ENVIRONMENT = import.meta.env.VITE_ENVIRONMENT?.trim() || "production";
const JSON_SOURCE_URL = "/clipboard/entries.json";
const API_SOURCE_URL = "/api/clipboard";
const isLocalMode = ENVIRONMENT === "local";
const SYSTEM: 0 | 1 = isLocalMode ? 0 : 1;

type ClipboardProps = {
	embedded?: boolean;
};

export function Clipboard({ embedded }: ClipboardProps) {
	const [rows, setRows] = useState<ClipboardEntry[]>([]);
	const [selectedId, setSelectedId] = useState<number | null>(null);
	const [title, setTitle] = useState("");
	const [content, setContent] = useState("");
	const [status, setStatus] = useState("");
	const [statusKind, setStatusKind] = useState("");
	const [updatedAt, setUpdatedAt] = useState("Not saved");
	const [formTitle, setFormTitle] = useState("New Entry");
	const [draggedItem, setDraggedItem] = useState<number | null>(null);

	useEffect(() => {
		fetchList();
	}, []);

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
			let data: ClipboardEntry[];

			if (SYSTEM === 0) {
				// Local/Dev mode - load from JSON file
				console.log("Loading from local JSON file:", JSON_SOURCE_URL);
				const res = await fetch(JSON_SOURCE_URL, { cache: "no-store" });
				const text = await res.text();
				console.log("Response status:", res.status);
				console.log("Response text (first 200 chars):", text.substring(0, 200));

				let jsonData;
				try {
					jsonData = JSON.parse(text);
				} catch (parseErr) {
					console.error("JSON parse error:", parseErr);
					throw new Error(`Invalid JSON from local file: ${text.substring(0, 50)}`);
				}

				if (!res.ok) {
					throw new Error(`${res.status} Error loading from local JSON`);
				}

				data = Array.isArray(jsonData) ? jsonData : [];
				console.log(`Successfully loaded ${data.length} entries from local JSON`);
			} else {
				// Production mode - fetch from API
				console.log("Loading from API:", API_SOURCE_URL);
				const res = await fetch(API_SOURCE_URL, { cache: "no-store" });
				const text = await res.text();
				console.log("Response status:", res.status);
				console.log("Response text (first 200 chars):", text.substring(0, 200));

				let jsonData;
				try {
					jsonData = JSON.parse(text);
				} catch (parseErr) {
					console.error("JSON parse error:", parseErr);
					throw new Error(`Invalid JSON from API: ${text.substring(0, 50)}`);
				}

				if (!res.ok) throw new Error(jsonData.error || "Failed to load entries");
				data = Array.isArray(jsonData) ? jsonData : [];
				console.log(`Successfully loaded ${data.length} entries from API`);
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
			console.error("Load entries error:", message);
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
			let data: ClipboardEntry;

			if (SYSTEM === 0) {
				// Local/Dev mode
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
				// Production mode
				const res = await fetch("/api/clipboard", {
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
			let data: ClipboardEntry;

			if (SYSTEM === 0) {
				// Local/Dev mode
				const entry = SAMPLE_DATA.find((r) => r.id === selectedId);
				if (!entry) throw new Error("Entry not found");
				entry.title = title || null;
				entry.content = content || null;
				entry.updated_at = new Date().toISOString();
				data = entry;
			} else {
				// Production mode
				const res = await fetch(`/api/clipboard/${selectedId}`, {
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
		if (!confirm("Delete this clipboard entry?")) return;

		setStatusMessage("Deleting...", "");
		try {
			if (SYSTEM === 0) {
				// Local/Dev mode
				const index = SAMPLE_DATA.findIndex((r) => r.id === selectedId);
				if (index === -1) throw new Error("Entry not found");
				SAMPLE_DATA.splice(index, 1);
			} else {
				// Production mode
				const res = await fetch(`/api/clipboard/${selectedId}`, {
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

	const updateRowOrders = async (updatedRows: ClipboardEntry[]) => {
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
						await fetch(`/api/clipboard/${update.id}`, {
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
			} catch (error) {
				console.error("Failed to update order:", error);
			}
		}
	};

	return (
		<div className={`clipboard-wrapper ${embedded ? "embedded" : ""}`}>
			<div className="clipboard-container">
				<header className="page-head">
					<div>
						<h1 className="page-title">Clipboard Workspace</h1>
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
								<div className="empty-state">No clipboard entries yet.</div>
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
							<span className="chip">{updatedAt}</span>
						</div>

						<div className="form">
							<div className="form-group">
								<label htmlFor="clipboard-title">Title</label>
								<input
									id="clipboard-title"
									type="text"
									placeholder="Optional title"
									value={title}
									onChange={(e) => setTitle(e.target.value)}
								/>
							</div>

							<div className="form-group">
								<label htmlFor="clipboard-content">Content</label>
								<textarea
									id="clipboard-content"
									placeholder="Paste or write content here..."
									value={content}
									onChange={(e) => setContent(e.target.value)}
								/>
							</div>

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

							<div className={`status ${statusKind}`}>{status}</div>
						</div>
					</section>
				</div>
			</div>
		</div>
	);
}
