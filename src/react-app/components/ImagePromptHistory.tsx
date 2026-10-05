import { useEffect, useRef, useState } from "react";
import "../styles/ImagePrompt.css";

type SavedPrompt = {
	id: number;
	prompt: string;
	category: string | null;
	image_path: string;
	created_at: string;
};

type ViewMode = "table" | "vertical" | "grid";

const IS_LOCAL = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

const DUMMY_PROMPTS: SavedPrompt[] = [
	{
		id: 1,
		prompt: "A professional portrait of a woman wearing a red business suit, sitting in an office chair with a confident smile, natural lighting from a window, sharp focus on face, modern office background, professional photography style",
		category: "portrait",
		image_path: JSON.stringify([]),
		created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
	},
	{
		id: 2,
		prompt: "Fashion photography of a man in casual streetwear, standing on a city street at sunset, golden hour lighting, relaxed pose, urban background with blurred buildings, trendy style, cinematic quality",
		category: "fashion",
		image_path: JSON.stringify([]),
		created_at: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
	},
	{
		id: 3,
		prompt: "Product photography of a luxury watch on a marble surface, studio lighting, soft shadows, product-centric composition, high-end jewelry photography style, sharp detail, isolated on neutral background",
		category: "product",
		image_path: JSON.stringify([]),
		created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
	},
	{
		id: 4,
		prompt: "Landscape photography of a mountain range at sunrise, golden light casting long shadows, misty valleys, wide-angle perspective, majestic scenery, dramatic sky with clouds, nature photography",
		category: "landscape",
		image_path: JSON.stringify([]),
		created_at: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
	},
	{
		id: 5,
		prompt: "Close-up of a blooming pink flower with water droplets, macro photography, soft bokeh background, natural daylight, detailed texture, garden setting, delicate and soft style",
		category: "nature",
		image_path: JSON.stringify([]),
		created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
	},
	{
		id: 6,
		prompt: "An elegant dinner table with white tablecloth, lit candles, fine dining setup, wine glasses, formal place settings, warm ambient lighting, luxury restaurant, fine art photography",
		category: "lifestyle",
		image_path: JSON.stringify([]),
		created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
	},
	{
		id: 7,
		prompt: "Modern architecture photograph of a glass building with geometric patterns, sharp lines, contemporary design, blue sky in background, professional architectural photography, detail and clarity",
		category: "architecture",
		image_path: JSON.stringify([]),
		created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
	},
	{
		id: 8,
		prompt: "A cozy home interior with wooden furniture, warm lighting, comfortable seating area, plants, minimalist decor, natural elements, inviting atmosphere, interior design photography",
		category: "interior",
		image_path: JSON.stringify([]),
		created_at: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
	},
	{
		id: 9,
		prompt: "Food photography of a gourmet burger with fresh lettuce, tomato, cheese, artisanal bun, on a dark plate, studio lighting, appetizing composition, professional food photography, high resolution",
		category: "food",
		image_path: JSON.stringify([]),
		created_at: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
	},
	{
		id: 10,
		prompt: "Action sports photo of a skateboarder performing a trick in mid-air, dynamic composition, sharp movement capture, skate park background, energy and motion, professional sports photography",
		category: "sports",
		image_path: JSON.stringify([]),
		created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
	},
	{
		id: 11,
		prompt: "Underwater photography of a colorful coral reef with tropical fish swimming, crystal clear water, vibrant colors, natural sunlight filtering from above, marine life photography, peaceful seascape",
		category: "nature",
		image_path: JSON.stringify([]),
		created_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
	},
	{
		id: 12,
		prompt: "A sleek gaming setup with multiple monitors, RGB lighting, high-end keyboard and mouse, racing chair, ambient blue lighting, modern tech aesthetic, indoor photography",
		category: "product",
		image_path: JSON.stringify([]),
		created_at: new Date(Date.now() - 50 * 60 * 1000).toISOString(),
	},
	{
		id: 13,
		prompt: "Vintage film photography of an old train station, nostalgic atmosphere, retro color grading, warm tones, architectural details, historical building, cinematic quality",
		category: "architecture",
		image_path: JSON.stringify([]),
		created_at: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
	},
	{
		id: 14,
		prompt: "Abstract art photograph with geometric shapes, vibrant colors, modern art installation, creative composition, contemporary art, studio lighting, artistic expression",
		category: "abstract",
		image_path: JSON.stringify([]),
		created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
	},
	{
		id: 15,
		prompt: "A peaceful yoga session in a zen garden, person in lotus position, morning sunlight, natural plants, wooden platforms, spa atmosphere, wellness photography",
		category: "lifestyle",
		image_path: JSON.stringify([]),
		created_at: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
	},
	{
		id: 16,
		prompt: "High fashion runway photography showing a model wearing avant-garde designer clothing, dramatic lighting, professional makeup, confident expression, luxury fashion, studio backdrop",
		category: "fashion",
		image_path: JSON.stringify([]),
		created_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
	},
	{
		id: 17,
		prompt: "Macro photography of a butterfly wing showing intricate scales and patterns, detailed texture, vibrant colors, natural lighting, scientific photography, high magnification",
		category: "nature",
		image_path: JSON.stringify([]),
		created_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
	},
	{
		id: 18,
		prompt: "Commercial food photography of artisanal coffee with latte art, croissant, coffee shop ambiance, warm lighting, inviting composition, café aesthetic, professional styling",
		category: "food",
		image_path: JSON.stringify([]),
		created_at: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
	},
	{
		id: 19,
		prompt: "A professional headshot portrait with soft studio lighting, clean background, confident expression, business attire, perfect skin tone, corporate photography",
		category: "portrait",
		image_path: JSON.stringify([]),
		created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
	},
	{
		id: 20,
		prompt: "Landscape photography of a misty forest with towering trees, fog rolling through, golden morning light, serene woodland scene, nature's tranquility, atmospheric perspective",
		category: "landscape",
		image_path: JSON.stringify([]),
		created_at: new Date(Date.now() - 1 * 60 * 1000).toISOString(),
	},
];

async function readResponseJson(response: Response) {
	try {
		return await response.json();
	} catch {
		return { error: { message: await response.text() } };
	}
}

async function loadSavedPrompts() {
	const response = await fetch("/api/image-prompts");
	const records = await readResponseJson(response);

	if (!response.ok) {
		throw new Error(records?.error || "Failed to load saved prompts");
	}

	return Array.isArray(records) ? records : [];
}

async function saveSavedPrompt(prompt: string, category: string, images: File[] = []) {
	const formData = new FormData();
	formData.append("prompt", prompt);
	if (category) {
		formData.append("category", category);
	}
	images.forEach((image) => {
		formData.append("images", image);
	});

	const response = await fetch("/api/image-prompts", {
		method: "POST",
		body: formData,
	});
	const data = await readResponseJson(response);

	if (!response.ok) {
		throw new Error(data?.error || "Failed to save prompt");
	}

	return data;
}

async function deleteSavedPrompt(id: number) {
	const response = await fetch(`/api/image-prompts/${id}`, {
		method: "DELETE",
	});
	const data = await readResponseJson(response);

	if (!response.ok) {
		throw new Error(data?.error || "Failed to delete prompt");
	}

	return data;
}

