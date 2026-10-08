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

export function InstructionManagement() {
	const [instructions, setInstructions] = useState<Instruction[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const [showForm, setShowForm] = useState(false);
	const [editingId, setEditingId] = useState<number | null>(null);
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
			const response = await fetch("/api/prompt-instruction", { cache: "no-store" });
			const data = await response.json();

			if (!response.ok) {
				throw new Error(data?.error || "Failed to load instructions");
			}

			setInstructions(Array.isArray(data) ? data : []);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Unknown error");
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
		if (!id || !window.confirm("Are you sure you want to delete this instruction?")) return;

		try {
			const response = await fetch(`/api/prompt-instruction/${id}`, {
				method: "DELETE",
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data?.error || "Failed to delete instruction");
			}

			setInstructions((prev) => prev.filter((inst) => inst.id !== id));
			setError("");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to delete instruction");
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
			const url = editingId ? `/api/prompt-instruction/${editingId}` : "/api/prompt-instruction";

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

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data?.error || `Failed to ${editingId ? "update" : "create"} instruction`);
			}

			await loadInstructions();
			setShowForm(false);
			setFormData({ value: "", label: "", prompt_instruction: "", description: "" });
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to save instruction");
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
							rows={8}
						/>
					</div>

					<div className="form-group">
						<label htmlFor="description">Description</label>
						<textarea
							id="description"
							value={formData.description || ""}
							onChange={(e) => setFormData({ ...formData, description: e.target.value })}
							placeholder="Optional description"
							rows={3}
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
									<th>Description</th>
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
										<td className="description-cell">{inst.description || "-"}</td>
										<td className="preview-cell">
											<button
												type="button"
												className="btn-preview"
												title={inst.prompt_instruction}
												onClick={() => alert(inst.prompt_instruction)}
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
		</div>
	);
}
