import { useEffect, useState } from "react";
import "../styles/InstructionManagement.css";

type Instruction = {
	id?: number;
	value: string;
	label: string;
	prompt_instruction: string;
	description?: string;
};

type EditingInstruction = Instruction & { isNew?: boolean };

const ENVIRONMENT = import.meta.env.VITE_ENVIRONMENT?.trim() || "production";
const JSON_SOURCE_URL = "/instructions/image-cloud/instructions.json";
const API_SOURCE_URL = "/api/prompt-instruction";

export function InstructionManagement() {
	const [instructions, setInstructions] = useState<Instruction[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const [showForm, setShowForm] = useState(false);
	const [editingId, setEditingId] = useState<number | null>(null);
	const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; id?: number }>({ show: false });
	const [showPreview, setShowPreview] = useState(false);
	const [previewData, setPreviewData] = useState<Instruction | null>(null);
	const isLocalMode = ENVIRONMENT === "local";
	const [formData, setFormData] = useState<EditingInstruction>({
		value: "",
		label: "",
		prompt_instruction: "",
		description: "",
	});

	useEffect(() => {
		loadInstructions();
	}, []);

	const loadInstructions = async () => {
		setLoading(true);
		setError("");
		try {
			let url: string;
			let source: string;

			// Always try local JSON first, then fall back to API
			if (isLocalMode) {
				url = JSON_SOURCE_URL;
				source = "Local JSON File";
			} else {
				url = API_SOURCE_URL;
				source = "Database API";
			}

			console.log(`Attempting to load from ${source}:`, url);

			try {
				const response = await fetch(url, { cache: "no-store" });
				const text = await response.text();

				console.log("Response status:", response.status);
				console.log("Response text (first 200 chars):", text.substring(0, 200));

				let data;
				try {
					data = JSON.parse(text);
				} catch (parseErr) {
					console.error("JSON parse error:", parseErr);
					throw new Error(`Invalid JSON from ${source}: ${text.substring(0, 50)}`);
				}

				if (!response.ok) {
					throw new Error(`${response.status} Error from ${source}`);
				}

				// For local JSON, data is array directly
				// For API, data might be wrapped with instructions property
				const instructionsList = Array.isArray(data) ? data : Array.isArray(data?.instructions) ? data.instructions : [];

				if (!instructionsList.length) {
					console.warn("No instructions loaded from", source);
				}

				console.log(`Successfully loaded ${instructionsList.length} instructions from ${source}`);
				setInstructions(instructionsList);
			} catch (fetchErr) {
				// If production mode and API fails, try local JSON as fallback
				if (!isLocalMode) {
					console.warn(`Failed to load from API, falling back to local JSON:`, fetchErr);
					console.log("Attempting fallback from local JSON...");

					const fallbackResponse = await fetch(JSON_SOURCE_URL, { cache: "no-store" });
					const fallbackText = await fallbackResponse.text();

					let fallbackData;
					try {
						fallbackData = JSON.parse(fallbackText);
					} catch (parseErr) {
						console.error("Fallback JSON parse error:", parseErr);
						throw new Error(`Invalid JSON from fallback local file: ${fallbackText.substring(0, 50)}`);
					}

					if (!fallbackResponse.ok) {
						throw new Error(`Fallback failed with status ${fallbackResponse.status}`);
					}

					const instructionsList = Array.isArray(fallbackData) ? fallbackData : [];
					console.log(`Fallback successful: loaded ${instructionsList.length} instructions from local JSON`);
					setInstructions(instructionsList);
					setError("API unavailable, loaded from fallback local JSON");
				} else {
					throw fetchErr;
				}
			}
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : "Unknown error";
			console.error("Load instructions error:", errorMsg);
			setError(errorMsg);
			setInstructions([]);
		} finally {
			setLoading(false);
		}
	};

	const handleAdd = () => {
		setEditingId(null);
		setFormData({
			value: "",
			label: "",
			prompt_instruction: "",
			description: "",
			isNew: true,
		});
		setShowForm(true);
	};

	const handleEdit = (instruction: Instruction) => {
		setEditingId(instruction.id ?? null);
		setFormData({
			...instruction,
			isNew: false,
		});
		setShowForm(true);
	};

	const handleDelete = async (id: number | undefined) => {
		if (!id) return;
		setDeleteConfirm({ show: true, id });
	};

	const confirmDelete = async () => {
		const id = deleteConfirm.id;
		if (!id) return;
		setDeleteConfirm({ show: false });

		try {
			const url = isLocalMode ? `${API_SOURCE_URL}-local/${id}` : `${API_SOURCE_URL}/${id}`;

			console.log(`Deleting instruction (${isLocalMode ? "local JSON" : "API database"}):`, url);

			const response = await fetch(url, {
				method: "DELETE",
			});

			const text = await response.text();
			console.log("Delete response status:", response.status);
			console.log("Delete response text:", text.substring(0, 200));

			let data: any = {};
			if (text) {
				try {
					data = JSON.parse(text);
				} catch (parseErr) {
					console.error("JSON parse error:", parseErr);
					throw new Error(`Invalid JSON response: ${text.substring(0, 100)}`);
				}
			}

			if (!response.ok) {
				throw new Error(data?.error || "Failed to delete instruction");
			}

			setInstructions((prev) => prev.filter((inst) => inst.id !== id));
			setError("");
			console.log("Delete successful");
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : "Failed to delete instruction";
			console.error("Delete error:", errorMsg);
			setError(errorMsg);
		}
	};

	const handleSave = async () => {
		setError("");

		if (!formData.value.trim() || !formData.label.trim() || !formData.prompt_instruction.trim()) {
			setError("Value, Label, and Instruction are required");
			return;
		}

		try {
			const method = editingId ? "PUT" : "POST";
			const url = isLocalMode
				? `${API_SOURCE_URL}-local${editingId ? `/${editingId}` : ""}`
				: `${API_SOURCE_URL}${editingId ? `/${editingId}` : ""}`;

			console.log(`Saving instruction (${isLocalMode ? "local JSON" : "API database"}):`, url, method);

			const response = await fetch(url, {
				method,
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					value: formData.value.trim(),
					label: formData.label.trim(),
					prompt_instruction: formData.prompt_instruction.trim(),
					description: formData.description?.trim() || null,
				}),
			});

			const text = await response.text();
			console.log("Save response status:", response.status);
			console.log("Save response text:", text.substring(0, 200));

			let data;
			try {
				data = JSON.parse(text);
			} catch (parseErr) {
				console.error("JSON parse error:", parseErr);
				throw new Error(`Invalid JSON response: ${text.substring(0, 100)}`);
			}

			if (!response.ok) {
				throw new Error(data?.error || `Failed to ${editingId ? "update" : "create"} instruction`);
			}

			console.log("Save successful, reloading instructions");
			await loadInstructions();
			setShowForm(false);
			setFormData({ value: "", label: "", prompt_instruction: "", description: "" });
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : "Failed to save instruction";
			console.error("Save error:", errorMsg);
			setError(errorMsg);
		}
	};

	const handleCancel = () => {
		setShowForm(false);
		setEditingId(null);
		setFormData({ value: "", label: "", prompt_instruction: "", description: "" });
		setError("");
	};

	return (
		<div className="instruction-management">
			<div className="instruction-header">
				<div>
					<h2>Instruction Management</h2>
					<p>Create and manage prompt instructions</p>
					<small style={{ marginTop: "8px", display: "block", color: "#8f9aaa" }}>
						Mode: <strong>{isLocalMode ? "Local JSON File" : "Database API"}</strong>
					</small>
				</div>
				{!showForm && (
					<button type="button" className="btn-add" onClick={handleAdd}>
						+ Add Instruction
					</button>
				)}
			</div>

			{error && <div className="error-message">{error}</div>}

			{showForm ? (
				<div className="instruction-form">
					<h3>{editingId ? "Edit Instruction" : "Add New Instruction"}</h3>

					<div className="form-group">
						<label htmlFor="value">Value *</label>
						<input
							id="value"
							type="text"
							value={formData.value}
							onChange={(e) => setFormData({ ...formData, value: e.target.value })}
							placeholder="e.g., default"
							disabled={!formData.isNew}
							title={formData.isNew ? "" : "Value cannot be changed"}
						/>
						{!formData.isNew && <small>Value cannot be changed after creation</small>}
					</div>

					<div className="form-group">
						<label htmlFor="label">Label *</label>
						<input
							id="label"
							type="text"
							value={formData.label}
							onChange={(e) => setFormData({ ...formData, label: e.target.value })}
							placeholder="e.g., Default Instruction"
						/>
					</div>

					<div className="form-group">
						<label htmlFor="prompt_instruction">Prompt Instruction *</label>
						<textarea
							id="prompt_instruction"
							value={formData.prompt_instruction}
							onChange={(e) => setFormData({ ...formData, prompt_instruction: e.target.value })}
							placeholder="Enter the instruction template..."
							rows={4}
						/>
					</div>

					<div className="form-group">
						<label htmlFor="description">Description</label>
						<textarea
							id="description"
							value={formData.description || ""}
							onChange={(e) => setFormData({ ...formData, description: e.target.value })}
							placeholder="Optional description"
							rows={2}
						/>
					</div>

					<div className="form-actions">
						<button type="button" className="btn-save" onClick={handleSave}>
							Save
						</button>
						<button type="button" className="btn-cancel" onClick={handleCancel}>
							Cancel
						</button>
					</div>
				</div>
			) : (
				<div className="instruction-table-wrapper">
					{loading ? (
						<p className="loading">Loading instructions...</p>
					) : instructions.length === 0 ? (
						<p className="empty-state">No instructions found. Create one to get started.</p>
					) : (
						<table className="instruction-table">
							<thead>
								<tr>
									<th>Value</th>
									<th>Label</th>
									<th>Preview</th>
									<th>Actions</th>
								</tr>
							</thead>
							<tbody>
								{instructions.map((inst) => (
									<tr key={inst.id}>
										<td className="value-cell">
											<code>{inst.value}</code>
										</td>
										<td className="label-cell">{inst.label}</td>
										<td className="preview-cell">
											<button
												type="button"
												className="btn-preview"
												title={inst.prompt_instruction}
												onClick={() => {
													setShowPreview(true);
													setPreviewData(inst);
												}}
											>
												View
											</button>
										</td>
										<td className="actions-cell">
											<button
												type="button"
												className="btn-edit"
												onClick={() => handleEdit(inst)}
												title="Edit instruction"
											>
												✏️ Edit
											</button>
											<button
												type="button"
												className="btn-delete"
												onClick={() => handleDelete(inst.id)}
												title="Delete instruction"
											>
												🗑️ Delete
											</button>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					)}
				</div>
			)}

			{deleteConfirm.show && (
				<div className="modal-overlay">
					<div className="modal-dialog">
						<h3>Confirm Delete</h3>
						<p>Are you sure you want to delete this instruction? This action cannot be undone.</p>
						<div className="modal-actions">
							<button type="button" className="btn-cancel" onClick={() => setDeleteConfirm({ show: false })}>
								Cancel
							</button>
							<button type="button" className="btn-delete" onClick={confirmDelete}>
								Delete
							</button>
						</div>
					</div>
				</div>
			)}

			{showPreview && previewData && (
				<div className="modal-overlay" onClick={() => setShowPreview(false)}>
					<div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
						<h3>{previewData.label}</h3>
						<textarea readOnly value={previewData.prompt_instruction} className="preview-textarea" />
						<div className="modal-actions">
							<button type="button" className="btn-cancel" onClick={() => setShowPreview(false)}>
								Close
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