async function loadCategorySuggestions() {
	const response = await fetch("/api/image-prompts");
	const records = await readResponseJson(response);

	if (!response.ok) {
		throw new Error(records?.error || "Failed to load categories");
	}

	const categories = Array.isArray(records)
		? [...new Set(records.map((r: SavedPrompt) => r.category).filter(Boolean))]
		: [];
	return categories as string[];
}

export function ImagePromptHistory({ onBackToDashboard, embedded = false }: { onBackToDashboard?: () => void; embedded?: boolean }) {
	const [savedPrompts, setSavedPrompts] = useState<SavedPrompt[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
	const [filterCategory, setFilterCategory] = useState("");
	const [manualPrompt, setManualPrompt] = useState("");
	const [manualCategory, setManualCategory] = useState("");
	const [categorySuggestions, setCategorySuggestions] = useState<string[]>([]);
	const [savingPrompt, setSavingPrompt] = useState(false);
	const [showAddModal, setShowAddModal] = useState(false);
	const [viewMode, setViewMode] = useState<ViewMode>("table");
	const [currentPage, setCurrentPage] = useState(1);
	const [manualImages, setManualImages] = useState<File[]>([]);
	const [deleteConfirm, setDeleteConfirm] = useState<{ id?: number; count?: number } | null>(null);
	const [deleteConfirmLoading, setDeleteConfirmLoading] = useState(false);
	const [viewPrompt, setViewPrompt] = useState<SavedPrompt | null>(null);
	const [viewMultiplePrompts, setViewMultiplePrompts] = useState(false);
	const [recordsPerPage, setRecordsPerPage] = useState(15);
	const [showSelectionScopeDialog, setShowSelectionScopeDialog] = useState(false);
	const imageInputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		// Detect if mobile
		const isMobile = window.matchMedia("(max-width: 720px)").matches;
		setViewMode(isMobile ? "vertical" : "table");

		if (IS_LOCAL) {
			// Using dummy data for local testing
			setSavedPrompts(DUMMY_PROMPTS);
			const dummyCategories = [...new Set(DUMMY_PROMPTS.map((p) => p.category).filter(Boolean))] as string[];
			setCategorySuggestions(dummyCategories);
			setLoading(false);
		} else {
			// Fetch from API in production
			Promise.all([loadSavedPrompts(), loadCategorySuggestions()])
				.then(([prompts, categories]) => {
					setSavedPrompts(prompts);
					setCategorySuggestions(categories);
				})
				.catch((loadError) => {
					console.error("Failed to load data:", loadError);
					setError(loadError instanceof Error ? loadError.message : "Failed to load data");
				})
				.finally(() => setLoading(false));
		}
	}, []);

	const handleSelectAll = (checked: boolean) => {
		if (checked) {
			// Ask user to select current page or all pages
			setShowSelectionScopeDialog(true);
		} else {
			setSelectedIds(new Set());
		}
	};

	const handleSelectionScopeChoice = (choice: "current" | "all") => {
		if (choice === "current") {
			setSelectedIds(new Set(pagedPrompts.map((p) => p.id)));
		} else if (choice === "all") {
			setSelectedIds(new Set(filteredPrompts.map((p) => p.id)));
		}
		setShowSelectionScopeDialog(false);
	};

	const handleSelectPrompt = (id: number, checked: boolean) => {
		const newIds = new Set(selectedIds);
		if (checked) {
			newIds.add(id);
		} else {
			newIds.delete(id);
		}
		setSelectedIds(newIds);
	};

	const handleSavePrompt = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!manualPrompt.trim()) {
			setError("Please enter a prompt");
			return;
		}

		if (manualImages.length === 0) {
			setError("Please add at least one image");
			return;
		}

		setSavingPrompt(true);
		try {
			if (IS_LOCAL) {
				// For local testing, add directly to state
				const newPrompt: SavedPrompt = {
					id: Math.max(...savedPrompts.map((p) => p.id), 0) + 1,
					prompt: manualPrompt,
					category: manualCategory || null,
					image_path: JSON.stringify([]),
					created_at: new Date().toISOString(),
				};
				setSavedPrompts((current) => [newPrompt, ...current]);
				setManualPrompt("");
				setManualCategory("");
				setManualImages([]);
				if (imageInputRef.current) imageInputRef.current.value = "";
				setError("");
				setShowAddModal(false);

				// Update category suggestions
				const newCategories = [...new Set([...categorySuggestions, manualCategory].filter(Boolean))];
				setCategorySuggestions(newCategories);
			} else {
				// Production: save to API with images
				const result = await saveSavedPrompt(manualPrompt, manualCategory, manualImages);
				setSavedPrompts((current) => [result, ...current]);
				setManualPrompt("");
				setManualCategory("");
				setManualImages([]);
				if (imageInputRef.current) imageInputRef.current.value = "";
				setError("");
				setShowAddModal(false);

				loadCategorySuggestions().then(setCategorySuggestions);
			}
		} catch (saveError) {
			setError(saveError instanceof Error ? saveError.message : "Failed to save prompt");
		} finally {
			setSavingPrompt(false);
		}
	};

	const handleDeletePrompt = async (id: number) => {
		setDeleteConfirm({ id });
	};

	const handleDeleteSelected = async () => {
		if (selectedIds.size === 0) return;
		setDeleteConfirm({ count: selectedIds.size });
	};

	const confirmDelete = async () => {
		setDeleteConfirmLoading(true);
		try {
			if (deleteConfirm?.id) {
				// Single delete
				if (!IS_LOCAL) {
					await deleteSavedPrompt(deleteConfirm.id);
				}
				setSavedPrompts((current) => current.filter((p) => p.id !== deleteConfirm.id));
				setSelectedIds((current) => {
					const newIds = new Set(current);
					newIds.delete(deleteConfirm.id!);
					return newIds;
				});
			} else if (deleteConfirm?.count) {
				// Bulk delete
				if (!IS_LOCAL) {
					await Promise.all(Array.from(selectedIds).map((id) => deleteSavedPrompt(id)));
				}
				setSavedPrompts((current) => current.filter((p) => !selectedIds.has(p.id)));
				setSelectedIds(new Set());
			}
			setError("");
		} catch (deleteError) {
			setError(deleteError instanceof Error ? deleteError.message : "Failed to delete");
		} finally {
			setDeleteConfirm(null);
			setDeleteConfirmLoading(false);
		}
	};

	const copyPrompt = async (prompt: string) => {
		try {
			await navigator.clipboard.writeText(prompt);
		} catch {
			const textarea = document.createElement("textarea");
			textarea.value = prompt;
			document.body.appendChild(textarea);
			textarea.select();
			document.execCommand("copy");
			document.body.removeChild(textarea);
		}
	};

	const setImageFiles = (files: File[]) => {
		const imageFiles = Array.from(files).filter((f) => f.type.startsWith("image/"));
		setManualImages(imageFiles);
	};

	const handleImageInput = (e: React.ChangeEvent<HTMLInputElement>) => {
		if (e.currentTarget.files) {
			setImageFiles(Array.from(e.currentTarget.files));
		}
	};

	const handlePaste = (e: React.ClipboardEvent) => {
		const pastedFiles = Array.from(e.clipboardData?.items || [])
			.filter((item) => item.type.startsWith("image/"))
			.map((item, idx) => {
				const file = item.getAsFile();
				if (!file) return null;
				return file.name ? file : new File([file], `clipboard-image-${Date.now()}-${idx}.png`, { type: file.type });
			})
			.filter((f): f is File => f !== null);

		if (pastedFiles.length > 0) {
			e.preventDefault();
			setImageFiles([...manualImages, ...pastedFiles]);
			setError(`${pastedFiles.length} image${pastedFiles.length === 1 ? "" : "s"} pasted from clipboard.`);
		}
	};

	const toggleViewMode = () => {
		const modes: ViewMode[] = ["table", "vertical", "grid"];
		const currentIdx = modes.indexOf(viewMode);
		setViewMode(modes[(currentIdx + 1) % modes.length]);
	};

	const getViewToggleLabel = () => {
		const next = { table: "vertical", vertical: "grid", grid: "table" }[viewMode];
		return `Switch to ${next} view`;
	};

	const getViewToggleIcon = () => {
		return { table: "↕", vertical: "⬜", grid: "↔" }[viewMode];
	};

	const promptAsSingleSentence = (prompt: string) => {
		const singleLine = String(prompt || "").replace(/\s+/g, " ").trim();
		const withoutSentenceBreaks = singleLine.replace(/[.!?]+\s+(?=\S)/g, ", ").replace(/[.!?]+$/, "");
		return withoutSentenceBreaks ? `${withoutSentenceBreaks}.` : "";
	};

	const downloadPrompts = () => {
		const toDownload = Array.from(selectedIds)
			.map((id) => savedPrompts.find((p) => p.id === id))
			.filter((p): p is SavedPrompt => !!p);

		if (toDownload.length === 0) return;

		const prompts = toDownload.map((p) => promptAsSingleSentence(p.prompt)).filter(Boolean);
		const text = prompts.join("\n\n");

		const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `selected-image-prompts.txt`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	};

	const categories = [...new Set(savedPrompts.map((p) => p.category).filter(Boolean))] as string[];

	const filteredPrompts = filterCategory ? savedPrompts.filter((p) => p.category === filterCategory) : savedPrompts;
	const totalPages = Math.max(1, Math.ceil(filteredPrompts.length / recordsPerPage));
	const validPage = Math.min(currentPage, totalPages);
	const firstIdx = (validPage - 1) * recordsPerPage;
	const pagedPrompts = filteredPrompts.slice(firstIdx, firstIdx + recordsPerPage);

	const imagePathsForRecord = (imagePath: string) => {
		try {
			const paths = JSON.parse(imagePath);
			return Array.isArray(paths) ? paths : [];
		} catch {
			return imagePath ? [imagePath] : [];
		}
	};

	const renderTable = () => (
		<div style={{ overflowX: viewMode === "table" ? "auto" : "visible" }}>
			<table style={{ width: "100%", borderCollapse: "collapse", ...(viewMode === "table" && { minWidth: "600px" }) }}>
				<thead>
					<tr style={{ borderBottom: "1px solid #2a3342", backgroundColor: viewMode === "table" ? "#0d1118" : "transparent" }}>
						<th style={{ textAlign: "left", padding: "12px 10px", color: "#8f9aaa", fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase" }}>
							<input
								type="checkbox"
								style={{ accentColor: "#78e6c0" }}
								onChange={(e) => handleSelectAll(e.currentTarget.checked)}
								checked={pagedPrompts.length > 0 && pagedPrompts.every((p) => selectedIds.has(p.id))}
								aria-label="Select all prompts"
							/>
						</th>
						{viewMode === "table" && (
							<>
								<th style={{ textAlign: "left", padding: "12px 10px", color: "#8f9aaa", fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase" }}>Image</th>
								<th style={{ textAlign: "left", padding: "12px 10px", color: "#8f9aaa", fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase" }}>Prompt</th>
								<th style={{ textAlign: "left", padding: "12px 10px", color: "#8f9aaa", fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase" }}>Category</th>
								<th style={{ textAlign: "left", padding: "12px 10px", color: "#8f9aaa", fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase" }}>Created</th>
								<th style={{ textAlign: "left", padding: "12px 10px", color: "#8f9aaa", fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase" }}>Actions</th>
							</>
						)}
					</tr>
				</thead>
				<tbody>
					{pagedPrompts.length === 0 ? (
						<tr>
							<td colSpan={viewMode === "table" ? 6 : 2} style={{ textAlign: "center", padding: "24px", color: "#8f9aaa" }}>
								{filterCategory ? "No prompts found for this category." : "No saved prompts yet."}
							</td>
						</tr>
					) : (
						pagedPrompts.map((prompt) => {
							const imagePaths = imagePathsForRecord(prompt.image_path);
							return (
								<tr
									key={prompt.id}
									style={{
										borderBottom: "1px solid #2a3342",
										transition: "background 160ms ease",
										...(viewMode === "vertical" && {
											background: "#191e29",
											borderRadius: "10px",
											marginBottom: "12px",
											padding: "10px 14px",
										}),
										...(viewMode === "grid" && {
											background: "#191e29",
											borderRadius: "10px",
											display: "flex",
											flexDirection: "column",
											position: "relative",
										}),
									}}
									onMouseEnter={(e) => viewMode === "table" && (e.currentTarget.style.background = "#0d1118")}
									onMouseLeave={(e) => viewMode === "table" && (e.currentTarget.style.background = "transparent")}
								>
									<td style={{ padding: "12px 10px", width: viewMode === "grid" ? "auto" : "40px", ...(viewMode === "grid" && { position: "absolute", right: "12px", top: "12px", zIndex: 1 }) }}>
										<input
											type="checkbox"
											checked={selectedIds.has(prompt.id)}
											onChange={(e) => handleSelectPrompt(prompt.id, e.currentTarget.checked)}
											style={{ accentColor: "#78e6c0" }}
											aria-label={`Select prompt ${prompt.id}`}
										/>
									</td>

									{viewMode === "table" && (
										<>
											<td style={{ padding: "12px 10px", color: "#f2f5f8", fontSize: "0.85rem", whiteSpace: "nowrap" }}>
												{imagePaths[0] ? (
													<img
														src={`https://sdk.satheshdeveloper.workers.dev/api/image-prompts/image?key=${encodeURIComponent(imagePaths[0])}`}
														alt="Reference"
														style={{ width: 48, height: 48, borderRadius: 5, objectFit: "cover", border: "1px solid #2a3342" }}
													/>
												) : (
													<div style={{ width: 48, height: 48, borderRadius: 8, background: "#202a36", border: "1px solid #2a3342", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem", color: "#8f9aaa" }}>
														No image
													</div>
												)}
											</td>
											<td style={{ padding: "12px 10px", color: "#f2f5f8", fontSize: "0.85rem", maxWidth: "500px" }}>
												<span style={{ display: "inline-block", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={prompt.prompt}>
													{prompt.prompt}
												</span>
											</td>
											<td style={{ padding: "12px 10px", color: "#f2f5f8", fontSize: "0.85rem" }}>
												<span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "inline-block", maxWidth: "100px" }}>
													{prompt.category || "—"}
												</span>
											</td>
											<td style={{ padding: "12px 10px", color: "#8f9aaa", fontSize: "0.85rem", whiteSpace: "nowrap" }}>
												{new Date(`${prompt.created_at}Z`).toLocaleDateString()}
											</td>
											<td style={{ padding: "12px 10px", display: "flex", gap: 6 }}>
												<button
													type="button"
													className="copy-btn"
													onClick={() => setViewPrompt(prompt)}
													style={{ fontSize: "0.75rem", padding: "6px 8px", whiteSpace: "nowrap" }}
													title="View full prompt"
													aria-label="View full prompt"
												>
													👁
												</button>
												<button
													type="button"
													className="copy-btn"
													onClick={() => copyPrompt(prompt.prompt)}
													style={{ fontSize: "0.75rem", padding: "6px 8px", whiteSpace: "nowrap" }}
													title="Copy prompt"
													aria-label="Copy prompt"
												>
													📋
												</button>
												<button
													type="button"
													className="copy-btn"
													onClick={() => handleDeletePrompt(prompt.id)}
													style={{ background: "#ff8d9b", color: "#2b0710", fontWeight: "700", marginTop: 0, fontSize: "0.75rem", padding: "6px 8px", whiteSpace: "nowrap" }}
													title="Delete prompt"
													aria-label="Delete prompt"
												>
													🗑
												</button>
											</td>
										</>
									)}

									{viewMode === "vertical" && (
										<>
											<td data-label="Image" style={{ padding: "10px 0", borderBottom: "1px solid rgba(42, 51, 66, 0.7)", display: "grid", gridTemplateColumns: "84px 1fr", gap: 12, alignItems: "start" }}>
												<div style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#8f9aaa" }}>Image</div>
												{imagePaths[0] ? (
													<img
														src={`https://sdk.satheshdeveloper.workers.dev/api/image-prompts/image?key=${encodeURIComponent(imagePaths[0])}`}
														alt="Reference"
														style={{ width: "100%", height: "auto", borderRadius: 5, objectFit: "cover", border: "1px solid #2a3342" }}
													/>
												) : (
													<div style={{ background: "#202a36", border: "1px solid #2a3342", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", minHeight: "48px", fontSize: "0.75rem", color: "#8f9aaa" }}>
														No image
													</div>
												)}
											</td>
											<td data-label="Prompt" style={{ padding: "10px 0", borderBottom: "1px solid rgba(42, 51, 66, 0.7)", display: "grid", gridTemplateColumns: "84px 1fr", gap: 12, alignItems: "start", color: "#f2f5f8", fontSize: "0.85rem" }}>
												<div style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#8f9aaa" }}>Prompt</div>
												<div style={{ whiteSpace: "pre-wrap" }}>{prompt.prompt}</div>
											</td>
											<td data-label="Category" style={{ padding: "10px 0", borderBottom: "1px solid rgba(42, 51, 66, 0.7)", display: "grid", gridTemplateColumns: "84px 1fr", gap: 12, alignItems: "start", color: "#8f9aaa", fontSize: "0.85rem" }}>
												<div style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>Category</div>
												{prompt.category || "—"}
											</td>
											<td data-label="Created" style={{ padding: "10px 0", borderBottom: "1px solid rgba(42, 51, 66, 0.7)", display: "grid", gridTemplateColumns: "84px 1fr", gap: 12, alignItems: "start", color: "#8f9aaa", fontSize: "0.75rem" }}>
												<div style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>Created</div>
												{new Date(`${prompt.created_at}Z`).toLocaleDateString()}
											</td>
											<td data-label="Actions" style={{ padding: "10px 0", display: "flex", gap: 6, alignItems: "center" }}>
												<button
													type="button"
													className="copy-btn"
													onClick={() => setViewPrompt(prompt)}
													style={{ fontSize: "0.75rem", padding: "6px 8px", whiteSpace: "nowrap", width: 34, height: 34 }}
													title="View full prompt"
													aria-label="View full prompt"
												>
													👁
												</button>
												<button
													type="button"
													className="copy-btn"
													onClick={() => copyPrompt(prompt.prompt)}
													style={{ fontSize: "0.75rem", padding: "6px 8px", whiteSpace: "nowrap", width: 34, height: 34 }}
													title="Copy prompt"
													aria-label="Copy prompt"
												>
													📋
												</button>
												<button
													type="button"
													className="copy-btn"
													onClick={() => handleDeletePrompt(prompt.id)}
													style={{ background: "#ff8d9b", color: "#2b0710", fontWeight: "700", fontSize: "0.75rem", padding: "6px 8px", whiteSpace: "nowrap", width: 34, height: 34 }}
													title="Delete prompt"
													aria-label="Delete prompt"
												>
													🗑
												</button>
											</td>
										</>
									)}

									{viewMode === "grid" && (
										<>
											<td data-label="Image" style={{ padding: "12px", order: 1, width: "100%" }}>
												{imagePaths[0] ? (
													<img
														src={`https://sdk.satheshdeveloper.workers.dev/api/image-prompts/image?key=${encodeURIComponent(imagePaths[0])}`}
														alt="Reference"
														style={{ width: "100%", height: 160, borderRadius: 8, objectFit: "cover", border: "1px solid #2a3342" }}
													/>
												) : (
													<div style={{ width: "100%", height: 160, background: "#202a36", border: "1px solid #2a3342", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem", color: "#8f9aaa" }}>
														No image
													</div>
												)}
											</td>
											<td style={{ padding: "12px", paddingTop: 0, order: 2, color: "#f2f5f8", fontSize: "0.85rem", whiteSpace: "pre-wrap" }}>
												{prompt.prompt}
											</td>
											<td style={{ padding: "12px", paddingTop: 0, order: 3, color: "#8f9aaa", fontSize: "0.75rem" }}>
												<span style={{ fontWeight: 700 }}>Category:</span> {prompt.category || "—"}
											</td>
											<td style={{ padding: "12px", paddingTop: 0, order: 3, color: "#8f9aaa", fontSize: "0.75rem" }}>
												<span style={{ fontWeight: 700 }}>Created:</span> {new Date(`${prompt.created_at}Z`).toLocaleDateString()}
											</td>
											<td style={{ padding: "12px", paddingTop: 0, order: 4, display: "flex", gap: 6 }}>
												<button
													type="button"
													className="copy-btn"
													onClick={() => setViewPrompt(prompt)}
													style={{ fontSize: "0.75rem", padding: "6px 8px", flex: "0 0 auto" }}
													title="View full prompt"
													aria-label="View full prompt"
												>
													👁
												</button>
												<button
													type="button"
													className="copy-btn"
													onClick={() => copyPrompt(prompt.prompt)}
													style={{ fontSize: "0.75rem", padding: "6px 8px", flex: "0 0 auto" }}
													title="Copy prompt"
													aria-label="Copy prompt"
												>
													📋
												</button>
												<button
													type="button"
													className="copy-btn"
													onClick={() => handleDeletePrompt(prompt.id)}
													style={{ background: "#ff8d9b", color: "#2b0710", fontWeight: "700", fontSize: "0.75rem", padding: "6px 8px", flex: "0 0 auto" }}
													title="Delete prompt"
													aria-label="Delete prompt"
												>
													🗑
												</button>
											</td>
										</>
									)}
								</tr>
							);
						})
					)}
				</tbody>
			</table>
		</div>
	);

	return (
		<div className={embedded ? "image-prompt-page embedded" : "image-prompt-page"}>
			<div className={embedded ? "image-prompt-shell embedded" : "image-prompt-shell"}>
				<div className="page-header">
					<div>
						{/* <h1>Image Prompt History {IS_LOCAL && <span style={{ fontSize: "0.6em", color: "#78e6c0", marginLeft: "8px" }}>(Test Mode)</span>}</h1> */}
					</div>
					{!embedded ? (
						<button type="button" className="back-button" onClick={onBackToDashboard}>
							Back to dashboard
						</button>
					) : null}
				</div>

				{loading ? (
					<section className="panel">
						<div style={{ textAlign: "center", padding: "40px", color: "#8f9aaa" }}>
							<p>Loading saved prompts...</p>
						</div>
					</section>
				) : (
					<div className="workspace" style={{ gridTemplateColumns: "1fr" }}>
						<section className="panel" style={{ gridColumn: "1 / -1" }}>
							{/* History Controls */}
							<div style={{ display: "flex", gap: "14px", justifyContent: "space-between", marginBottom: "14px", flexWrap: "wrap", alignItems: "center" }}>
								<label style={{ display: "flex", alignItems: "center", gap: "8px", color: "#8f9aaa", fontSize: "0.85rem" }}>
									Category
									<select
										id="filter-category"
										value={filterCategory}
										onChange={(e) => {
											setFilterCategory(e.currentTarget.value);
											setCurrentPage(1);
										}}
										style={{
											background: "#191e29",
											border: "1px solid #2a3342",
											borderRadius: "8px",
											color: "#f2f5f8",
											font: "inherit",
											padding: "8px 10px",
										}}
									>
										<option value="">All categories</option>
										{categories.map((cat) => (
											<option key={cat} value={cat}>
												{cat}
											</option>
										))}
									</select>
								</label>
								<div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
									<label style={{ display: "flex", alignItems: "center", gap: "6px", color: "#8f9aaa", fontSize: "0.85rem" }}>
										Show
										<select
											value={recordsPerPage}
											onChange={(e) => {
												setRecordsPerPage(Number(e.currentTarget.value));
												setCurrentPage(1);
											}}
											style={{
												background: "#191e29",
												border: "1px solid #2a3342",
												borderRadius: "8px",
												color: "#f2f5f8",
												font: "inherit",
												padding: "6px 8px",
											}}
										>
											<option value="15">15</option>
											<option value="30">30</option>
											<option value="50">50</option>
										</select>
										per page
									</label>
									<span style={{ color: "#8f9aaa", fontSize: "0.85rem" }} aria-live="polite">
										{selectedIds.size} selected
									</span>
									<button
										type="button"
										onClick={() => setShowAddModal(true)}
										title="Add new prompt"
										aria-label="Add new prompt"
										style={{
											background: "#78e6c0",
											border: 0,
											borderRadius: "8px",
											color: "#082019",
											cursor: "pointer",
											font: "inherit",
											fontWeight: "700",
											padding: "9px 12px",
											width: "38px",
											height: "38px",
											display: "flex",
											alignItems: "center",
											justifyContent: "center",
										}}
									>
										➕
									</button>
									<button
										type="button"
										onClick={toggleViewMode}
										title={getViewToggleLabel()}
										aria-label={getViewToggleLabel()}
										style={{
											alignItems: "center",
											background: "#252d3a",
											border: "1px solid #2a3342",
											borderRadius: "8px",
											color: "#f2f5f8",
											cursor: "pointer",
											display: "inline-flex",
											font: "inherit",
											height: "38px",
											justifyContent: "center",
											padding: "8px",
											width: "38px",
										}}
									>
										{getViewToggleIcon()}
									</button>
									<button
										type="button"
										onClick={() => setViewMultiplePrompts(true)}
										disabled={selectedIds.size === 0}
										title="View selected prompts"
										aria-label="View selected prompts"
										style={{
											background: "#252d3a",
											border: "1px solid #2a3342",
											borderRadius: "8px",
											color: "#f2f5f8",
											cursor: "pointer",
											font: "inherit",
											padding: "9px 12px",
											width: "38px",
											height: "38px",
											display: "flex",
											alignItems: "center",
											justifyContent: "center",
										}}
									>
										👁
									</button>
									<button
										type="button"
										onClick={downloadPrompts}
										disabled={selectedIds.size === 0}
										title="Download selected prompts as text file"
										aria-label="Download selected prompts"
										style={{
											background: "#78e6c0",
											border: 0,
											borderRadius: "8px",
											color: "#082019",
											cursor: "pointer",
											font: "inherit",
											padding: "9px 12px",
											width: "38px",
											height: "38px",
											display: "flex",
											alignItems: "center",
											justifyContent: "center",
										}}
									>
										⬇️
									</button>
									<button
										type="button"
										onClick={handleDeleteSelected}
										disabled={selectedIds.size === 0}
										title="Delete selected prompts"
										aria-label="Delete selected prompts"
										style={{
											background: selectedIds.size === 0 ? "#3a1f2a" : "#ff8d9b",
											border: "1px solid " + (selectedIds.size === 0 ? "#a85467" : "#ff8d9b"),
											borderRadius: "8px",
											color: selectedIds.size === 0 ? "#ffb0ba" : "#2b0710",
											cursor: "pointer",
											font: "inherit",
											padding: "9px 12px",
											width: "38px",
											height: "38px",
											display: "flex",
											alignItems: "center",
											justifyContent: "center",
										}}
									>
										🗑
									</button>
								</div>
							</div>

							{error && <div style={{ color: "#ff8d9b", marginBottom: "16px", fontSize: "0.9rem" }}>{error}</div>}

							{/* Table */}
							{renderTable()}

							{/* Pagination */}
							{filteredPrompts.length > recordsPerPage && (
								<div style={{ display: "flex", gap: "10px", justifyContent: "center", marginTop: "18px", alignItems: "center" }}>
									<button
										type="button"
										disabled={validPage === 1}
										onClick={() => setCurrentPage(Math.max(1, validPage - 1))}
										title="Previous page"
										aria-label="Previous page"
										style={{
											background: "#252d3a",
											border: "1px solid #2a3342",
											borderRadius: "7px",
											color: "#f2f5f8",
											cursor: "pointer",
											font: "inherit",
											padding: "7px 10px",
										}}
									>
										⬅️
									</button>
									<span style={{ color: "#8f9aaa", fontSize: "0.8rem" }} aria-live="polite">
										Page {validPage} of {totalPages}
									</span>
									<button
										type="button"
										disabled={validPage === totalPages}
										onClick={() => setCurrentPage(Math.min(totalPages, validPage + 1))}
										title="Next page"
										aria-label="Next page"
										style={{
											background: "#252d3a",
											border: "1px solid #2a3342",
											borderRadius: "7px",
											color: "#f2f5f8",
											cursor: "pointer",
											font: "inherit",
											padding: "7px 10px",
										}}
									>
										➡️
									</button>
								</div>
							)}
						</section>
					</div>
				)}
			</div>

			{/* Delete Confirmation Dialog */}
			{deleteConfirm && (
				<dialog
					open
					style={{
						position: "fixed",
						top: "50%",
						left: "50%",
						transform: "translate(-50%, -50%)",
						background: "#131720",
						border: "1px solid #2a3342",
						borderRadius: "14px",
						boxShadow: "0 24px 80px rgba(0, 0, 0, 0.5)",
						padding: "24px",
						maxWidth: "min(420px, calc(100vw - 32px))",
						width: "100%",
						zIndex: 1001,
					}}
				>
					<h2 style={{ fontSize: "1.15rem", margin: "0 0 8px", color: "#f2f5f8" }}>
						{deleteConfirm.id ? "Delete saved prompt?" : `Delete ${deleteConfirm.count} saved prompts?`}
					</h2>
					<p style={{ color: "#8f9aaa", lineHeight: 1.5, margin: 0 }}>
						{deleteConfirm.id
							? "This will permanently delete the prompt and all of its stored reference images."
							: `This will permanently delete ${deleteConfirm.count} prompts and all of their stored reference images.`}
					</p>
					<div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "22px" }}>
						<button
							type="button"
							disabled={deleteConfirmLoading}
							onClick={() => setDeleteConfirm(null)}
							title="Cancel"
							aria-label="Cancel"
							style={{
								background: "#252d3a",
								border: "1px solid #2a3342",
								borderRadius: "7px",
								cursor: "pointer",
								font: "inherit",
								fontWeight: "700",
								width: "38px",
								height: "38px",
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								color: "#f2f5f8",
								fontSize: "20px",
							}}
						>
							⊗
						</button>
						<button
							type="button"
							disabled={deleteConfirmLoading}
							onClick={confirmDelete}
							style={{
								background: "#ff8d9b",
								border: "1px solid #ff8d9b",
								borderRadius: "7px",
								cursor: "pointer",
								font: "inherit",
								fontWeight: "700",
								padding: "9px 13px",
								color: "#2b0710",
							}}
						>
							{deleteConfirmLoading ? "Deleting..." : "Delete"}
						</button>
					</div>
				</dialog>
			)}

			{deleteConfirm && (
				<div
					style={{
						position: "fixed",
						top: 0,
						left: 0,
						right: 0,
						bottom: 0,
						background: "rgba(4, 6, 10, 0.72)",
						zIndex: 1000,
					}}
					onClick={() => !deleteConfirmLoading && setDeleteConfirm(null)}
				/>
			)}

			{/* View Prompt Modal */}
			{viewPrompt && (
				<>
					<div
						style={{
							position: "fixed",
							top: 0,
							left: 0,
							right: 0,
							bottom: 0,
							background: "rgba(4, 6, 10, 0.72)",
							zIndex: 1000,
						}}
						onClick={() => setViewPrompt(null)}
					/>
					<dialog
						open
						style={{
							position: "fixed",
							top: "50%",
							left: "50%",
							transform: "translate(-50%, -50%)",
							background: "#131720",
							border: "1px solid #2a3342",
							borderRadius: "14px",
							boxShadow: "0 24px 80px rgba(0, 0, 0, 0.5)",
							padding: "24px",
							maxWidth: "min(600px, calc(100vw - 32px))",
							width: "100%",
							maxHeight: "80vh",
							overflow: "auto",
							zIndex: 1001,
						}}
					>
						<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
							<h2 style={{ fontSize: "1.15rem", margin: 0, color: "#f2f5f8" }}>View prompt</h2>
							<button
								type="button"
								onClick={() => setViewPrompt(null)}
								style={{
									background: "transparent",
									border: "none",
									color: "#8f9aaa",
									fontSize: "24px",
									cursor: "pointer",
									padding: 0,
									lineHeight: 1,
								}}
								aria-label="Close"
							>
								✕
							</button>
						</div>

						{/* Image preview */}
						{viewPrompt.image_path && imagePathsForRecord(viewPrompt.image_path)[0] && (
							<div style={{ marginBottom: "16px" }}>
								<img
									src={`https://sdk.satheshdeveloper.workers.dev/api/image-prompts/image?key=${encodeURIComponent(imagePathsForRecord(viewPrompt.image_path)[0])}`}
									alt="Preview"
									style={{ width: "100%", maxHeight: "300px", borderRadius: 8, objectFit: "cover", border: "1px solid #2a3342" }}
								/>
							</div>
						)}

						{/* Full prompt text */}
						<div style={{ marginBottom: "16px" }}>
							<div style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#8f9aaa", marginBottom: "8px" }}>
								Prompt
							</div>
							<div
								style={{
									background: "#0b0d12",
									border: "1px solid #2a3342",
									borderRadius: "8px",
									padding: "12px",
									color: "#f2f5f8",
									fontSize: "0.85rem",
									lineHeight: "1.6",
									whiteSpace: "pre-wrap",
									wordBreak: "break-word",
									maxHeight: "300px",
									overflow: "auto",
								}}
							>
								{viewPrompt.prompt}
							</div>
						</div>

						{/* Category */}
						<div style={{ marginBottom: "16px" }}>
							<div style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#8f9aaa", marginBottom: "6px" }}>
								Category
							</div>
							<div style={{ color: "#f2f5f8", fontSize: "0.85rem" }}>{viewPrompt.category || "—"}</div>
						</div>

						{/* Created date */}
						<div style={{ marginBottom: "20px" }}>
							<div style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#8f9aaa", marginBottom: "6px" }}>
								Created
							</div>
							<div style={{ color: "#f2f5f8", fontSize: "0.85rem" }}>
								{new Date(`${viewPrompt.created_at}Z`).toLocaleString()}
							</div>
						</div>

						{/* Close button */}
						<div style={{ display: "flex", justifyContent: "flex-end" }}>
							<button
								type="button"
								onClick={() => setViewPrompt(null)}
								title="Close dialog"
								aria-label="Close dialog"
								style={{
									background: "#252d3a",
									border: "1px solid #2a3342",
									borderRadius: "7px",
									cursor: "pointer",
									font: "inherit",
									fontWeight: "700",
									width: "38px",
									height: "38px",
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
									color: "#f2f5f8",
									fontSize: "20px",
								}}
							>
								✕
							</button>
						</div>
					</dialog>
				</>
			)}

			{/* View Multiple Prompts Modal */}
			{viewMultiplePrompts && (
				<>
					<div
						style={{
							position: "fixed",
							top: 0,
							left: 0,
							right: 0,
							bottom: 0,
							background: "rgba(4, 6, 10, 0.72)",
							zIndex: 1000,
						}}
						onClick={() => setViewMultiplePrompts(false)}
					/>
					<dialog
						open
						style={{
							position: "fixed",
							top: "50%",
							left: "50%",
							transform: "translate(-50%, -50%)",
							background: "#131720",
							border: "1px solid #2a3342",
							borderRadius: "14px",
							boxShadow: "0 24px 80px rgba(0, 0, 0, 0.5)",
							padding: "24px",
							maxWidth: "min(760px, calc(100vw - 32px))",
							width: "100%",
							maxHeight: "calc(100vh - 32px)",
							overflow: "auto",
							zIndex: 1001,
							display: "flex",
							flexDirection: "column",
						}}
					>
						<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
							<h2 style={{ fontSize: "1.15rem", margin: 0, color: "#f2f5f8" }}>Selected prompts</h2>
							<button
								type="button"
								onClick={() => setViewMultiplePrompts(false)}
								style={{
									background: "transparent",
									border: "none",
									color: "#8f9aaa",
									fontSize: "24px",
									cursor: "pointer",
									padding: 0,
									lineHeight: 1,
								}}
								aria-label="Close"
							>
								✕
							</button>
						</div>

						<p style={{ color: "#8f9aaa", fontSize: "0.85rem", margin: "0 0 16px" }}>
							{selectedIds.size} prompt{selectedIds.size === 1 ? "" : "s"}, formatted as downloaded
						</p>

						<textarea
							readOnly
							value={Array.from(selectedIds)
								.map((id) => savedPrompts.find((p) => p.id === id))
								.filter((p): p is SavedPrompt => !!p)
								.map((p) => promptAsSingleSentence(p.prompt))
								.filter(Boolean)
								.join("\n\n")}
							style={{
								background: "#191e29",
								border: "1px solid #2a3342",
								borderRadius: "8px",
								padding: "12px",
								color: "#f2f5f8",
								fontSize: "0.85rem",
								lineHeight: "1.5",
								fontFamily: '"Consolas", monospace',
								flex: "1 1 auto",
								minHeight: "200px",
								resize: "vertical",
								marginBottom: "16px",
							}}
							aria-label="Selected prompts"
						/>

						<div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
							<button
								type="button"
								onClick={async () => {
									const text = Array.from(selectedIds)
										.map((id) => savedPrompts.find((p) => p.id === id))
										.filter((p): p is SavedPrompt => !!p)
										.map((p) => promptAsSingleSentence(p.prompt))
										.filter(Boolean)
										.join("\n\n");
									try {
										await navigator.clipboard.writeText(text);
										setError("Prompts copied to clipboard");
										setTimeout(() => setError(""), 2000);
									} catch {
										setError("Failed to copy prompts");
									}
								}}
								title="Copy prompts to clipboard"
								aria-label="Copy prompts to clipboard"
								style={{
									background: "#78e6c0",
									border: "1px solid #78e6c0",
									borderRadius: "7px",
									cursor: "pointer",
									font: "inherit",
									fontWeight: "700",
									padding: "9px 13px",
									color: "#082019",
									width: "38px",
									height: "38px",
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
								}}
							>
								📋
							</button>
							<button
								type="button"
								onClick={() => setViewMultiplePrompts(false)}
								title="Close dialog"
								aria-label="Close dialog"
								style={{
									background: "#252d3a",
									border: "1px solid #2a3342",
									borderRadius: "7px",
									cursor: "pointer",
									font: "inherit",
									fontWeight: "700",
									width: "38px",
									height: "38px",
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
									color: "#f2f5f8",
									fontSize: "20px",
								}}
							>
								✕
							</button>
						</div>
					</dialog>
				</>
			)}

			{/* Selection Scope Dialog */}
			{showSelectionScopeDialog && (
				<>
					<div
						style={{
							position: "fixed",
							top: 0,
							left: 0,
							right: 0,
							bottom: 0,
							background: "rgba(4, 6, 10, 0.72)",
							zIndex: 1000,
						}}
						onClick={() => setShowSelectionScopeDialog(false)}
					/>
					<dialog
						open
						style={{
							position: "fixed",
							top: "50%",
							left: "50%",
							transform: "translate(-50%, -50%)",
							background: "#131720",
							border: "1px solid #2a3342",
							borderRadius: "14px",
							boxShadow: "0 24px 80px rgba(0, 0, 0, 0.5)",
							padding: "24px",
							maxWidth: "min(420px, calc(100vw - 32px))",
							width: "100%",
							zIndex: 1001,
						}}
					>
						<h2 style={{ fontSize: "1.15rem", margin: "0 0 8px", color: "#f2f5f8" }}>Select prompts</h2>
						<p style={{ color: "#8f9aaa", lineHeight: "1.5", margin: 0 }}>
							Select {pagedPrompts.length} prompt{pagedPrompts.length === 1 ? "" : "s"} on this page, or all {filteredPrompts.length} prompt{filteredPrompts.length === 1 ? "" : "s"} across every filtered page.
						</p>
						<div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "22px" }}>
							<button
								type="button"
								onClick={() => setShowSelectionScopeDialog(false)}
								title="Cancel selection"
								aria-label="Cancel selection"
								style={{
									background: "#252d3a",
									border: "1px solid #2a3342",
									borderRadius: "7px",
									cursor: "pointer",
									font: "inherit",
									fontWeight: "700",
									width: "38px",
									height: "38px",
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
									color: "#f2f5f8",
									fontSize: "20px",
								}}
							>
								⊗
							</button>
							<button
								type="button"
								onClick={() => handleSelectionScopeChoice("current")}
								style={{
									background: "#252d3a",
									border: "1px solid #2a3342",
									borderRadius: "7px",
									cursor: "pointer",
									font: "inherit",
									fontWeight: "700",
									padding: "9px 13px",
									color: "#f2f5f8",
									display: "flex",
									alignItems: "center",
									gap: "6px",
								}}
							>
								<span>📄</span> {pagedPrompts.length}
							</button>
							<button
								type="button"
								onClick={() => handleSelectionScopeChoice("all")}
								style={{
									background: "#78e6c0",
									border: "1px solid #78e6c0",
									borderRadius: "7px",
									cursor: "pointer",
									font: "inherit",
									fontWeight: "700",
									padding: "9px 13px",
									color: "#082019",
									display: "flex",
									alignItems: "center",
									gap: "6px",
								}}
							>
								<span>📋</span> {filteredPrompts.length}
							</button>
						</div>
					</dialog>
				</>
			)}

			{/* Modal Form */}
			{showAddModal && (
				<div
					style={{
						position: "fixed",
						top: 0,
						left: 0,
						right: 0,
						bottom: 0,
						background: "rgba(0, 0, 0, 0.6)",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						zIndex: 1002,
						padding: "20px",
					}}
					onClick={() => setShowAddModal(false)}
				>
					<div
						style={{
							background: "#131720",
							borderRadius: "14px",
							border: "1px solid #2a3342",
							padding: "24px",
							maxWidth: "600px",
							width: "100%",
							maxHeight: "90vh",
							overflow: "auto",
							boxShadow: "0 20px 60px rgba(0, 0, 0, 0.24)",
						}}
						onClick={(e) => e.stopPropagation()}
					>
						<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
							<h2 style={{ margin: 0, fontSize: "0.85rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "#f2f5f8" }}>Save prompt</h2>
							<button
								type="button"
								onClick={() => setShowAddModal(false)}
								style={{
									background: "transparent",
									border: "none",
									color: "#8f9aaa",
									fontSize: "24px",
									cursor: "pointer",
									padding: 0,
									lineHeight: 1,
								}}
								aria-label="Close"
							>
								×
							</button>
						</div>

						<form onSubmit={handleSavePrompt} onPaste={handlePaste}>
							<label style={{ display: "block", margin: "0 0 7px", color: "#8f9aaa", fontSize: "0.85rem" }} htmlFor="modalImages">
								Reference image(s)
							</label>
							<label
								htmlFor="modalImageInput"
								style={{
									alignItems: "center",
									background: "#191e29",
									border: "1px dashed #435063",
									borderRadius: "12px",
									cursor: "pointer",
									display: "flex",
									justifyContent: "center",
									minHeight: "80px",
									padding: "12px",
									textAlign: "center",
									transition: "160ms ease",
									marginBottom: "12px",
								}}
								onDragOver={(e) => {
									e.preventDefault();
									e.currentTarget.style.borderColor = "#78e6c0";
									e.currentTarget.style.background = "#202a36";
								}}
								onDragLeave={(e) => {
									e.currentTarget.style.borderColor = "#435063";
									e.currentTarget.style.background = "#191e29";
								}}
								onDrop={(e) => {
									e.preventDefault();
									e.currentTarget.style.borderColor = "#435063";
									e.currentTarget.style.background = "#191e29";
									if (e.dataTransfer.files) {
										setImageFiles(Array.from(e.dataTransfer.files));
									}
								}}
							>
								<div>
									<strong style={{ display: "block", marginBottom: "4px", color: "#f2f5f8", fontSize: "0.9rem" }}>Upload reference images</strong>
									<span style={{ color: "#8f9aaa", fontSize: "0.75rem" }}>Click to browse or paste from clipboard</span>
									<input
										id="modalImageInput"
										ref={imageInputRef}
										type="file"
										accept="image/jpeg,image/png,image/webp"
										multiple
										onChange={handleImageInput}
										style={{ height: 1, opacity: 0, position: "absolute", width: 1 }}
									/>
								</div>
							</label>
							{manualImages.length > 0 && (
								<>
									<div style={{ alignItems: "center", display: "flex", gap: "8px", justifyContent: "space-between", marginBottom: "12px" }}>
										<span style={{ color: "#8f9aaa", fontSize: "0.8rem" }} aria-live="polite">
											{manualImages.length} image{manualImages.length === 1 ? "" : "s"} selected
										</span>
										<button
											type="button"
											onClick={() => {
												setManualImages([]);
												if (imageInputRef.current) imageInputRef.current.value = "";
											}}
											title="Clear selected images"
											aria-label="Clear selected images"
											style={{
												background: "#252d3a",
												border: "1px solid #2a3342",
												borderRadius: "6px",
												cursor: "pointer",
												color: "#f2f5f8",
												fontFamily: "inherit",
												fontSize: "14px",
												width: "32px",
												height: "32px",
												display: "flex",
												alignItems: "center",
												justifyContent: "center",
											}}
										>
											🗑
										</button>
									</div>
									<div style={{ display: "grid", gap: "8px", gridTemplateColumns: "repeat(auto-fit, minmax(70px, 1fr))", marginBottom: "16px" }}>
										{manualImages.map((file, idx) => (
											<div key={idx} style={{ position: "relative" }}>
												<img
													src={URL.createObjectURL(file)}
													alt={`Preview ${idx + 1}`}
													style={{ width: "100%", height: "80px", borderRadius: "6px", objectFit: "cover", border: "1px solid #2a3342" }}
												/>
											</div>
										))}
									</div>
								</>
							)}

							<label style={{ display: "block", margin: "16px 0 7px", color: "#8f9aaa", fontSize: "0.85rem" }} htmlFor="modalPrompt">
								Description / prompt
							</label>
							<textarea
								id="modalPrompt"
								value={manualPrompt}
								onChange={(e) => setManualPrompt(e.currentTarget.value)}
								placeholder="Enter the image description or generation prompt..."
								autoFocus
								required
								style={{
									width: "100%",
									minHeight: "150px",
									padding: "10px 12px",
									border: "1px solid #2a3342",
									borderRadius: "8px",
									background: "#191e29",
									color: "#f2f5f8",
									fontFamily: "inherit",
									fontSize: "0.95rem",
									marginBottom: "16px",
									boxSizing: "border-box",
									resize: "vertical",
								}}
							/>

							<label style={{ display: "block", margin: "18px 0 7px", color: "#8f9aaa", fontSize: "0.85rem" }} htmlFor="modalCategory">
								Category
							</label>
							<input
								id="modalCategory"
								type="text"
								list="modalCategorySuggestions"
								value={manualCategory}
								onChange={(e) => setManualCategory(e.currentTarget.value)}
								placeholder="Optional category"
								style={{
									width: "100%",
									padding: "10px 12px",
									border: "1px solid #2a3342",
									borderRadius: "8px",
									background: "#191e29",
									color: "#f2f5f8",
									fontFamily: "inherit",
									fontSize: "0.95rem",
									marginBottom: "20px",
									boxSizing: "border-box",
								}}
							/>
							<datalist id="modalCategorySuggestions">
								{categorySuggestions.map((suggestion) => (
									<option key={suggestion} value={suggestion} />
								))}
							</datalist>

							<div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
								<button
									type="button"
									onClick={() => setShowAddModal(false)}
									title="Cancel"
									aria-label="Cancel"
									style={{
										background: "#252d3a",
										border: "1px solid #2a3342",
										borderRadius: "7px",
										cursor: "pointer",
										font: "inherit",
										fontWeight: "700",
										width: "38px",
										height: "38px",
										display: "flex",
										alignItems: "center",
										justifyContent: "center",
										color: "#f2f5f8",
										fontSize: "20px",
									}}
								>
									⊗
								</button>
								<button
									type="submit"
									disabled={savingPrompt || !manualPrompt.trim() || manualImages.length === 0}
									title={savingPrompt ? "Saving..." : !manualPrompt.trim() ? "Enter a prompt" : manualImages.length === 0 ? "Add at least one image" : "Save prompt"}
									aria-label={savingPrompt ? "Saving..." : !manualPrompt.trim() ? "Enter a prompt" : manualImages.length === 0 ? "Add at least one image" : "Save prompt"}
									style={{
										background: savingPrompt || !manualPrompt.trim() || manualImages.length === 0 ? "rgba(120, 230, 192, 0.45)" : "#78e6c0",
										border: 0,
										borderRadius: "7px",
										cursor: "pointer",
										font: "inherit",
										fontWeight: "700",
										width: "38px",
										height: "38px",
										display: "flex",
										alignItems: "center",
										justifyContent: "center",
										color: "#082019",
										fontSize: "20px",
									}}
								>
									{savingPrompt ? "⏳" : "✓"}
								</button>
							</div>
						</form>
					</div>
				</div>
			)}
		</div>
	);
}
